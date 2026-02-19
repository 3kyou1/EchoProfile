use super::ProviderInfo;
use crate::models::{ClaudeMessage, ClaudeProject, ClaudeSession, TokenUsage};
use chrono::Utc;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

/// Detect `OpenCode` installation
pub fn detect() -> Option<ProviderInfo> {
    let base_path = get_base_path()?;
    let storage_path = Path::new(&base_path).join("storage");

    Some(ProviderInfo {
        id: "opencode".to_string(),
        display_name: "OpenCode".to_string(),
        base_path: base_path.clone(),
        is_available: storage_path.exists() && storage_path.is_dir(),
    })
}

/// Get the `OpenCode` base path
pub fn get_base_path() -> Option<String> {
    // Check $OPENCODE_HOME first
    if let Ok(home) = std::env::var("OPENCODE_HOME") {
        let path = PathBuf::from(&home);
        if path.exists() {
            return Some(home);
        }
    }

    // XDG data directory
    if let Ok(xdg_data) = std::env::var("XDG_DATA_HOME") {
        let path = PathBuf::from(&xdg_data).join("opencode");
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }

    // Default: ~/.local/share/opencode
    let home = dirs::home_dir()?;
    let opencode_path = home.join(".local").join("share").join("opencode");
    if opencode_path.exists() {
        Some(opencode_path.to_string_lossy().to_string())
    } else {
        None
    }
}

/// Scan `OpenCode` projects
pub fn scan_projects() -> Result<Vec<ClaudeProject>, String> {
    let base_path = get_base_path().ok_or_else(|| "OpenCode not found".to_string())?;
    let storage_path = Path::new(&base_path).join("storage");
    let projects_dir = storage_path.join("project");

    if !projects_dir.exists() {
        return Ok(vec![]);
    }

    let mut projects = Vec::new();

    let entries = fs::read_dir(&projects_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let val: Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let project_id = val
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let project_path = val
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let project_name = val
            .get("name")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| {
                Path::new(&project_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string()
            });

        if project_id.is_empty() {
            continue;
        }

        // Count sessions
        let sessions_dir = storage_path.join("session").join(&project_id);
        let session_count = if sessions_dir.exists() {
            fs::read_dir(&sessions_dir)
                .map(|entries| {
                    entries
                        .flatten()
                        .filter(|e| {
                            e.path().extension().and_then(|ext| ext.to_str()) == Some("json")
                        })
                        .count()
                })
                .unwrap_or(0)
        } else {
            0
        };

        let last_modified =
            get_latest_session_time(&sessions_dir).unwrap_or_else(|| Utc::now().to_rfc3339());

        projects.push(ClaudeProject {
            name: project_name,
            path: format!("opencode://{project_id}"),
            actual_path: project_path,
            session_count,
            message_count: 0,
            last_modified,
            git_info: None,
            provider: Some("opencode".to_string()),
        });
    }

    projects.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(projects)
}

