use crate::models::{ClaudeMessage, ClaudeProject, ClaudeSession};
use crate::providers;
use crate::utils::parse_rfc3339_utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

/// Parameter for passing custom Claude paths from frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomClaudePathParam {
    pub path: String,
    pub label: Option<String>,
}

const PROVIDER_SCAN_CACHE_FILE: &str = "provider-scan-cache.json";
const PROVIDER_SCAN_CACHE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ProviderScanCache {
    version: u32,
    entries: HashMap<String, ProviderScanCacheEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProviderScanCacheEntry {
    fingerprint: String,
    projects: Vec<ClaudeProject>,
}

#[derive(Debug, Serialize)]
struct ProviderScanCacheKey<'a> {
    providers: Vec<String>,
    claude_path: Option<&'a String>,
    custom_claude_paths: &'a [CustomClaudePathParam],
    wsl_enabled: bool,
    wsl_excluded_distros: &'a [String],
}

fn normalize_provider_ids(providers: Vec<String>) -> Vec<String> {
    let mut normalized = providers;
    normalized.sort();
    normalized.dedup();
    normalized
}

fn provider_scan_cache_path() -> Result<PathBuf, String> {
    crate::app_dirs::app_data_path(PROVIDER_SCAN_CACHE_FILE)
}

fn load_provider_scan_cache_at(path: &Path) -> ProviderScanCache {
    let Ok(content) = fs::read_to_string(path) else {
        return ProviderScanCache {
            version: PROVIDER_SCAN_CACHE_VERSION,
            entries: HashMap::new(),
        };
    };
    let Ok(cache) = serde_json::from_str::<ProviderScanCache>(&content) else {
        return ProviderScanCache {
            version: PROVIDER_SCAN_CACHE_VERSION,
            entries: HashMap::new(),
        };
    };
    if cache.version == PROVIDER_SCAN_CACHE_VERSION {
        cache
    } else {
        ProviderScanCache {
            version: PROVIDER_SCAN_CACHE_VERSION,
            entries: HashMap::new(),
        }
    }
}

fn save_provider_scan_cache_at(path: &Path, cache: &ProviderScanCache) {
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let Ok(content) = serde_json::to_string(cache) else {
        return;
    };
    let tmp_path = path.with_extension("json.tmp");
    if fs::write(&tmp_path, content).is_ok() {
        let _ = fs::rename(tmp_path, path);
    }
}

fn get_cached_provider_projects_at(
    path: &Path,
    cache_key: &str,
    fingerprint: &str,
) -> Option<Vec<ClaudeProject>> {
    let cache = load_provider_scan_cache_at(path);
    let entry = cache.entries.get(cache_key)?;
    if entry.fingerprint == fingerprint {
        Some(entry.projects.clone())
    } else {
        None
    }
}

fn save_cached_provider_projects_at(
    path: &Path,
    cache_key: String,
    fingerprint: String,
    projects: Vec<ClaudeProject>,
) {
    let mut cache = load_provider_scan_cache_at(path);
    cache.version = PROVIDER_SCAN_CACHE_VERSION;
    cache.entries.insert(
        cache_key,
        ProviderScanCacheEntry {
            fingerprint,
            projects,
        },
    );
    save_provider_scan_cache_at(path, &cache);
}

fn provider_scan_cache_key(
    providers: Vec<String>,
    claude_path: Option<&String>,
    custom_claude_paths: &[CustomClaudePathParam],
    wsl_enabled: bool,
    wsl_excluded_distros: &[String],
) -> String {
    serde_json::to_string(&ProviderScanCacheKey {
        providers,
        claude_path,
        custom_claude_paths,
        wsl_enabled,
        wsl_excluded_distros,
    })
    .unwrap_or_else(|_| "provider-scan-cache-key".to_string())
}

