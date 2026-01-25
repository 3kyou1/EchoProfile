/**
 * Update system configuration constants
 * Centralized settings for auto-update and manual update functionality
 */

// API Timeouts (in milliseconds)
export const GITHUB_API_TIMEOUT_MS = 10_000; // 10 seconds
export const TAURI_CHECK_TIMEOUT_MS = 15_000; // 15 seconds

// Cache settings
export const UPDATE_CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
export const UPDATE_CACHE_SCHEMA_VERSION = 2;

// UI Timing (in milliseconds)
export const INTRO_MODAL_DELAY_MS = 2_000; // 2 seconds
export const AUTO_CHECK_DELAY_MS = 5_000; // 5 seconds
export const POST_INTRO_CHECK_DELAY_MS = 1_000; // 1 second

// Notification timing (in milliseconds)
export const ERROR_NOTIFICATION_DURATION_MS = 5_000; // 5 seconds
export const SUCCESS_NOTIFICATION_DURATION_MS = 3_000; // 3 seconds
export const CHECKING_NOTIFICATION_TIMEOUT_MS = 30_000; // 30 seconds (failsafe)

// Default postpone interval (in milliseconds)
export const DEFAULT_POSTPONE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