/// Load sessions for an `OpenCode` project
pub fn load_sessions(
    project_path: &str,
    _exclude_sidechain: bool,
) -> Result<Vec<ClaudeSession>, String> {
    let base_path = get_base_path().ok_or_else(|| "OpenCode not found".to_string())?;
    let storage_path = Path::new(&base_path).join("storage");

    let project_id = project_path
        .strip_prefix("opencode://")
        .unwrap_or(project_path);

    let sessions_dir = storage_path.join("session").join(project_id);
    if !sessions_dir.exists() {
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();

    for entry in fs::read_dir(&sessions_dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let val: Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let session_id = val
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let title = val.get("title").and_then(|v| v.as_str()).map(String::from);
        let created_at = val
            .get("created_at")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let updated_at = val
            .get("updated_at")
            .and_then(|v| v.as_str())
            .unwrap_or(&created_at)
            .to_string();

        if session_id.is_empty() {
            continue;
        }

        // Count messages
        let messages_dir = storage_path.join("message").join(&session_id);
        let message_count = if messages_dir.exists() {
            fs::read_dir(&messages_dir)
                .map(|entries| {
                    entries
                        .flatten()
                        .filter(|e| {
                            e.path().extension().and_then(|ext| ext.to_str()) == Some("json")
                        })
                        .count()
                })
                .unwrap_or(0)
        } else {
            0
        };

        sessions.push(ClaudeSession {
            session_id: format!("opencode://{session_id}"),
            actual_session_id: session_id,
            file_path: format!(
                "opencode://{project_id}/{}",
                path.file_stem().unwrap_or_default().to_string_lossy()
            ),
            project_name: String::new(),
            message_count,
            first_message_time: created_at.clone(),
            last_message_time: updated_at.clone(),
            last_modified: updated_at,
            has_tool_use: false,
            has_errors: false,
            summary: title,
            provider: Some("opencode".to_string()),
        });
    }

    sessions.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    Ok(sessions)
}

/// Load messages for an `OpenCode` session
pub fn load_messages(session_path: &str) -> Result<Vec<ClaudeMessage>, String> {
    let base_path = get_base_path().ok_or_else(|| "OpenCode not found".to_string())?;
    let storage_path = Path::new(&base_path).join("storage");

    // Extract session info from virtual path "opencode://{project_id}/{session_id}"
    let path_part = session_path
        .strip_prefix("opencode://")
        .unwrap_or(session_path);
    let parts: Vec<&str> = path_part.splitn(2, '/').collect();
    if parts.len() < 2 {
        return Err(format!("Invalid OpenCode session path: {session_path}"));
    }
    let session_id = parts[1];

    // Read message files
    let messages_dir = storage_path.join("message").join(session_id);
    if !messages_dir.exists() {
        return Ok(vec![]);
    }

    let mut messages = Vec::new();

    // Collect and sort message files
    let mut msg_files: Vec<PathBuf> = fs::read_dir(&messages_dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    msg_files.sort();

    for msg_path in &msg_files {
        let content = match fs::read_to_string(msg_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let val: Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let msg_id = val
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let role = val.get("role").and_then(|v| v.as_str()).unwrap_or("user");
        let created_at = val
            .get("created_at")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let model = val.get("model").and_then(|v| v.as_str()).map(String::from);

        if msg_id.is_empty() {
            continue;
        }

        // Read parts for this message
        let parts_dir = storage_path.join("part").join(&msg_id);
        let part_values = if parts_dir.exists() {
            read_message_parts(&parts_dir)?
        } else {
            Vec::new()
        };

        let (content_value, usage, cost_usd) = process_parts(&part_values);

        let message_type = match role {
            "assistant" => "assistant",
            "system" => "system",
            _ => "user",
        };

        messages.push(ClaudeMessage {
            uuid: msg_id,
            parent_uuid: None,
            session_id: session_id.to_string(),
            timestamp: created_at,
            message_type: message_type.to_string(),
            content: content_value,
            project_name: None,
            tool_use: None,
            tool_use_result: None,
            is_sidechain: None,
            usage,
            role: Some(role.to_string()),
            model,
            stop_reason: None,
            cost_usd,
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
            provider: Some("opencode".to_string()),
        });
    }

    Ok(messages)
}

/// Search `OpenCode` sessions for a query string
pub fn search(query: &str, limit: usize) -> Result<Vec<ClaudeMessage>, String> {
    let base_path = get_base_path().ok_or_else(|| "OpenCode not found".to_string())?;
    let storage_path = Path::new(&base_path).join("storage");
    let session_root = storage_path.join("session");

    if !session_root.exists() {
        return Ok(vec![]);
    }

    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    for project_entry in fs::read_dir(&session_root)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let project_id = project_entry.file_name().to_string_lossy().to_string();

        for session_entry in fs::read_dir(project_entry.path())
            .into_iter()
            .flatten()
            .flatten()
        {
            let session_path = session_entry.path();
            if session_path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }

            let session_id = session_path
                .file_stem()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let virtual_path = format!("opencode://{project_id}/{session_id}");

            if let Ok(messages) = load_messages(&virtual_path) {
                for msg in messages {
                    if results.len() >= limit {
                        return Ok(results);
                    }

                    if let Some(content) = &msg.content {
                        let content_str = content.to_string().to_lowercase();
                        if content_str.contains(&query_lower) {
                            results.push(msg);
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}

// ============================================================================
// Internal helpers
// ============================================================================

fn get_latest_session_time(sessions_dir: &Path) -> Option<String> {
    if !sessions_dir.exists() {
        return None;
    }

    let mut latest: Option<String> = None;

    for entry in fs::read_dir(sessions_dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                let updated = val
                    .get("updated_at")
                    .or_else(|| val.get("created_at"))
                    .and_then(|v| v.as_str())
                    .map(String::from);

                if let Some(t) = updated {
                    if latest.is_none() || t > *latest.as_ref().unwrap() {
                        latest = Some(t);
                    }
                }
            }
        }
    }

    latest
}

fn read_message_parts(parts_dir: &Path) -> Result<Vec<Value>, String> {
    let mut parts: Vec<(String, Value)> = Vec::new();

    for entry in fs::read_dir(parts_dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let val: Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let filename = path
            .file_stem()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        parts.push((filename, val));
    }

    // Sort by filename to maintain order
    parts.sort_by(|a, b| a.0.cmp(&b.0));

    Ok(parts.into_iter().map(|(_, v)| v).collect())
}

fn process_parts(parts: &[Value]) -> (Option<Value>, Option<TokenUsage>, Option<f64>) {
    let mut content_items: Vec<Value> = Vec::new();
    let mut usage: Option<TokenUsage> = None;
    let mut cost_usd: Option<f64> = None;

    for part in parts {
        let part_type = part.get("type").and_then(|t| t.as_str()).unwrap_or("");

        match part_type {
            "text" => {
                let text = part
                    .get("text")
                    .or_else(|| part.get("content"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if !text.is_empty() {
                    content_items.push(serde_json::json!({
                        "type": "text",
                        "text": text
                    }));
                }
            }
            "tool" => {
                let tool_name = part
                    .get("toolName")
                    .or_else(|| part.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let tool_id = part
                    .get("toolCallId")
                    .or_else(|| part.get("id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let input = part
                    .get("input")
                    .or_else(|| part.get("args"))
                    .cloned()
                    .unwrap_or(Value::Object(serde_json::Map::default()));

                content_items.push(serde_json::json!({
                    "type": "tool_use",
                    "id": tool_id,
                    "name": tool_name,
                    "input": input
                }));

                // If completed, also add the result
                let state = part.get("state").and_then(|v| v.as_str()).unwrap_or("");
                if state == "completed" || part.get("result").is_some() {
                    let result = part.get("result").and_then(|v| v.as_str()).unwrap_or("");
                    content_items.push(serde_json::json!({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": result
                    }));
                }
            }
            "reasoning" => {
                let text = part
                    .get("text")
                    .or_else(|| part.get("reasoning"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if !text.is_empty() {
                    content_items.push(serde_json::json!({
                        "type": "thinking",
                        "thinking": text
                    }));
                }
            }
            "step-finish" => {
                if let Some(u) = part.get("usage") {
                    usage = Some(TokenUsage {
                        input_tokens: u
                            .get("promptTokens")
                            .or_else(|| u.get("input_tokens"))
                            .and_then(Value::as_u64)
                            .map(|v| v as u32),
                        output_tokens: u
                            .get("completionTokens")
                            .or_else(|| u.get("output_tokens"))
                            .and_then(Value::as_u64)
                            .map(|v| v as u32),
                        cache_creation_input_tokens: None,
                        cache_read_input_tokens: None,
                        service_tier: None,
                    });
                }
                cost_usd = part
                    .get("cost")
                    .or_else(|| part.get("costUSD"))
                    .and_then(Value::as_f64);
            }
            "compaction" => {
                let text = part
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("[Context compacted]");
                content_items.push(serde_json::json!({
                    "type": "text",
                    "text": format!("[Summary] {text}")
                }));
            }
            // Skip: file, snapshot, agent, subtask, retry, step-start, patch
            _ => {}
        }
    }

    let content = if content_items.is_empty() {
        None
    } else {
        Some(Value::Array(content_items))
    };

    (content, usage, cost_usd)
}
