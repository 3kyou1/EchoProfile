/**
 * Application configuration constants
 * Centralized configuration for the Claude Code History Viewer
 */

// Repository information
export const REPO_OWNER = 'jhlee0409';
export const REPO_NAME = 'claude-code-history-viewer';

// GitHub URLs
export const GITHUB_REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
export const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
export const GITHUB_RELEASE_URL = `${GITHUB_REPO_URL}/releases/tag`;
export const GITHUB_LATEST_RELEASE_API = `${GITHUB_API_URL}/releases/latest`;

// User Agent for API requests
export const USER_AGENT = 'Claude-Code-History-Viewer';
