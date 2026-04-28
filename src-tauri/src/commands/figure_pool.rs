use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use tempfile::Builder;

const FIGURE_POOL_ROOT: &str = "figure-pools";
const POOL_MANIFEST: &str = "pool.json";
const PORTRAITS_DIR: &str = "portraits";

struct BuiltinFigurePool {
    directory_name: &'static str,
    zip_bytes: &'static [u8],
}

const BUILTIN_FIGURE_POOLS: &[BuiltinFigurePool] = &[BuiltinFigurePool {
    directory_name: "mbti",
    zip_bytes: include_bytes!("../../../zip/mbti.zip"),
}];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FigurePoolRepoEntry {
    pub directory_name: String,
    pub pool_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FigurePoolPortraitInput {
    pub relative_path: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveFigurePoolInput {
    pub requested_name: String,
    pub pool_json: String,
    #[serde(default)]
    pub previous_directory_name: Option<String>,
    #[serde(default)]
    pub portraits: Vec<FigurePoolPortraitInput>,
    #[serde(default)]
    pub remove_portrait_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveFigurePoolResult {
    pub directory_name: String,
    pub pool_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadFigurePoolPortraitInput {
    pub directory_name: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FigurePoolPortraitOutput {
    pub data_base64: String,
}

fn repo_root() -> Result<PathBuf, String> {
    crate::app_dirs::app_data_path(FIGURE_POOL_ROOT)
}

fn validate_directory_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Pool name must not be empty".to_string());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("Pool name must not be '.' or '..'".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err("Pool name contains forbidden path characters".to_string());
    }
    Ok(trimmed.to_string())
}

fn validate_portrait_relative_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Portrait path must not be empty".to_string());
    }

    let relative = PathBuf::from(trimmed);
    if relative.is_absolute() {
        return Err("Portrait path must be relative".to_string());
    }

    let mut saw_portraits = false;
    for component in relative.components() {
        match component {
            std::path::Component::Normal(value) => {
                if !saw_portraits {
                    saw_portraits = value == PORTRAITS_DIR;
                }
            }
            _ => return Err("Portrait path contains unsupported traversal".to_string()),
        }
    }

    if !saw_portraits || !trimmed.starts_with("portraits/") {
        return Err("Portrait path must stay inside portraits/".to_string());
    }

    Ok(relative)
}

fn ensure_pool_root(root: &Path) -> Result<(), String> {
    if root.exists() {
        if !root.is_dir() {
            return Err(format!(
                "Figure pool root is not a directory: {}",
                root.display()
            ));
        }
        return Ok(());
    }
    fs::create_dir_all(root)
        .map_err(|e| format!("Failed to create figure pool root {}: {e}", root.display()))
}

fn has_pool_manifests(root: &Path) -> Result<bool, String> {
    if !root.exists() {
        return Ok(false);
    }

    for entry in fs::read_dir(root)
        .map_err(|e| format!("Failed to read figure pool root {}: {e}", root.display()))?
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
        if entry.path().join(POOL_MANIFEST).is_file() {
            return Ok(true);
        }
    }

    Ok(false)
}

fn builtin_zip_entry_path(name: &str) -> Option<PathBuf> {
    let trimmed = name.trim_matches('/');
    if trimmed.is_empty() {
        return None;
    }

    let relative = Path::new(trimmed);
    let mut safe_path = PathBuf::new();
    for component in relative.components() {
        match component {
            Component::Normal(value) => safe_path.push(value),
            _ => return None,
        }
    }

    if safe_path == Path::new(POOL_MANIFEST) || safe_path.starts_with(PORTRAITS_DIR) {
        Some(safe_path)
    } else {
        None
    }
}

fn extract_builtin_pool_zip(root: &Path, pool: &BuiltinFigurePool) -> Result<(), String> {
    let target_dir = root.join(pool.directory_name);
    fs::create_dir_all(&target_dir).map_err(|e| {
        format!(
            "Failed to create built-in pool directory {}: {e}",
            target_dir.display()
        )
    })?;

    let cursor = Cursor::new(pool.zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| {
        format!(
            "Failed to open built-in pool zip {}: {e}",
            pool.directory_name
        )
    })?;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|e| {
            format!(
                "Failed to read built-in pool zip entry {} in {}: {e}",
                index, pool.directory_name
            )
        })?;
        if file.is_dir() {
            continue;
        }

        let Some(relative_path) = builtin_zip_entry_path(file.name()) else {
            continue;
        };
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(|e| {
            format!(
                "Failed to extract built-in pool entry {} from {}: {e}",
                file.name(),
                pool.directory_name
            )
        })?;
        if relative_path == Path::new(POOL_MANIFEST) {
            bytes = normalize_builtin_pool_manifest(&bytes, pool)?;
        }
        atomic_write_bytes(&target_dir.join(relative_path), &bytes)?;
    }

    if !target_dir.join(POOL_MANIFEST).is_file() {
        return Err(format!(
            "Built-in pool zip {} is missing {}",
            pool.directory_name, POOL_MANIFEST
        ));
    }

    Ok(())
}

