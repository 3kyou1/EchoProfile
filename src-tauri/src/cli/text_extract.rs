use crate::models::ClaudeMessage;

pub fn extract_user_text(message: &ClaudeMessage) -> Option<String> {
    let is_user = message.role.as_deref() == Some("user") || message.message_type == "user";
    if !is_user {
        return None;
    }
    let content = message.content.as_ref()?;
    extract_text_value(content)
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn extract_text_value(content: &serde_json::Value) -> Option<String> {
    match content {
        serde_json::Value::String(text) => Some(text.clone()),
        serde_json::Value::Array(items) => {
            let parts: Vec<String> = items
                .iter()
                .filter_map(extract_text_block)
                .filter(|text| !text.trim().is_empty())
                .collect();
            (!parts.is_empty()).then(|| parts.join("\n"))
        }
        serde_json::Value::Object(map) => {
            if map.get("type").and_then(serde_json::Value::as_str) == Some("text") {
                return map.get("text").and_then(serde_json::Value::as_str).map(str::to_string);
            }
            map.get("text").and_then(serde_json::Value::as_str).map(str::to_string)
        }
        _ => None,
    }
}

fn extract_text_block(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(text) => Some(text.clone()),
        serde_json::Value::Object(map) => {
            let block_type = map.get("type").and_then(serde_json::Value::as_str);
            match block_type {
                Some("text") | Some("input_text") => map
                    .get("text")
                    .or_else(|| map.get("content"))
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
                None => map.get("text").and_then(serde_json::Value::as_str).map(str::to_string),
                _ => None,
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn user_message(content: serde_json::Value) -> crate::models::ClaudeMessage {
        crate::models::ClaudeMessage {
            uuid: "uuid".to_string(),
            parent_uuid: None,
            session_id: "session".to_string(),
            timestamp: "2026-04-30T00:00:00Z".to_string(),
            message_type: "user".to_string(),
            content: Some(content),
            project_name: None,
            tool_use: None,
            tool_use_result: None,
            is_sidechain: None,
            usage: None,
            role: Some("user".to_string()),
            model: None,
            stop_reason: None,
            cost_usd: None,
            duration_ms: None,
            message_id: None,
            snapshot: None,
            is_snapshot_update: None,
            data: None,
            tool_use_id: None,
            parent_tool_use_id: None,
            operation: None,
            subtype: None,
            level: None,
            hook_count: None,
            hook_infos: None,
            stop_reason_system: None,
            prevented_continuation: None,
            compact_metadata: None,
            microcompact_metadata: None,
            provider: None,
        }
    }

    #[test]
    fn extracts_string_content_from_user_message() {
        let message = user_message(json!("hello"));
        assert_eq!(extract_user_text(&message), Some("hello".to_string()));
    }

    #[test]
    fn ignores_non_text_content_blocks() {
        let message = user_message(json!([
            {"type": "image", "source": {}},
            {"type": "text", "text": "describe this"}
        ]));
        assert_eq!(extract_user_text(&message), Some("describe this".to_string()));
    }
}
