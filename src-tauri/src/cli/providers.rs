use serde::Serialize;

use crate::providers::{self as history_providers, ProviderId};

use super::output::CliError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListItem {
    pub provider: String,
    pub display_name: String,
    pub is_available: bool,
    pub base_path: Option<String>,
}

pub fn normalize_provider_filters(
    providers: &[String],
    providers_csv: Option<&str>,
) -> Result<Vec<String>, CliError> {
    let mut values: Vec<String> = providers
        .iter()
        .flat_map(|provider| split_provider_csv(provider))
        .collect();
    if let Some(csv) = providers_csv {
        values.extend(split_provider_csv(csv));
    }

    values.sort();
    values.dedup();

    for provider in &values {
        if ProviderId::parse(provider).is_none() {
            return Err(CliError::new(
                "PROVIDER_UNAVAILABLE",
                format!("Provider '{provider}' is not supported."),
            ));
        }
    }

    Ok(values)
}

pub fn supported_provider_infos() -> Vec<ProviderListItem> {
    let detected = history_providers::detect_providers();
    all_provider_ids()
        .into_iter()
        .map(|provider_id| {
            let id = provider_id.as_str();
            let detected_info = detected.iter().find(|info| info.id == id);
            ProviderListItem {
                provider: id.to_string(),
                display_name: provider_id.display_name().to_string(),
                is_available: detected_info
                    .map(|info| info.is_available)
                    .unwrap_or(false),
                base_path: detected_info.map(|info| info.base_path.clone()),
            }
        })
        .collect()
}

pub fn available_provider_ids() -> Vec<String> {
    supported_provider_infos()
        .into_iter()
        .filter(|provider| provider.is_available)
        .map(|provider| provider.provider)
        .collect()
}

pub fn resolve_provider_scope(
    providers: &[String],
    providers_csv: Option<&str>,
) -> Result<Vec<String>, CliError> {
    let explicit = normalize_provider_filters(providers, providers_csv)?;
    if explicit.is_empty() {
        return Ok(available_provider_ids());
    }

    let available = supported_provider_infos();
    for provider in &explicit {
        let is_available = available
            .iter()
            .any(|info| info.provider == *provider && info.is_available);
        if !is_available {
            return Err(CliError::new(
                "PROVIDER_UNAVAILABLE",
                format!("Provider '{provider}' is not available on this machine."),
            ));
        }
    }

    Ok(explicit)
}

fn all_provider_ids() -> Vec<ProviderId> {
    vec![
        ProviderId::Aider,
        ProviderId::Claude,
        ProviderId::Cline,
        ProviderId::Codex,
        ProviderId::Cursor,
        ProviderId::Gemini,
        ProviderId::OpenCode,
    ]
}

fn split_provider_csv(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|provider| !provider.is_empty())
        .map(str::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_provider_flags_and_csv_values() {
        let resolved = normalize_provider_filters(
            &["codex".to_string()],
            Some("claude,codex"),
        )
        .unwrap();
        assert_eq!(resolved, vec!["claude", "codex"]);
    }

    #[test]
    fn rejects_unknown_provider() {
        let err = normalize_provider_filters(&["unknown".to_string()], None).unwrap_err();
        assert_eq!(err.code(), "PROVIDER_UNAVAILABLE");
    }
}