fn normalize_builtin_pool_manifest(
    bytes: &[u8],
    pool: &BuiltinFigurePool,
) -> Result<Vec<u8>, String> {
    let mut value: Value = serde_json::from_slice(bytes).map_err(|e| {
        format!(
            "Failed to parse built-in pool manifest {}: {e}",
            pool.directory_name
        )
    })?;
    let object = value.as_object_mut().ok_or_else(|| {
        format!(
            "Built-in pool manifest {} must be a JSON object",
            pool.directory_name
        )
    })?;

    object
        .entry("id".to_string())
        .or_insert_with(|| Value::String(pool.directory_name.to_string()));
    object
        .entry("name".to_string())
        .or_insert_with(|| Value::String(pool.directory_name.to_string()));
    object.insert("origin".to_string(), Value::String("builtin".to_string()));
    object
        .entry("isDefault".to_string())
        .or_insert_with(|| Value::Bool(pool.directory_name == "mbti"));

    serde_json::to_vec_pretty(&Value::Object(object.clone()))
        .map_err(|e| format!("Failed to serialize built-in pool manifest: {e}"))
}

fn seed_builtin_zip_pools_if_empty(root: &Path) -> Result<(), String> {
    ensure_pool_root(root)?;
    if has_pool_manifests(root)? {
        return Ok(());
    }

    for pool in BUILTIN_FIGURE_POOLS {
        extract_builtin_pool_zip(root, pool)?;
    }

    Ok(())
}

fn atomic_write_string(path: &Path, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Missing parent directory for {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|e| {
        format!(
            "Failed to create parent directory {}: {e}",
            parent.display()
        )
    })?;

    let mut temp_file = Builder::new()
        .prefix(".figure-pool-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|e| format!("Failed to create temp file in {}: {e}", parent.display()))?;

    temp_file
        .write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    temp_file
        .as_file()
        .sync_all()
        .map_err(|e| format!("Failed to sync temp file: {e}"))?;

    let temp_path = temp_file.into_temp_path();
    super::fs_utils::atomic_rename(&temp_path, path)
}

fn atomic_write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Missing parent directory for {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|e| {
        format!(
            "Failed to create parent directory {}: {e}",
            parent.display()
        )
    })?;

    let mut temp_file = Builder::new()
        .prefix(".figure-pool-portrait-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|e| format!("Failed to create portrait temp file: {e}"))?;

    temp_file
        .write_all(bytes)
        .map_err(|e| format!("Failed to write portrait temp file: {e}"))?;
    temp_file
        .as_file()
        .sync_all()
        .map_err(|e| format!("Failed to sync portrait temp file: {e}"))?;

    let temp_path = temp_file.into_temp_path();
    super::fs_utils::atomic_rename(&temp_path, path)
}

fn load_pool_json_value(path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read pool manifest {}: {e}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse pool manifest {}: {e}", path.display()))
}

fn serialize_pool_json(value: &Value) -> Result<String, String> {
    serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize pool manifest: {e}"))
}

fn update_pool_manifest(mut value: Value, final_name: &str) -> Result<(String, bool), String> {
    let object = value
        .as_object_mut()
        .ok_or_else(|| "Pool manifest must be a JSON object".to_string())?;
    object.insert("name".to_string(), Value::String(final_name.to_string()));
    let is_default = object
        .get("isDefault")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Ok((
        serialize_pool_json(&Value::Object(object.clone()))?,
        is_default,
    ))
}

fn maybe_clear_default(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let mut value = load_pool_json_value(path)?;
    let object = match value.as_object_mut() {
        Some(object) => object,
        None => return Ok(()),
    };
    if object.get("isDefault").and_then(Value::as_bool) != Some(true) {
        return Ok(());
    }

    object.insert("isDefault".to_string(), Value::Bool(false));
    let serialized = serialize_pool_json(&Value::Object(object.clone()))?;
    atomic_write_string(path, &serialized)
}

fn normalize_single_default(root: &Path, target_directory_name: &str) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(root)
        .map_err(|e| format!("Failed to read figure pool root {}: {e}", root.display()))?
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let directory_name = entry.file_name().to_string_lossy().to_string();
        if directory_name == target_directory_name {
            continue;
        }
        maybe_clear_default(&path.join(POOL_MANIFEST))?;
    }
    Ok(())
}

