//! Backend-only LLM proxy commands.
//!
//! API keys are saved by the local backend and never embedded into the built
//! JavaScript bundle.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::Builder;

const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
const LLM_CONFIG_FILE: &str = "llm-config.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LlmChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LlmChatCompletionInput {
    pub purpose: String,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    pub response_format: Value,
    pub messages: Vec<LlmChatMessage>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatCompletionResponse {
    status: u16,
    status_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmRuntimeConfig {
    copa: LlmRuntimeModelConfig,
    resonance: LlmRuntimeModelConfig,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmRuntimeModelConfig {
    base_url: String,
    model: String,
    temperature: f64,
    has_api_key: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmStoredConfig {
    #[serde(default)]
    copa: LlmStoredPurposeConfig,
    #[serde(default)]
    resonance: LlmStoredPurposeConfig,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmStoredPurposeConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    api_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveLlmApiKeyInput {
    pub purpose: String,
    pub api_key: String,
}

#[derive(Debug)]
struct ResolvedLlmConfig {
    base_url: String,
    model: String,
    api_key: String,
    temperature: f64,
}

fn purpose_prefix(purpose: &str) -> Result<&'static str, String> {
    match purpose {
        "copa" => Ok("ECHOPROFILE_COPA"),
        "resonance" => Ok("ECHOPROFILE_RESONANCE"),
        other => Err(format!("Unsupported LLM purpose: {other}")),
    }
}

fn normalize_base_url(value: String) -> String {
    value.trim_end_matches('/').to_string()
}

fn default_temperature(purpose: &str) -> f64 {
    if purpose == "resonance" {
        0.3
    } else {
        0.2
    }
}

fn llm_config_path() -> Result<std::path::PathBuf, String> {
    crate::app_dirs::app_data_path(LLM_CONFIG_FILE)
}

fn normalize_api_key(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn read_llm_config_at(path: &Path) -> Result<LlmStoredConfig, String> {
    if !path.exists() {
        return Ok(LlmStoredConfig::default());
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read LLM config {}: {error}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("Failed to parse LLM config {}: {error}", path.display()))
}

fn write_llm_config_at(path: &Path, config: &LlmStoredConfig) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Missing parent directory for {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create LLM config directory {}: {error}",
            parent.display()
        )
    })?;

    let content = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Failed to serialize LLM config: {error}"))?;
    let mut builder = Builder::new();
    builder.prefix(".llm-config-").suffix(".tmp");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        builder.permissions(fs::Permissions::from_mode(0o600));
    }

    let mut temp_file = builder
        .tempfile_in(parent)
        .map_err(|error| format!("Failed to create temp LLM config: {error}"))?;
    temp_file
        .write_all(content.as_bytes())
        .map_err(|error| format!("Failed to write temp LLM config: {error}"))?;
    temp_file
        .as_file()
        .sync_all()
        .map_err(|error| format!("Failed to sync temp LLM config: {error}"))?;

    let temp_path = temp_file.into_temp_path();
    super::fs_utils::atomic_rename(&temp_path, path)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| {
            format!(
                "Failed to secure LLM config permissions {}: {error}",
                path.display()
            )
        })?;
    }

    Ok(())
}

fn save_llm_api_key_at(path: &Path, input: SaveLlmApiKeyInput) -> Result<(), String> {
    purpose_prefix(&input.purpose)?;
    let api_key =
        normalize_api_key(&input.api_key).ok_or_else(|| "API key must not be empty".to_string())?;
    let mut config = read_llm_config_at(path)?;

    match input.purpose.as_str() {
        "copa" => config.copa.api_key = Some(api_key),
        "resonance" => config.resonance.api_key = Some(api_key),
        _ => unreachable!("purpose validated above"),
    }

    write_llm_config_at(path, &config)
}