fn hash_path_metadata(hasher: &mut DefaultHasher, path: &Path) {
    if !path.exists() {
        path.to_string_lossy().hash(hasher);
        "missing".hash(hasher);
        return;
    }

    let mut entries = Vec::new();
    for entry in walkdir::WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        let entry_path = entry.path().to_path_buf();
        let Ok(metadata) = fs::symlink_metadata(&entry_path) else {
            continue;
        };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        entries.push((
            entry_path.to_string_lossy().to_string(),
            metadata.len(),
            modified,
            metadata.file_type().is_dir(),
        ));
    }

    entries.sort_by(|left, right| left.0.cmp(&right.0));
    for entry in entries {
        entry.hash(hasher);
    }
}

fn provider_fingerprint_roots(
    provider: &str,
    claude_path: Option<&String>,
    custom_claude_paths: &[CustomClaudePathParam],
) -> Vec<PathBuf> {
    match provider {
        "claude" => {
            let mut roots = Vec::new();
            if let Some(base) = claude_path
                .cloned()
                .or_else(providers::claude::get_base_path)
            {
                roots.push(PathBuf::from(base).join("projects"));
            }
            roots.extend(
                custom_claude_paths
                    .iter()
                    .map(|custom| PathBuf::from(&custom.path).join("projects")),
            );
            roots
        }
        "codex" => providers::codex::get_base_path()
            .map(|base| {
                let base = PathBuf::from(base);
                vec![base.join("sessions"), base.join("archived_sessions")]
            })
            .unwrap_or_default(),
        "gemini" => providers::gemini::get_base_path()
            .map(|base| vec![PathBuf::from(base).join("tmp")])
            .unwrap_or_default(),
        "opencode" => providers::opencode::get_base_path()
            .map(|base| vec![PathBuf::from(base).join("storage")])
            .unwrap_or_default(),
        "cline" => providers::cline::detect()
            .filter(|info| !info.base_path.is_empty())
            .map(|info| vec![PathBuf::from(info.base_path)])
            .unwrap_or_default(),
        "cursor" => providers::cursor::get_base_path()
            .map(|base| vec![base.join("workspaceStorage"), base.join("globalStorage")])
            .unwrap_or_default(),
        "aider" => providers::aider::detect()
            .filter(|info| !info.base_path.is_empty())
            .map(|info| vec![PathBuf::from(info.base_path)])
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn provider_scan_fingerprint(
    providers_to_scan: &[String],
    claude_path: Option<&String>,
    custom_claude_paths: &[CustomClaudePathParam],
) -> String {
    let mut hasher = DefaultHasher::new();
    PROVIDER_SCAN_CACHE_VERSION.hash(&mut hasher);
    for provider in providers_to_scan {
        provider.hash(&mut hasher);
        let roots = provider_fingerprint_roots(provider, claude_path, custom_claude_paths);
        roots.len().hash(&mut hasher);
        for root in roots {
            hash_path_metadata(&mut hasher, &root);
        }
    }
    hasher.finish().to_string()
}

fn try_load_cached_provider_projects(
    cache_key: &str,
    fingerprint: &str,
) -> Option<Vec<ClaudeProject>> {
    let path = provider_scan_cache_path().ok()?;
    get_cached_provider_projects_at(&path, cache_key, fingerprint)
}

fn persist_provider_projects_cache(
    cache_key: String,
    fingerprint: String,
    projects: &[ClaudeProject],
) {
    let Ok(path) = provider_scan_cache_path() else {
        return;
    };
    save_cached_provider_projects_at(&path, cache_key, fingerprint, projects.to_vec());
}

/// Detect all available providers
#[tauri::command]
pub async fn detect_providers() -> Result<Vec<providers::ProviderInfo>, String> {
    Ok(providers::detect_providers())
}

/// Scan projects from all (or selected) providers
#[tauri::command]
pub async fn scan_all_projects(
    claude_path: Option<String>,
    active_providers: Option<Vec<String>>,
    custom_claude_paths: Option<Vec<CustomClaudePathParam>>,
    wsl_enabled: Option<bool>,
    wsl_excluded_distros: Option<Vec<String>>,
) -> Result<Vec<ClaudeProject>, String> {
    scan_all_projects_with_options(
        claude_path,
        active_providers,
        custom_claude_paths,
        wsl_enabled,
        wsl_excluded_distros,
        true,
    )
    .await
}

pub async fn scan_all_projects_with_options(
    claude_path: Option<String>,
    active_providers: Option<Vec<String>>,
    custom_claude_paths: Option<Vec<CustomClaudePathParam>>,
    wsl_enabled: Option<bool>,
    wsl_excluded_distros: Option<Vec<String>>,
    use_cache: bool,
) -> Result<Vec<ClaudeProject>, String> {
    let providers_to_scan = normalize_provider_ids(active_providers.unwrap_or_else(|| {
        vec![
            "claude".to_string(),
            "codex".to_string(),
            "gemini".to_string(),
            "opencode".to_string(),
            "cline".to_string(),
            "cursor".to_string(),
            "aider".to_string(),
        ]
    }));
    let custom_claude_paths_for_cache = custom_claude_paths.clone().unwrap_or_default();
    let wsl_excluded_distros_for_cache = wsl_excluded_distros.clone().unwrap_or_default();
    let wsl_cache_enabled = wsl_enabled.unwrap_or(false);
    let cache_key = provider_scan_cache_key(
        providers_to_scan.clone(),
        claude_path.as_ref(),
        &custom_claude_paths_for_cache,
        wsl_cache_enabled,
        &wsl_excluded_distros_for_cache,
    );
    let cache_fingerprint = provider_scan_fingerprint(
        &providers_to_scan,
        claude_path.as_ref(),
        &custom_claude_paths_for_cache,
    );

    // WSL paths can represent remote/mounted filesystems with different freshness semantics.
    // Keep those live for now; all regular providers use the shared cache path.
    let should_use_cache = use_cache && !wsl_cache_enabled;
    if should_use_cache {
        if let Some(projects) = try_load_cached_provider_projects(&cache_key, &cache_fingerprint) {
            return Ok(projects);
        }
    }

    let mut all_projects = Vec::new();

    // Claude (default path)
    if providers_to_scan.iter().any(|p| p == "claude") {
        let claude_base = claude_path
            .clone()
            .or_else(providers::claude::get_base_path);
        if let Some(base) = claude_base {
            match crate::commands::project::scan_projects(base).await {
                Ok(mut projects) => {
                    for p in &mut projects {
                        if p.provider.is_none() {
                            p.provider = Some("claude".to_string());
                        }
                    }
                    all_projects.extend(projects);
                }
                Err(e) => {
                    log::warn!("Claude scan failed: {e}");
                }
            }
        }

        // Claude (custom paths)
        if let Some(ref custom_paths) = custom_claude_paths {
            for custom in custom_paths {
                let custom_base = std::path::PathBuf::from(&custom.path);
                if let Err(e) = crate::utils::validate_custom_claude_path(&custom_base) {
                    log::warn!("Skipping invalid custom Claude path: {e}");
                    continue;
                }
                match crate::commands::project::scan_projects(custom.path.clone()).await {
                    Ok(mut projects) => {
                        for p in &mut projects {
                            if p.provider.is_none() {
                                p.provider = Some("claude".to_string());
                            }
                            p.custom_directory_label.clone_from(&custom.label);
                        }
                        all_projects.extend(projects);
                    }
                    Err(e) => {
                        log::warn!("Custom Claude path scan failed ({}): {e}", custom.path);
                    }
                }
            }
        }
    }

    // Codex
    if providers_to_scan.iter().any(|p| p == "codex") {
        match providers::codex::scan_projects() {
            Ok(projects) => all_projects.extend(projects),
            Err(e) => {
                log::warn!("Codex scan failed: {e}");
            }
        }
    }

    // Gemini
    if providers_to_scan.iter().any(|p| p == "gemini") {
        match providers::gemini::scan_projects() {
            Ok(projects) => all_projects.extend(projects),
            Err(e) => {
                log::warn!("Gemini scan failed: {e}");
            }
        }
    }

    // OpenCode
    if providers_to_scan.iter().any(|p| p == "opencode") {
        match providers::opencode::scan_projects() {
            Ok(projects) => all_projects.extend(projects),
            Err(e) => {
                log::warn!("OpenCode scan failed: {e}");
            }
        }
    }

    // Cline
    if providers_to_scan.iter().any(|p| p == "cline") {
        match providers::cline::scan_projects() {
            Ok(projects) => all_projects.extend(projects),
            Err(e) => {
                log::warn!("Cline scan failed: {e}");
            }
        }
    }

    // Cursor
    if providers_to_scan.iter().any(|p| p == "cursor") {
        match providers::cursor::scan_projects() {
            Ok(projects) => all_projects.extend(projects),
            Err(e) => {
                log::warn!("Cursor scan failed: {e}");
            }
        }
    }

    // Aider
    if providers_to_scan.iter().any(|p| p == "aider") {
        match providers::aider::scan_projects() {
            Ok(projects) => all_projects.extend(projects),
            Err(e) => {
                log::warn!("Aider scan failed: {e}");
            }
        }
    }

    // WSL scanning (Claude only — other providers' load_sessions/load_messages
    // use native base paths internally, so WSL projects would be visible but
    // not loadable. Extending other providers requires base-path-aware loaders.)
    if wsl_enabled.unwrap_or(false) && providers_to_scan.iter().any(|p| p == "claude") {
        let excluded = wsl_excluded_distros.unwrap_or_default();

        for (distro, home_path) in resolve_active_wsl_distros(&excluded) {
            let wsl_label = format!("WSL: {}", distro.name);
            let claude_linux_path = home_path.join(".claude");

            let unc_path =
                match crate::wsl::resolve_wsl_provider_path(&distro.name, &claude_linux_path) {
                    Some(p) => p,
                    None => continue,
                };

            let unc_str = unc_path.to_string_lossy().to_string();
            match crate::commands::project::scan_projects(unc_str).await {
                Ok(mut projects) => {
                    for p in &mut projects {
                        if p.provider.is_none() {
                            p.provider = Some("claude".to_string());
                        }
                        p.custom_directory_label = Some(wsl_label.clone());
                    }
                    all_projects.extend(projects);
                }
                Err(e) => {
                    log::warn!("WSL: Claude scan failed for '{}': {e}", distro.name);
                }
            }
        }
    }

    // Hide empty containers that have no session files regardless of provider.
    all_projects.retain(|project| project.session_count > 0);

    all_projects.sort_by(|a, b| {
        match (
            parse_rfc3339_utc(&a.last_modified),
            parse_rfc3339_utc(&b.last_modified),
        ) {
            (Some(a_ts), Some(b_ts)) => b_ts.cmp(&a_ts),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => b.last_modified.cmp(&a.last_modified),
        }
    });
    if should_use_cache {
        persist_provider_projects_cache(cache_key, cache_fingerprint, &all_projects);
    }
    Ok(all_projects)
}

/// Load sessions for a specific provider's project
#[tauri::command]
pub async fn load_provider_sessions(
    provider: String,
    project_path: String,
    exclude_sidechain: Option<bool>,
) -> Result<Vec<ClaudeSession>, String> {
    let exclude = exclude_sidechain.unwrap_or(false);

    match provider.as_str() {
        "claude" => {
            let mut sessions =
                crate::commands::session::load_project_sessions(project_path, Some(exclude))
                    .await?;
            for s in &mut sessions {
                if s.provider.is_none() {
                    s.provider = Some("claude".to_string());
                }
            }
            Ok(sessions)
        }
        "codex" => providers::codex::load_sessions(&project_path, exclude),
        "gemini" => providers::gemini::load_sessions(&project_path, exclude),
        "opencode" => providers::opencode::load_sessions(&project_path, exclude),
        "cline" => providers::cline::load_sessions(&project_path, exclude),
        "cursor" => providers::cursor::load_sessions(&project_path, exclude),
        "aider" => providers::aider::load_sessions(&project_path, exclude),
        _ => Err(format!("Unknown provider: {provider}")),
    }
}

/// Load messages from a specific provider's session
#[tauri::command]
pub async fn load_provider_messages(
    provider: String,
    session_path: String,
) -> Result<Vec<ClaudeMessage>, String> {
    let messages = match provider.as_str() {
        "claude" => {
            let mut messages =
                crate::commands::session::load_session_messages(session_path).await?;
            for m in &mut messages {
                if m.provider.is_none() {
                    m.provider = Some("claude".to_string());
                }
            }
            messages
        }
        "codex" => providers::codex::load_messages(&session_path)?,
        "gemini" => providers::gemini::load_messages(&session_path)?,
        "opencode" => providers::opencode::load_messages(&session_path)?,
        "cline" => providers::cline::load_messages(&session_path)?,
        "cursor" => providers::cursor::load_messages(&session_path)?,
        "aider" => providers::aider::load_messages(&session_path)?,
        _ => return Err(format!("Unknown provider: {provider}")),
    };

    Ok(merge_tool_execution_messages(messages))
}

/// Search across all (or selected) providers
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn search_all_providers(
    claude_path: Option<String>,
    query: String,
    active_providers: Option<Vec<String>>,
    filters: Option<Value>,
    limit: Option<usize>,
    custom_claude_paths: Option<Vec<CustomClaudePathParam>>,
    wsl_enabled: Option<bool>,
    wsl_excluded_distros: Option<Vec<String>>,
) -> Result<Vec<ClaudeMessage>, String> {
    let max_results = limit.unwrap_or(100);
    let search_filters =
        filters.unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::default()));
    crate::commands::session::validate_search_filters(&search_filters)?;

    let providers_to_search = active_providers.unwrap_or_else(|| {
        vec![
            "claude".to_string(),
            "codex".to_string(),
            "gemini".to_string(),
            "opencode".to_string(),
            "cline".to_string(),
            "cursor".to_string(),
            "aider".to_string(),
        ]
    });

    let mut all_results = Vec::new();

    // Claude
    if providers_to_search.iter().any(|p| p == "claude") {
        let claude_base = claude_path
            .clone()
            .or_else(providers::claude::get_base_path);
        if let Some(base) = claude_base {
            match crate::commands::session::search_messages(
                base,
                query.clone(),
                search_filters.clone(),
                Some(max_results),
            )
            .await
            {
                Ok(mut results) => {
                    for m in &mut results {
                        if m.provider.is_none() {
                            m.provider = Some("claude".to_string());
                        }
                    }
                    all_results.extend(results);
                }
                Err(e) => {
                    log::warn!("Claude search failed: {e}");
                }
            }
        }

        // Claude search (custom paths)
        if let Some(ref custom_paths) = custom_claude_paths {
            for custom in custom_paths {
                let custom_base = std::path::PathBuf::from(&custom.path);
                if crate::utils::validate_custom_claude_path(&custom_base).is_err() {
                    continue;
                }
                match crate::commands::session::search_messages(
                    custom.path.clone(),
                    query.clone(),
                    search_filters.clone(),
                    Some(max_results),
                )
                .await
                {
                    Ok(mut results) => {
                        for m in &mut results {
                            if m.provider.is_none() {
                                m.provider = Some("claude".to_string());
                            }
                        }
                        all_results.extend(results);
                    }
                    Err(e) => {
                        log::warn!("Custom Claude path search failed ({}): {e}", custom.path);
                    }
                }
            }
        }
    }

    // Codex
    if providers_to_search.iter().any(|p| p == "codex") {
        match providers::codex::search(&query, max_results) {
            Ok(results) => all_results.extend(results),
            Err(e) => {
                log::warn!("Codex search failed: {e}");
            }
        }
    }

    // Gemini
    if providers_to_search.iter().any(|p| p == "gemini") {
        match providers::gemini::search(&query, max_results) {
            Ok(results) => all_results.extend(results),
            Err(e) => {
                log::warn!("Gemini search failed: {e}");
            }
        }
    }

    // OpenCode
    if providers_to_search.iter().any(|p| p == "opencode") {
        match providers::opencode::search(&query, max_results) {
            Ok(results) => all_results.extend(results),
            Err(e) => {
                log::warn!("OpenCode search failed: {e}");
            }
        }
    }

    // Cline
    if providers_to_search.iter().any(|p| p == "cline") {
        match providers::cline::search(&query, max_results) {
            Ok(results) => all_results.extend(results),
            Err(e) => {
                log::warn!("Cline search failed: {e}");
            }
        }
    }

    // Cursor
    if providers_to_search.iter().any(|p| p == "cursor") {
        match providers::cursor::search(&query, max_results) {
            Ok(results) => all_results.extend(results),
            Err(e) => {
                log::warn!("Cursor search failed: {e}");
            }
        }
    }

    // Aider
    if providers_to_search.iter().any(|p| p == "aider") {
        match providers::aider::search(&query, max_results) {
            Ok(results) => all_results.extend(results),
            Err(e) => {
                log::warn!("Aider search failed: {e}");
            }
        }
    }

    // WSL search (currently Claude only)
    if wsl_enabled.unwrap_or(false) && providers_to_search.iter().any(|p| p == "claude") {
        let excluded = wsl_excluded_distros.unwrap_or_default();

        for (distro, home_path) in resolve_active_wsl_distros(&excluded) {
            let claude_linux_path = home_path.join(".claude");
            if let Some(unc_path) =
                crate::wsl::resolve_wsl_provider_path(&distro.name, &claude_linux_path)
            {
                let unc_str = unc_path.to_string_lossy().to_string();
                match crate::commands::session::search_messages(
                    unc_str,
                    query.clone(),
                    search_filters.clone(),
                    Some(max_results),
                )
                .await
                {
                    Ok(mut results) => {
                        for m in &mut results {
                            if m.provider.is_none() {
                                m.provider = Some("claude".to_string());
                            }
                        }
                        all_results.extend(results);
                    }
                    Err(e) => {
                        log::warn!("WSL Claude search failed for '{}': {e}", distro.name);
                    }
                }
            }
        }
    }

    all_results = crate::commands::session::apply_search_filters(all_results, &search_filters);

    // Sort by parsed timestamp descending (robust to `Z` vs `+00:00` formats)
    all_results.sort_by(|a, b| {
        match (
            parse_rfc3339_utc(&a.timestamp),
            parse_rfc3339_utc(&b.timestamp),
        ) {
            (Some(a_ts), Some(b_ts)) => b_ts.cmp(&a_ts),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => b.timestamp.cmp(&a.timestamp),
        }
    });
    all_results.truncate(max_results);

    Ok(all_results)
}