fn resolve_unique_directory_name(
    root: &Path,
    requested_name: &str,
    previous_directory_name: Option<&str>,
) -> String {
    let base = requested_name.to_string();
    let mut candidate = base.clone();
    let mut index = 2;

    loop {
        let candidate_path = root.join(&candidate);
        let is_same_existing = previous_directory_name
            .map(|previous| previous == candidate)
            .unwrap_or(false);
        if !candidate_path.exists() || is_same_existing {
            return candidate;
        }
        candidate = format!("{base} ({index})");
        index += 1;
    }
}

fn list_figure_pool_entries_in_root(root: &Path) -> Result<Vec<FigurePoolRepoEntry>, String> {
    seed_builtin_zip_pools_if_empty(root)?;

    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(root)
        .map_err(|e| format!("Failed to read figure pool root {}: {e}", root.display()))?
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let manifest_path = path.join(POOL_MANIFEST);
        if !manifest_path.is_file() {
            continue;
        }

        let pool_json = fs::read_to_string(&manifest_path).map_err(|e| {
            format!(
                "Failed to read pool manifest {}: {e}",
                manifest_path.display()
            )
        })?;
        entries.push(FigurePoolRepoEntry {
            directory_name: entry.file_name().to_string_lossy().to_string(),
            pool_json,
        });
    }

    entries.sort_by(|left, right| left.directory_name.cmp(&right.directory_name));
    Ok(entries)
}

fn save_figure_pool_in_root(
    root: &Path,
    input: SaveFigurePoolInput,
) -> Result<SaveFigurePoolResult, String> {
    ensure_pool_root(root)?;

    let requested_name = validate_directory_name(&input.requested_name)?;
    let previous_directory_name = input
        .previous_directory_name
        .as_deref()
        .map(validate_directory_name)
        .transpose()?;

    let final_directory_name =
        resolve_unique_directory_name(root, &requested_name, previous_directory_name.as_deref());

    let pool_value: Value =
        serde_json::from_str(&input.pool_json).map_err(|e| format!("Invalid pool JSON: {e}"))?;
    let (pool_json, is_default) = update_pool_manifest(pool_value, &final_directory_name)?;

    let target_dir = root.join(&final_directory_name);
    if let Some(previous_directory_name) = &previous_directory_name {
        let previous_dir = root.join(previous_directory_name);
        if previous_dir.exists() && previous_dir != target_dir {
            fs::rename(&previous_dir, &target_dir).map_err(|e| {
                format!(
                    "Failed to rename pool directory {} to {}: {e}",
                    previous_dir.display(),
                    target_dir.display()
                )
            })?;
        }
    }

    fs::create_dir_all(target_dir.join(PORTRAITS_DIR)).map_err(|e| {
        format!(
            "Failed to create portraits directory {}: {e}",
            target_dir.display()
        )
    })?;

    for relative_path in &input.remove_portrait_paths {
        let safe_relative = validate_portrait_relative_path(relative_path)?;
        let portrait_path = target_dir.join(safe_relative);
        if portrait_path.exists() {
            fs::remove_file(&portrait_path).map_err(|e| {
                format!("Failed to remove portrait {}: {e}", portrait_path.display())
            })?;
        }
    }

    for portrait in &input.portraits {
        let safe_relative = validate_portrait_relative_path(&portrait.relative_path)?;
        let portrait_path = target_dir.join(safe_relative);
        let bytes = BASE64
            .decode(&portrait.data_base64)
            .map_err(|e| format!("Failed to decode portrait {}: {e}", portrait.relative_path))?;
        atomic_write_bytes(&portrait_path, &bytes)?;
    }

    if is_default {
        normalize_single_default(root, &final_directory_name)?;
    }

    atomic_write_string(&target_dir.join(POOL_MANIFEST), &pool_json)?;

    Ok(SaveFigurePoolResult {
        directory_name: final_directory_name,
        pool_json,
    })
}

fn delete_figure_pool_in_root(root: &Path, directory_name: &str) -> Result<(), String> {
    let safe_directory_name = validate_directory_name(directory_name)?;
    let target_dir = root.join(safe_directory_name);
    if !target_dir.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&target_dir).map_err(|e| {
        format!(
            "Failed to delete pool directory {}: {e}",
            target_dir.display()
        )
    })
}

