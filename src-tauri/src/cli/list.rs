use chrono::Utc;
use serde::Serialize;
use serde_json::Value;

use crate::commands::multi_provider;

use super::args::{ListArgs, ListCommand, ProjectListArgs, ProviderListArgs, SessionListArgs};
use super::output::CliError;
use super::project_match;
use super::providers;
use super::time_filter::{parse_rfc3339_opt, TimeRange};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub offset: usize,
    pub limit: usize,
    pub returned: usize,
    pub has_more: bool,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub pagination: Pagination,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectItem {
    pub provider: String,
    pub project_path: String,
    pub actual_project_path: String,
    pub name: String,
    pub session_count: usize,
    pub message_count: usize,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionItem {
    pub provider: String,
    pub session_path: String,
    pub project_path: String,
    pub actual_project_path: String,
    pub summary: Option<String>,
    pub message_count: usize,
    pub first_message_time: String,
    pub last_message_time: String,
    pub last_modified: String,
}

pub fn handle_list(args: ListArgs) -> Result<Value, CliError> {
    match args.command {
        ListCommand::Providers(args) => list_providers(args),
        ListCommand::Projects(args) => list_projects(args),
        ListCommand::Sessions(args) => list_sessions_placeholder(args),
    }
}

fn list_providers(_args: ProviderListArgs) -> Result<Value, CliError> {
    serde_json::to_value(serde_json::json!({
        "items": providers::supported_provider_infos()
    }))
    .map_err(|e| CliError::internal(format!("Failed to serialize providers: {e}")))
}

fn list_projects(args: ProjectListArgs) -> Result<Value, CliError> {
    let provider_scope =
        providers::resolve_provider_scope(&args.providers, args.providers_csv.as_deref())?;
    let time_range =
        TimeRange::from_args(args.since.as_deref(), args.until.as_deref(), Utc::now())?;
    let active_providers = Some(provider_scope);
    let projects = tauri::async_runtime::block_on(multi_provider::scan_all_projects_with_options(
        None,
        active_providers,
        None,
        None,
        None,
        !args.no_cache,
    ))
    .map_err(CliError::internal)?;

    let mut items: Vec<ProjectItem> = projects
        .into_iter()
        .filter(|project| {
            parse_rfc3339_opt(&project.last_modified)
                .map(|timestamp| time_range.contains(timestamp))
                .unwrap_or(true)
        })
        .map(|project| ProjectItem {
            provider: project.provider.unwrap_or_else(|| "claude".to_string()),
            project_path: project.path,
            actual_project_path: project.actual_path,
            name: project.name,
            session_count: project.session_count,
            message_count: project.message_count,
            last_modified: project.last_modified,
        })
        .collect();

    sort_projects_desc(&mut items);
    serde_json::to_value(paginate(items, args.offset, args.limit))
        .map_err(|e| CliError::internal(format!("Failed to serialize projects: {e}")))
}

fn list_sessions_placeholder(args: SessionListArgs) -> Result<Value, CliError> {
    let provider_scope =
        providers::resolve_provider_scope(&args.providers, args.providers_csv.as_deref())?;
    let time_range =
        TimeRange::from_args(args.since.as_deref(), args.until.as_deref(), Utc::now())?;
    let projects = tauri::async_runtime::block_on(multi_provider::scan_all_projects_with_options(
        None,
        Some(provider_scope.clone()),
        None,
        None,
        None,
        !args.no_cache,
    ))
    .map_err(CliError::internal)?;

    let matched_projects = resolve_session_projects(&args, &projects)?;
    let mut items = Vec::new();

    for project in matched_projects {
        let provider = project
            .provider
            .clone()
            .unwrap_or_else(|| "claude".to_string());
        let sessions = tauri::async_runtime::block_on(multi_provider::load_provider_sessions(
            provider.clone(),
            project.path.clone(),
            Some(false),
        ))
        .map_err(CliError::internal)?;

        for session in sessions {
            if !session_in_range(
                &session.last_message_time,
                &session.last_modified,
                &time_range,
            ) {
                continue;
            }
            items.push(SessionItem {
                provider: session.provider.unwrap_or(provider.clone()),
                session_path: session.file_path,
                project_path: project.path.clone(),
                actual_project_path: project.actual_path.clone(),
                summary: session.summary,
                message_count: session.message_count,
                first_message_time: session.first_message_time,
                last_message_time: session.last_message_time,
                last_modified: session.last_modified,
            });
        }
    }

    sort_sessions_desc(&mut items);
    serde_json::to_value(paginate(items, args.offset, args.limit))
        .map_err(|e| CliError::internal(format!("Failed to serialize sessions: {e}")))
}

fn resolve_session_projects(
    args: &SessionListArgs,
    projects: &[crate::models::ClaudeProject],
) -> Result<Vec<crate::models::ClaudeProject>, CliError> {
    if args.current_project {
        let cwd = std::env::current_dir()
            .map_err(|e| CliError::internal(format!("Failed to read current directory: {e}")))?;
        return project_match::match_current_project(
            &cwd,
            projects,
            args.include_ancestor_projects,
        );
    }
    if let Some(actual_project_path) = &args.actual_project_path {
        return project_match::match_actual_project_path(actual_project_path, projects);
    }
    if let Some(project_path) = &args.project_path {
        return project_match::match_project_path(project_path, projects);
    }
    Ok(projects.to_vec())
}

fn session_in_range(last_message_time: &str, last_modified: &str, time_range: &TimeRange) -> bool {
    parse_rfc3339_opt(last_message_time)
        .or_else(|| parse_rfc3339_opt(last_modified))
        .map(|timestamp| time_range.contains(timestamp))
        .unwrap_or(true)
}

pub fn sort_projects_desc(items: &mut [ProjectItem]) {
    items.sort_by(|left, right| {
        match (
            parse_rfc3339_opt(&left.last_modified),
            parse_rfc3339_opt(&right.last_modified),
        ) {
            (Some(left_ts), Some(right_ts)) => right_ts.cmp(&left_ts),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => right.last_modified.cmp(&left.last_modified),
        }
    });
}

pub fn sort_sessions_desc(items: &mut [SessionItem]) {
    items.sort_by(|left, right| {
        let left_time = parse_rfc3339_opt(&left.last_message_time)
            .or_else(|| parse_rfc3339_opt(&left.last_modified));
        let right_time = parse_rfc3339_opt(&right.last_message_time)
            .or_else(|| parse_rfc3339_opt(&right.last_modified));
        match (left_time, right_time) {
            (Some(left_ts), Some(right_ts)) => right_ts.cmp(&left_ts),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => right.last_modified.cmp(&left.last_modified),
        }
    });
}

pub fn paginate<T>(items: Vec<T>, offset: usize, limit: usize) -> Page<T> {
    let total = items.len();
    let start = offset.min(total);
    let end = start.saturating_add(limit).min(total);
    let returned = end.saturating_sub(start);
    let has_more = end < total;
    let page_items = items.into_iter().skip(start).take(returned).collect();
    Page {
        items: page_items,
        pagination: Pagination {
            offset,
            limit,
            returned,
            has_more,
            next_offset: has_more.then_some(end),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paginates_items_and_reports_has_more() {
        let items = vec![1, 2, 3];
        let page = paginate(items, 0, 2);
        assert_eq!(page.items, vec![1, 2]);
        assert!(page.pagination.has_more);
        assert_eq!(page.pagination.next_offset, Some(2));
    }

    fn session(path: &str, last_message_time: &str) -> SessionItem {
        SessionItem {
            provider: "codex".to_string(),
            session_path: path.to_string(),
            project_path: "codex:///repo".to_string(),
            actual_project_path: "/repo".to_string(),
            summary: None,
            message_count: 1,
            first_message_time: last_message_time.to_string(),
            last_message_time: last_message_time.to_string(),
            last_modified: last_message_time.to_string(),
        }
    }

    #[test]
    fn session_items_sort_newest_first_before_pagination() {
        let mut sessions = vec![
            session("old", "2026-01-01T00:00:00Z"),
            session("new", "2026-04-01T00:00:00Z"),
        ];
        sort_sessions_desc(&mut sessions);
        assert_eq!(sessions[0].session_path, "new");
    }
}