/// Resolve active (non-excluded) WSL distros with their home paths.
fn resolve_active_wsl_distros(
    excluded: &[String],
) -> Vec<(crate::wsl::WslDistro, std::path::PathBuf)> {
    let distros = crate::wsl::detect_distros();
    let mut result = Vec::new();
    for distro in distros {
        if excluded.contains(&distro.name) {
            continue;
        }
        match crate::wsl::resolve_home_path(&distro.name) {
            Ok(home) => result.push((distro, home)),
            Err(e) => {
                log::warn!("WSL: Could not resolve home for '{}': {e}", distro.name);
            }
        }
    }
    result
}

fn merge_tool_execution_messages(messages: Vec<ClaudeMessage>) -> Vec<ClaudeMessage> {
    let mut merged: Vec<ClaudeMessage> = Vec::with_capacity(messages.len());

    for msg in messages {
        if msg.message_type != "user" {
            merged.push(msg);
            continue;
        }

        let Some(content_arr) = msg.content.as_ref().and_then(Value::as_array) else {
            merged.push(msg);
            continue;
        };

        let mut saw_tool_result = false;
        let mut remaining_blocks: Vec<Value> = Vec::with_capacity(content_arr.len());

        for block in content_arr {
            if block.get("type").and_then(Value::as_str) != Some("tool_result") {
                remaining_blocks.push(block.clone());
                continue;
            }

            saw_tool_result = true;
            let Some(tool_use_id) = block.get("tool_use_id").and_then(Value::as_str) else {
                remaining_blocks.push(block.clone());
                continue;
            };

            let mut merged_this_result = false;
            for prev in merged.iter_mut().rev() {
                if has_matching_tool_use(prev, tool_use_id) {
                    append_content_block(prev, block.clone());
                    merged_this_result = true;
                    break;
                }
            }

            if !merged_this_result {
                remaining_blocks.push(block.clone());
            }
        }

        if !saw_tool_result {
            merged.push(msg);
            continue;
        }

        if !remaining_blocks.is_empty() {
            let mut remaining_msg = msg;
            remaining_msg.content = Some(Value::Array(remaining_blocks));
            merged.push(remaining_msg);
        }
    }

    merged
}

