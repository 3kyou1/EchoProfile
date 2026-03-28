use crate::wsl;

/// Detect available WSL distributions.
/// Returns empty vec on non-Windows platforms.
#[tauri::command]
pub async fn detect_wsl_distros() -> Result<Vec<wsl::WslDistro>, String> {
    Ok(wsl::detect_distros())
}

/// Check if WSL is available on this system.
/// Returns false on non-Windows platforms.
#[tauri::command]
pub async fn is_wsl_available() -> bool {
    wsl::is_wsl_available()
}
