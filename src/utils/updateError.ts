export const UPDATE_DOWNLOAD_COMPLETE_RESTART_CODE =
  'update.download_complete_restart';

export function resolveUpdateErrorMessage(
  error: string,
  t: (key: string) => string
): string {
  if (error === UPDATE_DOWNLOAD_COMPLETE_RESTART_CODE) {
    return t('common.error.updateDownloadCompleteRestart');
  }

  return error;
}