fn has_matching_tool_use(msg: &ClaudeMessage, tool_use_id: &str) -> bool {
    if msg.message_type != "assistant" {
        return false;
    }

    let Some(arr) = msg.content.as_ref().and_then(Value::as_array) else {
        return false;
    };
    arr.iter().any(|item| {
        item.get("type").and_then(Value::as_str) == Some("tool_use")
            && item.get("id").and_then(Value::as_str) == Some(tool_use_id)
    })
}

fn append_content_block(msg: &mut ClaudeMessage, block: Value) {
    match &mut msg.content {
        Some(Value::Array(arr)) => arr.push(block),
        _ => msg.content = Some(Value::Array(vec![block])),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_project(provider: &str, name: &str) -> ClaudeProject {
        ClaudeProject {
            name: name.to_string(),
            path: format!("{provider}://{name}"),
            actual_path: format!("/tmp/{name}"),
            session_count: 1,
            message_count: 2,
            last_modified: "2026-04-29T00:00:00Z".to_string(),
            git_info: None,
            provider: Some(provider.to_string()),
            storage_type: None,
            custom_directory_label: None,
        }
    }

    #[test]
    fn provider_scan_cache_returns_only_matching_fingerprint() {
        let temp = tempfile::tempdir().unwrap();
        let cache_path = temp.path().join("provider-scan-cache.json");
        let projects = vec![make_project("codex", "EchoProfile")];

        save_cached_provider_projects_at(
            &cache_path,
            "codex+claude".to_string(),
            "fingerprint-a".to_string(),
            projects.clone(),
        );

        assert_eq!(
            get_cached_provider_projects_at(&cache_path, "codex+claude", "fingerprint-a")
                .unwrap()
                .len(),
            1
        );
        assert!(
            get_cached_provider_projects_at(&cache_path, "codex+claude", "fingerprint-b").is_none()
        );
    }

    #[test]
    fn provider_scan_cache_key_separates_provider_sets() {
        let claude_path = Some("/tmp/.claude".to_string());
        let custom_paths = vec![CustomClaudePathParam {
            path: "/tmp/custom-claude".to_string(),
            label: Some("Custom".to_string()),
        }];
        let excluded = vec!["Ubuntu".to_string()];

        let claude_only = provider_scan_cache_key(
            vec!["claude".to_string()],
            claude_path.as_ref(),
            &custom_paths,
            false,
            &excluded,
        );
        let all_providers = provider_scan_cache_key(
            vec![
                "aider".to_string(),
                "claude".to_string(),
                "cline".to_string(),
                "codex".to_string(),
                "cursor".to_string(),
                "gemini".to_string(),
                "opencode".to_string(),
            ],
            claude_path.as_ref(),
            &custom_paths,
            false,
            &excluded,
        );

        assert_ne!(claude_only, all_providers);
        assert!(all_providers.contains("codex"));
        assert!(all_providers.contains("opencode"));
        assert!(all_providers.contains("aider"));
    }

    #[test]
    fn path_metadata_fingerprint_changes_when_any_provider_file_changes() {
        let temp = tempfile::tempdir().unwrap();
        let provider_root = temp.path().join("provider-root");
        fs::create_dir_all(&provider_root).unwrap();
        let file_path = provider_root.join("session.jsonl");
        fs::write(&file_path, "one").unwrap();

        let mut first = DefaultHasher::new();
        hash_path_metadata(&mut first, &provider_root);
        fs::write(&file_path, "one plus change").unwrap();
        let mut second = DefaultHasher::new();
        hash_path_metadata(&mut second, &provider_root);

        assert_ne!(first.finish(), second.finish());
    }

    fn make_message(message_type: &str, content: Value) -> ClaudeMessage {
        ClaudeMessage {
            uuid: format!("{message_type}-id"),
            parent_uuid: None,
            session_id: "session-1".to_string(),
            timestamp: "2026-02-19T12:00:00Z".to_string(),
            message_type: message_type.to_string(),
            content: Some(content),
            project_name: None,
            tool_use: None,
            tool_use_result: None,
            is_sidechain: None,
            usage: None,
            role: Some(message_type.to_string()),
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
            provider: Some("claude".to_string()),
        }
    }

    #[test]
    fn merge_tool_result_into_previous_tool_use_message() {
        let tool_use = make_message(
            "assistant",
            serde_json::json!([{
                "type": "tool_use",
                "id": "call_123",
                "name": "Bash",
                "input": { "command": "pwd" }
            }]),
        );
        let tool_result = make_message(
            "user",
            serde_json::json!([{
                "type": "tool_result",
                "tool_use_id": "call_123",
                "content": "ok"
            }]),
        );

        let merged = merge_tool_execution_messages(vec![tool_use, tool_result]);
        assert_eq!(merged.len(), 1);
        let arr = merged[0]
            .content
            .as_ref()
            .and_then(Value::as_array)
            .expect("merged content should be array");
        assert_eq!(arr.len(), 2);
        assert_eq!(
            arr[1].get("type").and_then(Value::as_str),
            Some("tool_result")
        );
    }

    #[test]
    fn merge_multiple_tool_results_from_single_message() {
        let tool_use = make_message(
            "assistant",
            serde_json::json!([
                {
                    "type": "tool_use",
                    "id": "call_1",
                    "name": "Bash",
                    "input": { "command": "pwd" }
                },
                {
                    "type": "tool_use",
                    "id": "call_2",
                    "name": "Bash",
                    "input": { "command": "ls" }
                }
            ]),
        );
        let tool_result = make_message(
            "user",
            serde_json::json!([
                {
                    "type": "tool_result",
                    "tool_use_id": "call_1",
                    "content": "ok-1"
                },
                {
                    "type": "tool_result",
                    "tool_use_id": "call_2",
                    "content": "ok-2"
                }
            ]),
        );

        let merged = merge_tool_execution_messages(vec![tool_use, tool_result]);
        assert_eq!(merged.len(), 1);
        let arr = merged[0]
            .content
            .as_ref()
            .and_then(Value::as_array)
            .expect("merged content should be array");
        assert_eq!(arr.len(), 4);
    }

    #[test]
    fn partial_merge_preserves_unmerged_and_non_tool_content() {
        let tool_use = make_message(
            "assistant",
            serde_json::json!([{
                "type": "tool_use",
                "id": "call_1",
                "name": "Bash",
                "input": { "command": "pwd" }
            }]),
        );
        let mixed_user = make_message(
            "user",
            serde_json::json!([
                { "type": "text", "text": "prefix" },
                { "type": "tool_result", "tool_use_id": "call_1", "content": "ok-1" },
                { "type": "tool_result", "tool_use_id": "missing_call", "content": "keep-me" },
                { "type": "text", "text": "suffix" }
            ]),
        );

        let merged = merge_tool_execution_messages(vec![tool_use, mixed_user]);
        assert_eq!(merged.len(), 2);

        let assistant_blocks = merged[0]
            .content
            .as_ref()
            .and_then(Value::as_array)
            .expect("assistant blocks should be array");
        assert_eq!(assistant_blocks.len(), 2);
        assert_eq!(
            assistant_blocks[1]
                .get("tool_use_id")
                .and_then(Value::as_str),
            Some("call_1")
        );

        let remaining_user_blocks = merged[1]
            .content
            .as_ref()
            .and_then(Value::as_array)
            .expect("remaining user blocks should be array");
        assert_eq!(remaining_user_blocks.len(), 3);
        assert_eq!(
            remaining_user_blocks[0].get("type").and_then(Value::as_str),
            Some("text")
        );
        assert_eq!(
            remaining_user_blocks[1]
                .get("tool_use_id")
                .and_then(Value::as_str),
            Some("missing_call")
        );
        assert_eq!(
            remaining_user_blocks[2].get("type").and_then(Value::as_str),
            Some("text")
        );
    }
}
