// Update settings utilities
import type { UpdateSettings } from '../types/updateSettings';
import { DEFAULT_UPDATE_SETTINGS } from '../types/updateSettings';
import { updateLogger } from './logger';

const SETTINGS_KEY = 'update_settings';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const VALID_CHECK_INTERVALS = ['startup', 'daily', 'weekly', 'never'] as const;

export interface ShouldCheckForUpdatesOptions {
  settings?: Pick<
    UpdateSettings,
    | 'autoCheck'
    | 'checkInterval'
    | 'respectOfflineStatus'
    | 'lastPostponedAt'
    | 'lastCheckedAt'
    | 'postponeInterval'
  >;
  now?: number;
  online?: boolean;
}

/**
 * Validate and sanitize parsed settings from localStorage
 */
function validateSettings(parsed: unknown): Partial<UpdateSettings> {
  if (typeof parsed !== 'object' || parsed === null) return {};

  const obj = parsed as Record<string, unknown>;
  const result: Partial<UpdateSettings> = {};

  if (typeof obj.autoCheck === 'boolean') {
    result.autoCheck = obj.autoCheck;
  }
  if (typeof obj.checkInterval === 'string' &&
      VALID_CHECK_INTERVALS.includes(obj.checkInterval as typeof VALID_CHECK_INTERVALS[number])) {
    result.checkInterval = obj.checkInterval as UpdateSettings['checkInterval'];
  }
  if (Array.isArray(obj.skippedVersions) &&
      obj.skippedVersions.every((v): v is string => typeof v === 'string')) {
    result.skippedVersions = obj.skippedVersions;
  }
  if (typeof obj.lastPostponedAt === 'number') {
    result.lastPostponedAt = obj.lastPostponedAt;
  }
  if (typeof obj.lastCheckedAt === 'number') {
    result.lastCheckedAt = obj.lastCheckedAt;
  }
  if (typeof obj.postponeInterval === 'number' && obj.postponeInterval > 0) {
    result.postponeInterval = obj.postponeInterval;
  }
  if (typeof obj.hasSeenIntroduction === 'boolean') {
    result.hasSeenIntroduction = obj.hasSeenIntroduction;
  }
  if (typeof obj.respectOfflineStatus === 'boolean') {
    result.respectOfflineStatus = obj.respectOfflineStatus;
  }
  if (typeof obj.allowCriticalUpdates === 'boolean') {
    result.allowCriticalUpdates = obj.allowCriticalUpdates;
  }

  return result;
}

export function getUpdateSettings(): UpdateSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return { ...DEFAULT_UPDATE_SETTINGS };

    const parsed: unknown = JSON.parse(stored);
    const validated = validateSettings(parsed);
    // Merge with defaults so newly added settings remain backward compatible
    return { ...DEFAULT_UPDATE_SETTINGS, ...validated };
  } catch {
    return { ...DEFAULT_UPDATE_SETTINGS };
  }
}

export function setUpdateSettings(settings: Partial<UpdateSettings>): void {
  try {
    const current = getUpdateSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (error) {
    updateLogger.warn('Failed to save update settings:', error);
  }
}

export function shouldCheckForUpdates(options: ShouldCheckForUpdatesOptions = {}): boolean {
  const settings = options.settings ?? getUpdateSettings();
  const now = options.now ?? Date.now();
  const online = options.online ?? isOnline();
  
  // Skip checks when automatic checking is disabled
  if (!settings.autoCheck) {
    return false;
  }
  
  // Skip checks when the interval is set to 'never'
  if (settings.checkInterval === 'never') {
    return false;
  }
  
  // Skip checks when offline mode is respected and the client is offline
  if (settings.respectOfflineStatus && !online) {
    return false;
  }
  
  // Honor postponed updates
  if (settings.lastPostponedAt) {
    const timeSincePostpone = now - settings.lastPostponedAt;
    if (timeSincePostpone < settings.postponeInterval) {
      return false; // Still within the postpone window
    }
  }

  if (settings.checkInterval === 'daily' && settings.lastCheckedAt != null) {
    return now - settings.lastCheckedAt >= DAY_MS;
  }

  if (settings.checkInterval === 'weekly' && settings.lastCheckedAt != null) {
    return now - settings.lastCheckedAt >= WEEK_MS;
  }
  
  return true;
}

export function shouldShowUpdateForVersion(version: string): boolean {
  const settings = getUpdateSettings();
  return !settings.skippedVersions.includes(version);
}

export function skipVersion(version: string): void {
  const settings = getUpdateSettings();
  if (!settings.skippedVersions.includes(version)) {
    // Immutable update pattern
    setUpdateSettings({
      skippedVersions: [...settings.skippedVersions, version],
    });
  }
}

export function postponeUpdate(): void {
  setUpdateSettings({
    lastPostponedAt: Date.now()
  });
}

export function isOnline(): boolean {
  return navigator.onLine;
}
