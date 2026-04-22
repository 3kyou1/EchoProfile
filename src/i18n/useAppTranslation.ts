/**
 * Type-safe translation hook
 *
 * Compared with useTranslation, this hook provides:
 * - translation key autocompletion
 * - type errors for invalid keys
 * - a simplified single-namespace API
 */

import { useTranslation } from 'react-i18next';
import type { TranslationKey } from './types.generated';

type InterpolationOptions = Record<string, string | number>;

/**
 * Type-safe translation hook
 *
 * @example
 * ```tsx
 * const { t } = useAppTranslation();
 * t('common.loading');  // ✅ autocompletion works
 * t('invalid.key');     // ❌ type error
 * ```
 */
export function useAppTranslation() {
  const { t: originalT, i18n } = useTranslation();

  /**
   * Type-safe translation function
   */
  const t = (key: TranslationKey, options?: InterpolationOptions): string => {
    return originalT(key, options) as string;
  };

  return { t, i18n };
}

export type { TranslationKey };
