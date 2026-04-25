const MAX_CATEGORY_LEN: usize = 32;
const MAX_STAGE_LEN: usize = 64;
const MAX_PAYLOAD_LEN: usize = 32_000;

fn truncate_text(value: String, max_len: usize) -> String {
    if value.chars().count() <= max_len {
        return value;
    }

    let truncated: String = value.chars().take(max_len).collect();
    format!("{truncated}... [truncated]")
}

fn parse_level(level: &str) -> log::Level {
    match level.to_ascii_lowercase().as_str() {
        "trace" => log::Level::Trace,
        "debug" => log::Level::Debug,
        "warn" => log::Level::Warn,
        "error" => log::Level::Error,
        _ => log::Level::Info,
    }
}

fn format_frontend_llm_debug_message(category: String, stage: String, payload: String) -> String {
    let normalized_category = truncate_text(category, MAX_CATEGORY_LEN);
    let normalized_stage = truncate_text(stage, MAX_STAGE_LEN);
    let normalized_payload = truncate_text(payload, MAX_PAYLOAD_LEN);

    format!("[frontend_llm][{normalized_category}:{normalized_stage}] {normalized_payload}")
}

#[tauri::command]
pub fn log_frontend_llm_debug(
    category: String,
    stage: String,
    level: Option<String>,
    payload: String,
) {
    let normalized_level = level
        .as_deref()
        .map(parse_level)
        .unwrap_or(log::Level::Info);
    let message = format_frontend_llm_debug_message(category, stage, payload);

    eprintln!("{message}");
    log::log!(target: "frontend_llm", normalized_level, "{message}");
}

#[cfg(test)]
mod tests {
    use super::format_frontend_llm_debug_message;

    #[test]
    fn formats_frontend_llm_message_with_prefix() {
        let message = format_frontend_llm_debug_message(
            "copa".to_string(),
            "diagnosis".to_string(),
            "{\"missingFactors\":[\"CT\"]}".to_string(),
        );

        assert_eq!(
            message,
            "[frontend_llm][copa:diagnosis] {\"missingFactors\":[\"CT\"]}"
        );
    }
}
