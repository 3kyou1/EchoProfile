export interface UpdateSettings {
  autoCheck: boolean;
  
  checkInterval: 'startup' | 'daily' | 'weekly' | 'never';
  
  skippedVersions: string[];
  
  lastPostponedAt?: number;

  lastCheckedAt?: number;
  
  postponeInterval: number;
  
  hasSeenIntroduction: boolean;
  
  respectOfflineStatus: boolean;
  
  allowCriticalUpdates: boolean;
}

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  autoCheck: true,
  checkInterval: 'startup',
  skippedVersions: [],
  postponeInterval: 24 * 60 * 60 * 1000,
  hasSeenIntroduction: false,
  respectOfflineStatus: true,
  allowCriticalUpdates: true,
};
