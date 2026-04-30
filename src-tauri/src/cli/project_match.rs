use std::path::{Component, Path, PathBuf};

use crate::models::ClaudeProject;

use super::output::CliError;

pub fn match_current_project(
    cwd: &Path,
    projects: &[ClaudeProject],
    include_ancestor_projects: bool,
) -> Result<Vec<ClaudeProject>, CliError> {
    let ancestors = ancestor_paths_nearest_first(cwd);
    let mut matched = Vec::new();

    for ancestor in ancestors {
        let ancestor_norm = normalize_path_string(&ancestor);
        let mut current_matches: Vec<ClaudeProject> = projects
            .iter()
            .filter(|project| normalize_path_str(&project.actual_path) == ancestor_norm)
            .cloned()
            .collect();

        if current_matches.is_empty() {
            continue;
        }

        matched.append(&mut current_matches);
        if !include_ancestor_projects {
            break;
        }
    }

    if matched.is_empty() {
        return Err(CliError::new(
            "PROJECT_NOT_FOUND",
            format!(
                "No provider history found for current project: {}",
                cwd.display()
            ),
        ));
    }

    Ok(matched)
}

pub fn match_actual_project_path(
    actual_project_path: &str,
    projects: &[ClaudeProject],
) -> Result<Vec<ClaudeProject>, CliError> {
    let target = normalize_path_str(actual_project_path);
    let matched: Vec<ClaudeProject> = projects
        .iter()
        .filter(|project| normalize_path_str(&project.actual_path) == target)
        .cloned()
        .collect();
    if matched.is_empty() {
        return Err(CliError::new(
            "PROJECT_NOT_FOUND",
            format!("No provider history found for actual project path: {actual_project_path}"),
        ));
    }
    Ok(matched)
}

pub fn match_project_path(
    project_path: &str,
    projects: &[ClaudeProject],
) -> Result<Vec<ClaudeProject>, CliError> {
    let matched: Vec<ClaudeProject> = projects
        .iter()
        .filter(|project| project.path == project_path)
        .cloned()
        .collect();
    if matched.is_empty() {
        return Err(CliError::new(
            "PROJECT_NOT_FOUND",
            format!("No provider history found for project path: {project_path}"),
        ));
    }
    Ok(matched)
}

pub fn ancestor_paths_nearest_first(path: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut current = Some(path);
    while let Some(path) = current {
        paths.push(path.to_path_buf());
        current = path.parent();
    }
    paths
}

fn normalize_path_str(path: &str) -> String {
    normalize_path_string(Path::new(path))
}

fn normalize_path_string(path: &Path) -> String {
    let mut parts = Vec::new();
    let mut prefix = String::new();

    for component in path.components() {
        match component {
            Component::Prefix(value) => prefix = value.as_os_str().to_string_lossy().to_string(),
            Component::RootDir => prefix.push('/'),
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = parts.pop();
            }
            Component::Normal(value) => parts.push(value.to_string_lossy().to_string()),
        }
    }

    let mut normalized = prefix;
    if !normalized.ends_with('/') && !normalized.is_empty() && !parts.is_empty() {
        normalized.push('/');
    }
    normalized.push_str(&parts.join("/"));
    if normalized.len() > 1 {
        normalized.trim_end_matches('/').to_string()
    } else {
        normalized
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn project(provider: &str, actual_path: &str) -> crate::models::ClaudeProject {
        crate::models::ClaudeProject {
            name: actual_path
                .rsplit('/')
                .next()
                .unwrap_or(actual_path)
                .to_string(),
            path: format!("{provider}://{actual_path}"),
            actual_path: actual_path.to_string(),
            session_count: 1,
            message_count: 1,
            last_modified: "2026-04-30T00:00:00Z".to_string(),
            git_info: None,
            provider: Some(provider.to_string()),
            storage_type: None,
            custom_directory_label: None,
        }
    }

    #[test]
    fn current_project_picks_nearest_ancestor() {
        let cwd = PathBuf::from("/repo/packages/app/src");
        let projects = vec![
            project("codex", "/repo"),
            project("codex", "/repo/packages/app"),
        ];
        let matches = match_current_project(&cwd, &projects, false).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].actual_path, "/repo/packages/app");
    }

    #[test]
    fn include_ancestor_projects_keeps_all_matches() {
        let cwd = PathBuf::from("/repo/packages/app/src");
        let projects = vec![
            project("codex", "/repo"),
            project("claude", "/repo/packages/app"),
        ];
        let matches = match_current_project(&cwd, &projects, true).unwrap();
        assert_eq!(matches.len(), 2);
    }
}
