use serde::Serialize;

use super::output::CliError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpTopic {
    pub command: String,
    pub description: String,
    pub usage: String,
    pub options: Vec<HelpOption>,
    pub examples: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpOption {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_by_scope: Option<serde_json::Value>,
}

impl HelpOption {
    fn new(name: &str, description: &str) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            required: None,
            default: None,
            values: None,
            default_by_scope: None,
        }
    }

    fn required(mut self) -> Self {
        self.required = Some(true);
        self
    }

    fn default(mut self, value: serde_json::Value) -> Self {
        self.default = Some(value);
        self
    }

    fn values(mut self, values: &[&str]) -> Self {
        self.values = Some(values.iter().map(|v| (*v).to_string()).collect());
        self
    }

    fn default_by_scope(mut self, value: serde_json::Value) -> Self {
        self.default_by_scope = Some(value);
        self
    }
}

pub fn help_topic(topic: &[&str]) -> Result<HelpTopic, CliError> {
    match topic {
        [] => Ok(root_help()),
        ["list"] => Ok(list_help()),
        ["list", "providers"] => Ok(list_providers_help()),
        ["list", "projects"] => Ok(list_projects_help()),
        ["list", "sessions"] => Ok(list_sessions_help()),
        ["profile", "collect"] => Ok(profile_collect_help()),
        ["serve"] => Ok(serve_help()),
        _ => Err(CliError::unknown_command(format!(
            "Unknown help topic: {}",
            topic.join(" ")
        ))),
    }
}

pub fn help_topic_from_strings(topic: &[String]) -> Result<HelpTopic, CliError> {
    let refs: Vec<&str> = topic.iter().map(String::as_str).collect();
    help_topic(&refs)
}

fn root_help() -> HelpTopic {
    HelpTopic {
        command: "echo-profile".to_string(),
        description:
            "Machine-oriented CLI for EchoProfile history discovery and profile input collection."
                .to_string(),
        usage: "echo-profile <help|version|list|profile|serve> [options]".to_string(),
        options: vec![HelpOption::new(
            "--json",
            "Accepted for compatibility; output is always JSON for machine-interface commands.",
        )
        .default(serde_json::json!(true))],
        examples: vec![
            "echo-profile version".to_string(),
            "echo-profile list providers".to_string(),
            "echo-profile profile collect --scope project --current-project".to_string(),
        ],
    }
}

fn list_help() -> HelpTopic {
    HelpTopic {
        command: "list".to_string(),
        description: "List providers, projects, or sessions from local AI history.".to_string(),
        usage: "echo-profile list <providers|projects|sessions> [options]".to_string(),
        options: vec![provider_option(), providers_option()],
        examples: vec![
            "echo-profile list providers".to_string(),
            "echo-profile list projects --limit 50".to_string(),
            "echo-profile list sessions --current-project".to_string(),
        ],
    }
}

fn list_providers_help() -> HelpTopic {
    HelpTopic {
        command: "list providers".to_string(),
        description: "List all supported providers and mark which are available on this machine."
            .to_string(),
        usage: "echo-profile list providers".to_string(),
        options: vec![],
        examples: vec!["echo-profile list providers".to_string()],
    }
}

fn list_projects_help() -> HelpTopic {
    HelpTopic {
        command: "list projects".to_string(),
        description: "List history projects sorted by recent activity.".to_string(),
        usage: "echo-profile list projects [options]".to_string(),
        options: common_list_options(),
        examples: vec![
            "echo-profile list projects --providers codex,claude".to_string(),
            "echo-profile list projects --since 30d --limit 10".to_string(),
        ],
    }
}

fn list_sessions_help() -> HelpTopic {
    let mut options = common_list_options();
    options.extend([
        HelpOption::new(
            "--current-project",
            "Match sessions for the current working directory project.",
        )
        .default(serde_json::json!(false)),
        HelpOption::new(
            "--include-ancestor-projects",
            "Include ancestor projects when using --current-project.",
        )
        .default(serde_json::json!(false)),
        HelpOption::new(
            "--actual-project-path",
            "Match sessions by actual filesystem project path.",
        ),
        HelpOption::new(
            "--project-path",
            "Match sessions by provider-native project path.",
        ),
    ]);
    HelpTopic {
        command: "list sessions".to_string(),
        description: "List session metadata. Without a project filter, returns recent sessions."
            .to_string(),
        usage: "echo-profile list sessions [options]".to_string(),
        options,
        examples: vec![
            "echo-profile list sessions --limit 50".to_string(),
            "echo-profile list sessions --current-project".to_string(),
        ],
    }
}

