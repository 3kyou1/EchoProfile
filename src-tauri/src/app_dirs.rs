use std::fs;
use std::path::{Path, PathBuf};

pub const APP_DIR_NAME: &str = ".echo-profile";

fn app_data_dir_for_home(home: &Path) -> PathBuf {
    home.join(APP_DIR_NAME)
}

fn ensure_app_data_ready_in_home(home: &Path) -> Result<(), String> {
    let app_dir = app_data_dir_for_home(home);
    fs::create_dir_all(&app_dir).map_err(|e| {
        format!(
            "Failed to create app data directory {}: {e}",
            app_dir.display()
        )
    })?;
    Ok(())
}

pub fn ensure_app_data_ready() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not find home directory".to_string())?;
    ensure_app_data_ready_in_home(&home)
}

pub fn app_data_dir() -> Result<PathBuf, String> {
    ensure_app_data_ready()?;
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    Ok(app_data_dir_for_home(&home))
}

pub fn app_data_path(relative: impl AsRef<Path>) -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(relative))
}

#[cfg(test)]
mod tests {
    use super::{app_data_dir_for_home, ensure_app_data_ready_in_home};

    #[test]
    fn creates_app_dir_when_missing() {
        let temp = tempfile::tempdir().unwrap();

        ensure_app_data_ready_in_home(temp.path()).unwrap();

        let new_dir = app_data_dir_for_home(temp.path());
        assert!(new_dir.exists());
        assert!(new_dir.is_dir());
    }
}
