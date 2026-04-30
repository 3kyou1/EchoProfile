pub mod args;
pub mod help;
pub mod output;
pub mod providers;
pub mod time_filter;

use clap::Parser;
use serde_json::Value;

use args::{CliArgs, CliCommand};
use output::{envelope_to_stdout, CliEnvelope, CliError, CLI_SCHEMA_VERSION};


#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CliAction {
    RunMachineCommand(Vec<String>),
    RunServe(Vec<String>),
    LaunchDesktop,
}

pub fn classify_args(args: &[String]) -> CliAction {
    if args.len() <= 1 {
        return CliAction::LaunchDesktop;
    }

    if args.iter().skip(1).any(|arg| arg == "--serve") {
        return CliAction::RunServe(args.to_vec());
    }

    if args.get(1).is_some_and(|arg| arg == "serve") {
        let mut converted = Vec::with_capacity(args.len() + 1);
        converted.push(args[0].clone());
        converted.push("--serve".to_string());
        converted.extend(args.iter().skip(2).cloned());
        return CliAction::RunServe(converted);
    }

    CliAction::RunMachineCommand(args.to_vec())
}

pub fn run_machine_command(args: Vec<String>) -> Result<Value, CliError> {
    let parsed = CliArgs::try_parse_from(args)
        .map_err(|e| CliError::invalid_argument(e.to_string()))?;

    match parsed.command {
        CliCommand::Help(help_args) => {
            serde_json::to_value(help::help_topic_from_strings(&help_args.topic)?)
                .map_err(|e| CliError::internal(format!("Failed to serialize help topic: {e}")))
        }
        CliCommand::Version => Ok(version_response()),
        command => Err(CliError::invalid_argument(format!(
            "Command is not implemented yet: {command:?}"
        ))),
    }
}

pub fn run_and_print(args: Vec<String>) -> i32 {
    match run_machine_command(args) {
        Ok(data) => match envelope_to_stdout(&CliEnvelope::success(data)) {
            Ok(()) => 0,
            Err(error) => print_error(error),
        },
        Err(error) => print_error(error),
    }
}

fn print_error(error: CliError) -> i32 {
    let exit_code = error.exit_code();
    let envelope = CliEnvelope::<Value>::failure(error);
    if let Err(serialization_error) = envelope_to_stdout(&envelope) {
        eprintln!("Failed to serialize CLI error: {serialization_error:?}");
    }
    exit_code
}

fn version_response() -> Value {
    serde_json::json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "cliSchemaVersion": CLI_SCHEMA_VERSION,
        "features": [
            "help",
            "version",
            "list_providers",
            "list_projects",
            "list_sessions",
            "profile_collect",
            "serve"
        ]
    })
}

#[cfg(test)]
mod routing_tests {
    use super::*;

    #[test]
    fn classify_no_args_launches_desktop() {
        let args = vec!["echo-profile".to_string()];
        assert!(matches!(classify_args(&args), CliAction::LaunchDesktop));
    }

    #[test]
    fn classify_version_as_machine_command() {
        let args = vec!["echo-profile".to_string(), "version".to_string()];
        assert!(matches!(classify_args(&args), CliAction::RunMachineCommand(_)));
    }

    #[test]
    fn classify_serve_subcommand_as_server() {
        let args = vec![
            "echo-profile".to_string(),
            "serve".to_string(),
            "--port".to_string(),
            "3727".to_string(),
        ];
        let CliAction::RunServe(converted) = classify_args(&args) else {
            panic!("expected serve action");
        };
        assert_eq!(converted, vec!["echo-profile", "--serve", "--port", "3727"]);
    }
}