fn profile_collect_help() -> HelpTopic {
    HelpTopic {
        command: "profile collect".to_string(),
        description: "Collect raw user text messages from local AI conversation history for downstream profile generation.".to_string(),
        usage: "echo-profile profile collect --scope <global|project|session> [options]".to_string(),
        options: vec![
            HelpOption::new("--scope", "Collection scope.").required().values(&["global", "project", "session"]),
            HelpOption::new("--provider", "Restrict to one provider. May be repeated."),
            HelpOption::new("--providers", "Comma-separated provider list."),
            HelpOption::new("--current-project", "Use current working directory project for project scope.").default(serde_json::json!(false)),
            HelpOption::new("--actual-project-path", "Use actual filesystem project path for project scope."),
            HelpOption::new("--project-path", "Use provider-native project path for project scope."),
            HelpOption::new("--session-path", "Use provider session path for session scope."),
            HelpOption::new("--budget-chars", "Maximum selected user text characters.").default(serde_json::json!(30000)),
            HelpOption::new("--sample", "Sampling strategy.").values(&["recent", "representative", "mixed", "chronological"]).default_by_scope(serde_json::json!({"global":"mixed","project":"mixed","session":"chronological"})),
            HelpOption::new("--paste-detect-min-chars", "Minimum message length for paste-like detection.").default(serde_json::json!(50)),
            HelpOption::new("--paste-like-threshold", "Paste-like ratio at or above which messages are filtered.").default(serde_json::json!(0.7)),
            HelpOption::new("--include-paste-like", "Disable paste-like filtering.").default(serde_json::json!(false)),
            HelpOption::new("--since", "Filter messages/sessions after ISO time or relative duration."),
            HelpOption::new("--until", "Filter messages/sessions before ISO time or relative duration."),
            HelpOption::new("--max-sessions-scan", "Maximum sessions to scan.").default(serde_json::json!(1000)),
            HelpOption::new("--max-messages-scan", "Maximum user text messages to inspect.").default(serde_json::json!(50000)),
            HelpOption::new("--no-cache", "Bypass provider scan cache.").default(serde_json::json!(false)),
        ],
        examples: vec![
            "echo-profile profile collect --scope project --current-project".to_string(),
            "echo-profile profile collect --scope session --session-path /path/to/rollout.jsonl".to_string(),
        ],
    }
}

fn serve_help() -> HelpTopic {
    HelpTopic {
        command: "serve".to_string(),
        description: "Run the existing long-running EchoProfile WebUI server mode.".to_string(),
        usage: "echo-profile serve --host 127.0.0.1 --port 3727".to_string(),
        options: vec![
            HelpOption::new("--host", "Server bind host."),
            HelpOption::new("--port", "Server port."),
            HelpOption::new("--token", "Authentication token."),
            HelpOption::new("--no-auth", "Disable authentication."),
            HelpOption::new("--dist", "External frontend dist directory."),
        ],
        examples: vec!["echo-profile serve --host 127.0.0.1 --port 3727".to_string()],
    }
}

fn common_list_options() -> Vec<HelpOption> {
    vec![
        provider_option(),
        providers_option(),
        HelpOption::new("--limit", "Page size.").default(serde_json::json!(50)),
        HelpOption::new("--offset", "Page offset.").default(serde_json::json!(0)),
        HelpOption::new("--since", "Filter after ISO time or relative duration."),
        HelpOption::new("--until", "Filter before ISO time or relative duration."),
        HelpOption::new("--no-cache", "Bypass provider scan cache.")
            .default(serde_json::json!(false)),
    ]
}

fn provider_option() -> HelpOption {
    HelpOption::new("--provider", "Restrict to one provider. May be repeated.")
}

fn providers_option() -> HelpOption {
    HelpOption::new("--providers", "Comma-separated provider list.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_collect_help_includes_sampling_and_paste_options() {
        let topic = help_topic(&["profile", "collect"]).unwrap();
        let json = serde_json::to_value(topic).unwrap();
        let options = json["options"].as_array().unwrap();
        assert!(options.iter().any(|o| o["name"] == "--scope"));
        assert!(options.iter().any(|o| o["name"] == "--sample"));
        assert!(options
            .iter()
            .any(|o| o["name"] == "--paste-detect-min-chars"));
    }
}
