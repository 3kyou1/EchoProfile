use serde::Serialize;
use serde_json::Value;

pub const CLI_SCHEMA_VERSION: &str = "echo-profile.cli.v1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliEnvelope<T: Serialize> {
    pub ok: bool,
    pub schema_version: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CliErrorBody>,
    pub warnings: Vec<CliWarning>,
}

impl<T: Serialize> CliEnvelope<T> {
    pub fn success(data: T) -> Self {
        Self {
            ok: true,
            schema_version: CLI_SCHEMA_VERSION,
            data: Some(data),
            error: None,
            warnings: Vec::new(),
        }
    }

    pub fn failure(error: CliError) -> Self {
        Self {
            ok: false,
            schema_version: CLI_SCHEMA_VERSION,
            data: None,
            error: Some(error.body),
            warnings: error.warnings,
        }
    }

    pub fn with_warnings(mut self, warnings: Vec<CliWarning>) -> Self {
        self.warnings = warnings;
        self
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliErrorBody {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct CliError {
    body: CliErrorBody,
    warnings: Vec<CliWarning>,
    exit_code: i32,
}

impl CliError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            body: CliErrorBody {
                code: code.into(),
                message: message.into(),
                details: None,
            },
            warnings: Vec::new(),
            exit_code: 1,
        }
    }

    pub fn invalid_argument(message: impl Into<String>) -> Self {
        Self::new("INVALID_ARGUMENT", message)
    }

    pub fn unknown_command(message: impl Into<String>) -> Self {
        Self::new("UNKNOWN_COMMAND", message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("INTERNAL_ERROR", message)
    }

    pub fn with_details(mut self, details: Value) -> Self {
        self.body.details = Some(details);
        self
    }

    pub fn with_warnings(mut self, warnings: Vec<CliWarning>) -> Self {
        self.warnings = warnings;
        self
    }

    pub fn code(&self) -> &str {
        &self.body.code
    }

    pub fn exit_code(&self) -> i32 {
        self.exit_code
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliWarning {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

impl CliWarning {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: Value) -> Self {
        self.details = Some(details);
        self
    }
}

pub fn envelope_to_stdout<T: Serialize>(envelope: &CliEnvelope<T>) -> Result<(), CliError> {
    let json = serde_json::to_string(envelope)
        .map_err(|e| CliError::internal(format!("Failed to serialize CLI response: {e}")))?;
    println!("{json}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn success_envelope_has_schema_version() {
        let envelope = CliEnvelope::success(serde_json::json!({ "hello": "world" }));
        let json = serde_json::to_value(envelope).unwrap();
        assert_eq!(json["ok"], true);
        assert_eq!(json["schemaVersion"], CLI_SCHEMA_VERSION);
        assert!(json.get("warnings").unwrap().is_array());
    }

    #[test]
    fn error_envelope_has_code_message_and_schema() {
        let envelope = CliEnvelope::<serde_json::Value>::failure(CliError::invalid_argument("bad arg"));
        let json = serde_json::to_value(envelope).unwrap();
        assert_eq!(json["ok"], false);
        assert_eq!(json["schemaVersion"], CLI_SCHEMA_VERSION);
        assert_eq!(json["error"]["code"], "INVALID_ARGUMENT");
    }
}
