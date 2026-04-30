pub mod args;
pub mod help;
pub mod output;

use clap::Parser;
use serde_json::Value;

use args::{CliArgs, CliCommand};
use output::{envelope_to_stdout, CliEnvelope, CliError, CLI_SCHEMA_VERSION};

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
