use std::fs;
use std::path::Path;
use tauri::command;

/// Moves a session's JSONL file and its associated folder (subagents, tool-results) to the system trash.
///
/// For a session at `<dir>/<uuid>.jsonl`, also trashes `<dir>/<uuid>/` if it exists.
/// Validates that the target is a plain `.jsonl` file (not a symlink) before moving anything.
#[command]
pub async fn delete_session(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);

    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
        return Err("Only .jsonl session files can be deleted".to_string());
    }

    if !path.exists() {
        return Err(format!("Session file not found: {file_path}"));
    }

    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return Err("Session file cannot be a symlink".to_string());
        }
    }

    // Trash the associated folder (<uuid>/) if it exists alongside the JSONL file
    let associated_dir = path.with_extension("");
    if associated_dir.is_dir() {
        trash::delete(&associated_dir)
            .map_err(|e| format!("Failed to move session folder to trash: {e}"))?;
    }

    trash::delete(path).map_err(|e| format!("Failed to move session file to trash: {e}"))
}
