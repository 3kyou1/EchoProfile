#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// Use tokio runtime for Aptabase analytics plugin compatibility
#[tokio::main]
async fn main() {
    // Tell Tauri to use our existing Tokio runtime
    tauri::async_runtime::set(tokio::runtime::Handle::current());
    claude_code_history_viewer_lib::run();
}