fn delete_llm_api_key_at(path: &Path, purpose: &str) -> Result<(), String> {
    purpose_prefix(purpose)?;
    let mut config = read_llm_config_at(path)?;

    match purpose {
        "copa" => config.copa.api_key = None,
        "resonance" => config.resonance.api_key = None,
        _ => unreachable!("purpose validated above"),
    }

    write_llm_config_at(path, &config)
}

fn api_key_for_purpose(config: &LlmStoredConfig, purpose: &str) -> Option<String> {
    match purpose {
        "copa" => config.copa.api_key.clone(),
        "resonance" => config
            .resonance
            .api_key
            .clone()
            .or_else(|| config.copa.api_key.clone()),
        _ => None,
    }
}

fn missing_api_key_message(purpose: &str) -> String {
    if purpose == "resonance" {
        "Configure the Thought Echoes API key in LLM settings before generating thought echoes."
            .to_string()
    } else {
        "Configure the CoPA API key in LLM settings before generating profiles.".to_string()
    }
}

fn resolve_config_with_stored_config(
    input: &LlmChatCompletionInput,
    stored_config: &LlmStoredConfig,
) -> Result<ResolvedLlmConfig, String> {
    purpose_prefix(&input.purpose)?;

    let base_url = input
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_string());

    let model = input
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| "Configure the LLM model in LLM settings before generating.".to_string())?;

    let api_key = api_key_for_purpose(stored_config, &input.purpose)
        .ok_or_else(|| missing_api_key_message(&input.purpose))?;

    Ok(ResolvedLlmConfig {
        base_url: normalize_base_url(base_url),
        model,
        api_key,
        temperature: input
            .temperature
            .unwrap_or_else(|| default_temperature(&input.purpose)),
    })
}

fn resolve_config(input: &LlmChatCompletionInput) -> Result<ResolvedLlmConfig, String> {
    let config = read_llm_config_at(&llm_config_path()?)?;
    resolve_config_with_stored_config(input, &config)
}

fn runtime_model_config(
    purpose: &str,
    default_temperature: f64,
    stored_config: &LlmStoredConfig,
) -> LlmRuntimeModelConfig {
    LlmRuntimeModelConfig {
        base_url: DEFAULT_BASE_URL.to_string(),
        model: String::new(),
        temperature: default_temperature,
        has_api_key: api_key_for_purpose(stored_config, purpose).is_some(),
    }
}

#[tauri::command]
pub async fn get_llm_runtime_config() -> Result<LlmRuntimeConfig, String> {
    let config = read_llm_config_at(&llm_config_path()?)?;
    Ok(LlmRuntimeConfig {
        copa: runtime_model_config("copa", 0.2, &config),
        resonance: runtime_model_config("resonance", 0.3, &config),
    })
}

#[tauri::command]
pub async fn save_llm_api_key(
    purpose: String,
    api_key: String,
) -> Result<LlmRuntimeConfig, String> {
    let input = SaveLlmApiKeyInput { purpose, api_key };
    save_llm_api_key_at(&llm_config_path()?, input)?;
    get_llm_runtime_config().await
}

#[tauri::command]
pub async fn delete_llm_api_key(purpose: String) -> Result<LlmRuntimeConfig, String> {
    delete_llm_api_key_at(&llm_config_path()?, &purpose)?;
    get_llm_runtime_config().await
}