fn read_figure_pool_portrait_in_root(
    root: &Path,
    directory_name: &str,
    relative_path: &str,
) -> Result<FigurePoolPortraitOutput, String> {
    let safe_directory_name = validate_directory_name(directory_name)?;
    let safe_relative = validate_portrait_relative_path(relative_path)?;
    let portrait_path = root.join(safe_directory_name).join(safe_relative);
    let bytes = fs::read(&portrait_path)
        .map_err(|e| format!("Failed to read portrait {}: {e}", portrait_path.display()))?;
    Ok(FigurePoolPortraitOutput {
        data_base64: BASE64.encode(bytes),
    })
}

#[tauri::command]
pub async fn list_figure_pool_entries() -> Result<Vec<FigurePoolRepoEntry>, String> {
    let root = repo_root()?;
    tauri::async_runtime::spawn_blocking(move || list_figure_pool_entries_in_root(&root))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn save_figure_pool(input: SaveFigurePoolInput) -> Result<SaveFigurePoolResult, String> {
    let root = repo_root()?;
    tauri::async_runtime::spawn_blocking(move || save_figure_pool_in_root(&root, input))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn delete_figure_pool(directory_name: String) -> Result<(), String> {
    let root = repo_root()?;
    tauri::async_runtime::spawn_blocking(move || delete_figure_pool_in_root(&root, &directory_name))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn read_figure_pool_portrait(
    input: ReadFigurePoolPortraitInput,
) -> Result<FigurePoolPortraitOutput, String> {
    let root = repo_root()?;
    tauri::async_runtime::spawn_blocking(move || {
        read_figure_pool_portrait_in_root(&root, &input.directory_name, &input.relative_path)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use tempfile::TempDir;

    fn pool_json(id: &str, name: &str, is_default: bool) -> String {
        serde_json::to_string_pretty(&json!({
            "id": id,
            "name": name,
            "description": format!("{name} desc"),
            "origin": "imported",
            "isDefault": is_default,
            "createdAt": "2026-04-25T00:00:00.000Z",
            "updatedAt": "2026-04-25T00:00:00.000Z",
            "schemaVersion": 1,
            "validationSummary": { "validCount": 1, "invalidCount": 0, "errorCount": 0 },
            "records": [{
                "slug": "jack_ma",
                "name": "Jack Ma",
                "portrait_url": "portraits/jack_ma.jpg",
                "quote_en": "Q",
                "quote_zh": "Q",
                "core_traits": "A",
                "thinking_style": "B",
                "temperament_tags": "C",
                "temperament_summary": "D",
                "loading_copy_zh": "E",
                "loading_copy_en": "F",
                "bio_zh": "G",
                "bio_en": "H",
                "achievements_zh": ["I"],
                "achievements_en": ["J"],
                "status": "valid",
                "errors": [],
                "updatedAt": "2026-04-25T00:00:00.000Z"
            }]
        }))
        .expect("serialize pool")
    }

    fn write_pool(root: &Path, directory_name: &str, json_text: &str) {
        let pool_dir = root.join(directory_name);
        fs::create_dir_all(pool_dir.join("portraits")).expect("create portraits dir");
        fs::write(pool_dir.join(POOL_MANIFEST), json_text).expect("write pool json");
    }

    #[test]
    fn empty_root_is_seeded_with_builtin_zip_pools() {
        let tempdir = TempDir::new().expect("tempdir");

        let entries = list_figure_pool_entries_in_root(tempdir.path()).expect("load entries");

        assert_eq!(entries.len(), 1);
        let parsed: Value = serde_json::from_str(&entries[0].pool_json).expect("parse pool");
        assert_eq!(entries[0].directory_name, "mbti");
        assert_eq!(parsed["id"], "mbti");
        assert_eq!(parsed["origin"], "builtin");
        assert_eq!(parsed["isDefault"], true);
        assert!(tempdir.path().join("mbti").join(POOL_MANIFEST).exists());
        assert!(!tempdir.path().join("entrepreneurs").exists());
        assert!(!tempdir.path().join("scientists").exists());
    }

    #[test]
    fn non_empty_root_is_not_seeded_with_builtin_zip_pools() {
        let tempdir = TempDir::new().expect("tempdir");
        write_pool(
            tempdir.path(),
            "自定义候选池",
            &pool_json("custom-pool", "自定义候选池", true),
        );

        let entries = list_figure_pool_entries_in_root(tempdir.path()).expect("load entries");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].directory_name, "自定义候选池");
    }

    #[test]
    fn loads_pool_entries_from_first_level_pool_directories() {
        let tempdir = TempDir::new().expect("tempdir");
        write_pool(
            tempdir.path(),
            "企业家候选池",
            &pool_json("pool-1", "企业家候选池", true),
        );
        fs::write(tempdir.path().join("ignore.json"), "{}").expect("write ignored file");

        let entries = list_figure_pool_entries_in_root(tempdir.path()).expect("load entries");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].directory_name, "企业家候选池");
        let parsed: Value = serde_json::from_str(&entries[0].pool_json).expect("parse pool");
        assert_eq!(parsed["id"], "pool-1");
    }

    #[test]
    fn rename_keeps_id_and_auto_suffixes_name_collisions() {
        let tempdir = TempDir::new().expect("tempdir");
        write_pool(
            tempdir.path(),
            "投资人候选池",
            &pool_json("pool-1", "投资人候选池", true),
        );
        write_pool(
            tempdir.path(),
            "企业家候选池",
            &pool_json("pool-2", "企业家候选池", false),
        );

        let result = save_figure_pool_in_root(
            tempdir.path(),
            SaveFigurePoolInput {
                requested_name: "企业家候选池".to_string(),
                pool_json: pool_json("pool-1", "企业家候选池", true),
                previous_directory_name: Some("投资人候选池".to_string()),
                portraits: Vec::new(),
                remove_portrait_paths: Vec::new(),
            },
        )
        .expect("rename pool");

        assert_eq!(result.directory_name, "企业家候选池 (2)");
        let parsed: Value = serde_json::from_str(&result.pool_json).expect("parse pool");
        assert_eq!(parsed["id"], "pool-1");
        assert_eq!(parsed["name"], "企业家候选池 (2)");
        assert!(tempdir.path().join("企业家候选池 (2)").exists());
        assert!(!tempdir.path().join("投资人候选池").exists());
    }

    #[test]
    fn save_normalizes_default_pool_to_single_true_value() {
        let tempdir = TempDir::new().expect("tempdir");
        write_pool(
            tempdir.path(),
            "候选池甲",
            &pool_json("pool-1", "候选池甲", true),
        );
        write_pool(
            tempdir.path(),
            "候选池乙",
            &pool_json("pool-2", "候选池乙", true),
        );

        let _saved = save_figure_pool_in_root(
            tempdir.path(),
            SaveFigurePoolInput {
                requested_name: "候选池乙".to_string(),
                pool_json: pool_json("pool-2", "候选池乙", true),
                previous_directory_name: Some("候选池乙".to_string()),
                portraits: Vec::new(),
                remove_portrait_paths: Vec::new(),
            },
        )
        .expect("save pool");

        let left: Value = serde_json::from_str(
            &fs::read_to_string(tempdir.path().join("候选池甲").join(POOL_MANIFEST))
                .expect("read left"),
        )
        .expect("parse left");
        let right: Value = serde_json::from_str(
            &fs::read_to_string(tempdir.path().join("候选池乙").join(POOL_MANIFEST))
                .expect("read right"),
        )
        .expect("parse right");

        assert_eq!(left["isDefault"], false);
        assert_eq!(right["isDefault"], true);
    }

    #[test]
    fn delete_removes_pool_directory_recursively() {
        let tempdir = TempDir::new().expect("tempdir");
        write_pool(
            tempdir.path(),
            "动漫人格候选池",
            &pool_json("pool-1", "动漫人格候选池", true),
        );
        fs::write(
            tempdir
                .path()
                .join("动漫人格候选池")
                .join("portraits")
                .join("hero.png"),
            [1_u8, 2, 3],
        )
        .expect("write portrait");

        delete_figure_pool_in_root(tempdir.path(), "动漫人格候选池").expect("delete pool");

        assert!(!tempdir.path().join("动漫人格候选池").exists());
    }

    #[test]
    fn save_writes_and_reads_pool_local_portraits() {
        let tempdir = TempDir::new().expect("tempdir");

        let _saved = save_figure_pool_in_root(
            tempdir.path(),
            SaveFigurePoolInput {
                requested_name: "人物候选池".to_string(),
                pool_json: pool_json("pool-1", "人物候选池", true),
                previous_directory_name: None,
                portraits: vec![FigurePoolPortraitInput {
                    relative_path: "portraits/jack_ma.jpg".to_string(),
                    data_base64: BASE64.encode([7_u8, 8, 9]),
                }],
                remove_portrait_paths: Vec::new(),
            },
        )
        .expect("save pool");

        let portrait = read_figure_pool_portrait_in_root(
            tempdir.path(),
            "人物候选池",
            "portraits/jack_ma.jpg",
        )
        .expect("read portrait");

        assert_eq!(
            BASE64.decode(portrait.data_base64).expect("decode"),
            vec![7_u8, 8, 9]
        );
    }
}
