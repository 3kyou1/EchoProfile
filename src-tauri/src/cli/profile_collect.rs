use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::Serialize;
use serde_json::Value;

use crate::commands::multi_provider;
use crate::models::{ClaudeProject, ClaudeSession};

use super::args::{CollectArgs, CollectScope, SampleStrategy};
use super::output::CliError;
use super::paste_filter::{should_filter_paste_like, PasteFilterConfig};
use super::project_match;
use super::providers;
use super::sampling::{select_messages, MessageCandidate, OmittedCounts, SamplingConfig};
use super::text_extract::extract_user_text;
use super::time_filter::{parse_rfc3339_opt, TimeRange};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectResponse {
    pub config: CollectConfigEcho,
    pub messages: Vec<CollectMessage>,
    pub used_chars: usize,
    pub omitted: OmittedCounts,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectConfigEcho {
    pub scope: String,
    pub sample: String,
    pub budget_chars: usize,
    pub paste_detect_min_chars: usize,
    pub paste_like_threshold: f64,
    pub include_paste_like: bool,
    pub providers: Vec<String>,
    pub matched_projects: Vec<MatchedProject>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedProject {
    pub provider: String,
    pub project_path: String,
    pub actual_project_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectMessage {
    pub provider: String,
    pub role: String,
    pub timestamp: String,
    pub session_path: String,
    pub project_path: String,
    pub actual_project_path: String,
    pub text: String,
}

pub fn handle_collect(args: CollectArgs) -> Result<Value, CliError> {
    validate_collect_args(&args)?;
    let response = collect(args)?;
    serde_json::to_value(response).map_err(|e| {
        CliError::internal(format!("Failed to serialize profile collect response: {e}"))
    })
}

pub fn validate_collect_args(args: &CollectArgs) -> Result<(), CliError> {
    match args.scope {
        CollectScope::Global => Ok(()),
        CollectScope::Project => {
            let locator_count = usize::from(args.current_project)
                + usize::from(args.actual_project_path.is_some())
                + usize::from(args.project_path.is_some());
            if locator_count == 1 {
                Ok(())
            } else {
                Err(CliError::invalid_argument(
                    "Project scope requires exactly one of --current-project, --actual-project-path, or --project-path.",
                ))
            }
        }
        CollectScope::Session => {
            if args.session_path.is_some() {
                Ok(())
            } else {
                Err(CliError::invalid_argument(
                    "Session scope requires --session-path.",
                ))
            }
        }
    }
}

fn collect(args: CollectArgs) -> Result<CollectResponse, CliError> {
    let strategy = args.sample.unwrap_or_else(|| default_strategy(args.scope));
    let provider_scope =
        providers::resolve_provider_scope(&args.providers, args.providers_csv.as_deref())?;
    let time_range =
        TimeRange::from_args(args.since.as_deref(), args.until.as_deref(), Utc::now())?;
    let paste_config = PasteFilterConfig {
        min_chars: args.paste_detect_min_chars,
        threshold: args.paste_like_threshold,
        include_paste_like: args.include_paste_like,
    };

    let mut omitted = OmittedCounts::default();
    let (matched_projects, session_inputs) = resolve_session_inputs(&args, &provider_scope)?;
    let mut effective_providers: Vec<String> = session_inputs
        .iter()
        .map(|input| input.provider.clone())
        .collect();
    effective_providers.sort();
    effective_providers.dedup();
    let mut candidates = Vec::new();
    let mut scanned_sessions = 0usize;
    let mut scanned_messages = 0usize;

    for input in session_inputs {
        if scanned_sessions >= args.max_sessions_scan {
            omitted.scan_limit_sessions += 1;
            continue;
        }
        scanned_sessions += 1;

        let messages = tauri::async_runtime::block_on(multi_provider::load_provider_messages(
            input.provider.clone(),
            input.session_path.clone(),
        ))
        .map_err(CliError::internal)?;

        let session_last_timestamp =
            parse_rfc3339_opt(&input.session_last_time).unwrap_or_else(Utc::now);

        for (index, message) in messages.iter().enumerate() {
            if scanned_messages >= args.max_messages_scan {
                omitted.scan_limit_messages += 1;
                break;
            }
            let Some(timestamp) = parse_rfc3339_opt(&message.timestamp) else {
                continue;
            };
            if !time_range.contains(timestamp) {
                continue;
            }
            scanned_messages += 1;

            let Some(text) = extract_user_text(message) else {
                if message.role.as_deref() == Some("user") || message.message_type == "user" {
                    omitted.non_text_messages += 1;
                }
                continue;
            };

            let text_len = text.chars().count();
            if text_len > args.budget_chars {
                omitted.single_message_over_budget += 1;
                continue;
            }
            if should_filter_paste_like(&text, &paste_config) {
                omitted.paste_like += 1;
                continue;
            }

            candidates.push(MessageCandidate {
                id: format!("{}:{}:{index}", input.provider, input.session_path),
                provider: input.provider.clone(),
                session_path: input.session_path.clone(),
                project_path: input.project_path.clone(),
                actual_project_path: input.actual_project_path.clone(),
                timestamp,
                session_last_timestamp,
                text,
            });
        }
    }

    let mut sampled = select_messages(
        candidates,
        SamplingConfig {
            budget_chars: args.budget_chars,
            strategy,
        },
    );
    omitted.add_assign(&sampled.omitted);

    if sampled.messages.is_empty() {
        return Err(CliError::new(
            "NO_MESSAGES_FOUND",
            "No user messages remained after filtering.",
        )
        .with_details(serde_json::json!({ "omitted": omitted })));
    }

    let messages = sampled
        .messages
        .drain(..)
        .map(|message| CollectMessage {
            provider: message.provider,
            role: "user".to_string(),
            timestamp: message.timestamp.to_rfc3339(),
            session_path: message.session_path,
            project_path: message.project_path,
            actual_project_path: message.actual_project_path,
            text: message.text,
        })
        .collect();

    Ok(CollectResponse {
        config: CollectConfigEcho {
            scope: scope_name(args.scope).to_string(),
            sample: sample_name(strategy).to_string(),
            budget_chars: args.budget_chars,
            paste_detect_min_chars: args.paste_detect_min_chars,
            paste_like_threshold: args.paste_like_threshold,
            include_paste_like: args.include_paste_like,
            providers: effective_providers,
            matched_projects,
        },
        messages,
        used_chars: sampled.used_chars,
        omitted,
    })
}

#[derive(Debug, Clone)]
struct SessionInput {
    provider: String,
    session_path: String,
    project_path: String,
    actual_project_path: String,
    session_last_time: String,
}

fn resolve_session_inputs(
    args: &CollectArgs,
    provider_scope: &[String],
) -> Result<(Vec<MatchedProject>, Vec<SessionInput>), CliError> {
    match args.scope {
        CollectScope::Session => resolve_single_session(args, provider_scope),
        CollectScope::Global | CollectScope::Project => {
            resolve_project_sessions(args, provider_scope)
        }
    }
}

fn resolve_project_sessions(
    args: &CollectArgs,
    provider_scope: &[String],
) -> Result<(Vec<MatchedProject>, Vec<SessionInput>), CliError> {
    let projects = tauri::async_runtime::block_on(multi_provider::scan_all_projects_with_options(
        None,
        Some(provider_scope.to_vec()),
        None,
        None,
        None,
        !args.no_cache,
    ))
    .map_err(CliError::internal)?;

    let matched = match args.scope {
        CollectScope::Global => projects,
        CollectScope::Project if args.current_project => {
            let cwd = std::env::current_dir().map_err(|e| {
                CliError::internal(format!("Failed to read current directory: {e}"))
            })?;
            project_match::match_current_project(&cwd, &projects, args.include_ancestor_projects)?
        }
        CollectScope::Project => {
            if let Some(actual_project_path) = &args.actual_project_path {
                project_match::match_actual_project_path(actual_project_path, &projects)?
            } else if let Some(project_path) = &args.project_path {
                project_match::match_project_path(project_path, &projects)?
            } else {
                unreachable!("project args validated")
            }
        }
        CollectScope::Session => unreachable!(),
    };

    let matched_projects = matched.iter().map(matched_project).collect();
    let mut sessions = Vec::new();
    for project in matched {
        let provider = project
            .provider
            .clone()
            .unwrap_or_else(|| "claude".to_string());
        let provider_sessions =
            tauri::async_runtime::block_on(multi_provider::load_provider_sessions(
                provider.clone(),
                project.path.clone(),
                Some(false),
            ))
            .map_err(CliError::internal)?;
        sessions.extend(
            provider_sessions
                .into_iter()
                .map(|session| session_input(&provider, &project, &session)),
        );
    }
    Ok((matched_projects, sessions))
}

fn resolve_single_session(
    args: &CollectArgs,
    provider_scope: &[String],
) -> Result<(Vec<MatchedProject>, Vec<SessionInput>), CliError> {
    let session_path = args.session_path.as_ref().expect("session path validated");
    let provider = if provider_scope.len() == 1 {
        provider_scope[0].clone()
    } else {
        infer_provider_from_session_path(session_path).ok_or_else(|| {
            CliError::new(
                "PROVIDER_REQUIRED",
                "Could not infer provider from session path. Pass --provider.",
            )
        })?
    };
    validate_session_path_allowed(&provider, session_path)?;

    let context = find_session_context(&provider, session_path, !args.no_cache)?;
    let matched_projects = context
        .as_ref()
        .map(|(project, _)| vec![matched_project(project)])
        .unwrap_or_default();
    let input = if let Some((project, session)) = context {
        session_input(&provider, &project, &session)
    } else {
        SessionInput {
            provider,
            session_path: session_path.clone(),
            project_path: String::new(),
            actual_project_path: String::new(),
            session_last_time: Utc::now().to_rfc3339(),
        }
    };
    Ok((matched_projects, vec![input]))
}

fn find_session_context(
    provider: &str,
    session_path: &str,
    use_cache: bool,
) -> Result<Option<(ClaudeProject, ClaudeSession)>, CliError> {
    let projects = tauri::async_runtime::block_on(multi_provider::scan_all_projects_with_options(
        None,
        Some(vec![provider.to_string()]),
        None,
        None,
        None,
        use_cache,
    ))
    .map_err(CliError::internal)?;
    let target = canonical_string(session_path).unwrap_or_else(|| session_path.to_string());
    for project in projects {
        let sessions = tauri::async_runtime::block_on(multi_provider::load_provider_sessions(
            provider.to_string(),
            project.path.clone(),
            Some(false),
        ))
        .map_err(CliError::internal)?;
        for session in sessions {
            let current =
                canonical_string(&session.file_path).unwrap_or_else(|| session.file_path.clone());
            if current == target {
                return Ok(Some((project, session)));
            }
        }
    }
    Ok(None)
}

fn session_input(provider: &str, project: &ClaudeProject, session: &ClaudeSession) -> SessionInput {
    SessionInput {
        provider: session
            .provider
            .clone()
            .unwrap_or_else(|| provider.to_string()),
        session_path: session.file_path.clone(),
        project_path: project.path.clone(),
        actual_project_path: project.actual_path.clone(),
        session_last_time: session.last_message_time.clone(),
    }
}

fn matched_project(project: &ClaudeProject) -> MatchedProject {
    MatchedProject {
        provider: project
            .provider
            .clone()
            .unwrap_or_else(|| "claude".to_string()),
        project_path: project.path.clone(),
        actual_project_path: project.actual_path.clone(),
    }
}

fn infer_provider_from_session_path(session_path: &str) -> Option<String> {
    let path = session_path.to_lowercase();
    if path.contains("/.codex/") {
        Some("codex".to_string())
    } else if path.contains("/.claude/") {
        Some("claude".to_string())
    } else if path.contains("/.gemini/") {
        Some("gemini".to_string())
    } else if path.contains("/opencode/") {
        Some("opencode".to_string())
    } else if path.contains("/cursor/") {
        Some("cursor".to_string())
    } else if path.contains("/cline/") {
        Some("cline".to_string())
    } else {
        None
    }
}

fn validate_session_path_allowed(provider: &str, session_path: &str) -> Result<(), CliError> {
    let session = Path::new(session_path).canonicalize().map_err(|e| {
        CliError::new(
            "SESSION_NOT_FOUND",
            format!("Failed to resolve session path: {e}"),
        )
    })?;
    let roots = safe_roots(provider);
    for root in roots {
        if root.exists() {
            if let Ok(root) = root.canonicalize() {
                if session.starts_with(root) {
                    return Ok(());
                }
            }
        }
    }
    Err(CliError::new(
        "SESSION_PATH_NOT_ALLOWED",
        format!("Session path is outside {provider} history directories: {session_path}"),
    ))
}

fn safe_roots(provider: &str) -> Vec<PathBuf> {
    match provider {
        "codex" => crate::providers::codex::get_base_path()
            .map(|base| {
                let base = PathBuf::from(base);
                vec![base.join("sessions"), base.join("archived_sessions")]
            })
            .unwrap_or_default(),
        "claude" => crate::providers::claude::get_base_path()
            .map(|base| vec![PathBuf::from(base).join("projects")])
            .unwrap_or_default(),
        "gemini" => crate::providers::gemini::get_base_path()
            .map(|base| vec![PathBuf::from(base).join("tmp")])
            .unwrap_or_default(),
        "opencode" => crate::providers::opencode::get_base_path()
            .map(|base| vec![PathBuf::from(base).join("storage")])
            .unwrap_or_default(),
        "cursor" => crate::providers::cursor::get_base_path()
            .map(|base| vec![base.join("workspaceStorage"), base.join("globalStorage")])
            .unwrap_or_default(),
        "aider" | "cline" => providers::supported_provider_infos()
            .into_iter()
            .find(|info| info.provider == provider && info.is_available)
            .and_then(|info| info.base_path.map(PathBuf::from))
            .map(|root| vec![root])
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn canonical_string(path: &str) -> Option<String> {
    Path::new(path)
        .canonicalize()
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

fn default_strategy(scope: CollectScope) -> SampleStrategy {
    match scope {
        CollectScope::Global | CollectScope::Project => SampleStrategy::Mixed,
        CollectScope::Session => SampleStrategy::Chronological,
    }
}

fn scope_name(scope: CollectScope) -> &'static str {
    match scope {
        CollectScope::Global => "global",
        CollectScope::Project => "project",
        CollectScope::Session => "session",
    }
}

fn sample_name(sample: SampleStrategy) -> &'static str {
    match sample {
        SampleStrategy::Recent => "recent",
        SampleStrategy::Representative => "representative",
        SampleStrategy::Mixed => "mixed",
        SampleStrategy::Chronological => "chronological",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::args::{CollectArgs, CollectScope};

    fn base_args(scope: CollectScope) -> CollectArgs {
        CollectArgs {
            scope,
            providers: Vec::new(),
            providers_csv: None,
            current_project: false,
            include_ancestor_projects: false,
            actual_project_path: None,
            project_path: None,
            session_path: None,
            sample: None,
            budget_chars: 30_000,
            paste_detect_min_chars: 50,
            paste_like_threshold: 0.7,
            include_paste_like: false,
            since: None,
            until: None,
            max_sessions_scan: 1000,
            max_messages_scan: 50_000,
            no_cache: false,
        }
    }

    #[test]
    fn project_scope_requires_locator() {
        let args = base_args(CollectScope::Project);
        let err = validate_collect_args(&args).unwrap_err();
        assert_eq!(err.code(), "INVALID_ARGUMENT");
    }

    #[test]
    #[serial_test::serial]
    fn collect_session_reads_codex_fixture_user_messages() {
        let tmp = tempfile::TempDir::new().unwrap();
        let codex_home = tmp.path().join("codex-home");
        let sessions_dir = codex_home.join("sessions");
        std::fs::create_dir_all(&sessions_dir).unwrap();
        let rollout_path = sessions_dir.join("rollout-test.jsonl");
        let project_cwd = tmp.path().join("project");
        std::fs::create_dir_all(&project_cwd).unwrap();
        let lines = [
            serde_json::json!({
                "type": "session_meta",
                "payload": { "id": "session-1", "cwd": project_cwd.to_string_lossy() }
            }),
            serde_json::json!({
                "type": "response_item",
                "payload": {
                    "type": "message",
                    "role": "user",
                    "created_at": "2026-04-30T10:00:00Z",
                    "content": [{ "type": "input_text", "text": "请先讨论设计" }]
                }
            }),
        ];
        let content = lines
            .iter()
            .map(serde_json::Value::to_string)
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(&rollout_path, format!("{content}\n")).unwrap();

        let original = std::env::var_os("CODEX_HOME");
        std::env::set_var("CODEX_HOME", &codex_home);
        let mut args = base_args(CollectScope::Session);
        args.providers = vec!["codex".to_string()];
        args.session_path = Some(rollout_path.to_string_lossy().to_string());
        args.budget_chars = 1000;
        let value = handle_collect(args).unwrap();
        if let Some(original) = original {
            std::env::set_var("CODEX_HOME", original);
        } else {
            std::env::remove_var("CODEX_HOME");
        }

        assert_eq!(value["messages"][0]["text"], "请先讨论设计");
        assert_eq!(value["messages"][0]["provider"], "codex");
    }
}