#[tauri::command]
pub async fn request_llm_chat_completion(
    purpose: String,
    base_url: Option<String>,
    model: Option<String>,
    temperature: Option<f64>,
    response_format: Value,
    messages: Vec<LlmChatMessage>,
) -> Result<LlmChatCompletionResponse, String> {
    let input = LlmChatCompletionInput {
        purpose,
        base_url,
        model,
        temperature,
        response_format,
        messages,
    };

    if input.messages.is_empty() {
        return Err("Missing LLM messages".to_string());
    }

    let config = resolve_config(&input)?;
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/chat/completions", config.base_url))
        .bearer_auth(config.api_key)
        .json(&json!({
            "model": config.model,
            "temperature": config.temperature,
            "response_format": input.response_format,
            "messages": input.messages
                .into_iter()
                .map(|message| json!({
                    "role": message.role,
                    "content": message.content,
                }))
                .collect::<Vec<_>>(),
        }))
        .send()
        .await
        .map_err(|error| format!("LLM request failed: {error}"))?;

    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let text = response
        .text()
        .await
        .map_err(|error| format!("Failed to read LLM response: {error}"))?;
    let body = serde_json::from_str::<Value>(&text).ok();

    Ok(LlmChatCompletionResponse {
        status: status.as_u16(),
        status_text,
        body,
        text: if text.is_empty() { None } else { Some(text) },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    struct EnvGuard {
        keys: Vec<(&'static str, Option<String>)>,
    }

    impl EnvGuard {
        fn set(values: &[(&'static str, &'static str)]) -> Self {
            let keys = [
                "ECHOPROFILE_COPA_API_KEY",
                "ECHOPROFILE_COPA_MODEL",
                "ECHOPROFILE_COPA_BASE_URL",
                "ECHOPROFILE_RESONANCE_API_KEY",
                "OPENAI_API_KEY",
                "OPENAI_MODEL",
                "OPENAI_BASE_URL",
            ];
            let previous = keys
                .iter()
                .map(|key| (*key, std::env::var(key).ok()))
                .collect::<Vec<_>>();
            for key in keys {
                std::env::remove_var(key);
            }
            for (key, value) in values {
                std::env::set_var(key, value);
            }
            Self { keys: previous }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            for (key, value) in &self.keys {
                if let Some(value) = value {
                    std::env::set_var(key, value);
                } else {
                    std::env::remove_var(key);
                }
            }
        }
    }

    fn input() -> LlmChatCompletionInput {
        LlmChatCompletionInput {
            purpose: "copa".to_string(),
            base_url: Some("https://example.com/v1".to_string()),
            model: Some("ui-model".to_string()),
            temperature: Some(0.4),
            response_format: json!({ "type": "json_object" }),
            messages: vec![LlmChatMessage {
                role: "user".to_string(),
                content: "hello".to_string(),
            }],
        }
    }

    #[test]
    #[serial]
    fn resolves_api_key_from_saved_config_only() {
        let _guard = EnvGuard::set(&[("ECHOPROFILE_COPA_API_KEY", "env-key")]);
        let stored = LlmStoredConfig {
            copa: LlmStoredPurposeConfig {
                api_key: Some("saved-key".to_string()),
            },
            resonance: LlmStoredPurposeConfig::default(),
        };

        let resolved = resolve_config_with_stored_config(&input(), &stored).expect("config");

        assert_eq!(resolved.api_key, "saved-key");
        assert_eq!(resolved.model, "ui-model");
        assert_eq!(resolved.base_url, "https://example.com/v1");
    }

    #[test]
    #[serial]
    fn rejects_missing_saved_api_key_without_environment_fallback() {
        let _guard = EnvGuard::set(&[("ECHOPROFILE_COPA_API_KEY", "env-key")]);
        let stored = LlmStoredConfig::default();

        let error = resolve_config_with_stored_config(&input(), &stored)
            .expect_err("missing key should fail");

        assert!(error.contains("Configure the CoPA API key"));
        assert!(!error.contains("OPENAI_API_KEY"));
    }

    #[test]
    fn saves_and_deletes_api_keys_in_local_config_file() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("llm-config.json");

        save_llm_api_key_at(
            &path,
            SaveLlmApiKeyInput {
                purpose: "copa".to_string(),
                api_key: "saved-copa-key".to_string(),
            },
        )
        .expect("save key");

        let stored = read_llm_config_at(&path).expect("read config");
        assert_eq!(stored.copa.api_key.as_deref(), Some("saved-copa-key"));

        delete_llm_api_key_at(&path, "copa").expect("delete key");

        let stored = read_llm_config_at(&path).expect("read config");
        assert_eq!(stored.copa.api_key, None);
    }
}
