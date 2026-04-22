import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import namespace JSON files in a focused structure
// Each namespace stays small enough for focused edits

// English
import enCommon from './locales/en/common.json';
import enAnalytics from './locales/en/analytics.json';
import enSession from './locales/en/session.json';
import enSettings from './locales/en/settings.json';
import enTools from './locales/en/tools.json';
import enError from './locales/en/error.json';
import enMessage from './locales/en/message.json';
import enRenderers from './locales/en/renderers.json';
import enUpdate from './locales/en/update.json';
import enFeedback from './locales/en/feedback.json';
import enRecentEdits from './locales/en/recentEdits.json';
import enArchive from './locales/en/archive.json';

// Simplified Chinese
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNAnalytics from './locales/zh-CN/analytics.json';
import zhCNSession from './locales/zh-CN/session.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNTools from './locales/zh-CN/tools.json';
import zhCNError from './locales/zh-CN/error.json';
import zhCNMessage from './locales/zh-CN/message.json';
import zhCNRenderers from './locales/zh-CN/renderers.json';
import zhCNUpdate from './locales/zh-CN/update.json';
import zhCNFeedback from './locales/zh-CN/feedback.json';
import zhCNRecentEdits from './locales/zh-CN/recentEdits.json';
import zhCNArchive from './locales/zh-CN/archive.json';
export {
  isSupportedLanguage,
  languageLocaleMap,
  normalizeLanguage,
  supportedLanguages,
} from "./languageSupport";
export type { SupportedLanguage } from "./languageSupport";

/**
 * Namespace list
 *
 * Each translation domain stays separate so focused updates can target one file.
 */
export const namespaces = [
  'common',
  'analytics',
  'session',
  'settings',
  'tools',
  'error',
  'message',
  'renderers',
  'update',
  'feedback',
  'recentEdits',
  'archive',
] as const;

export type Namespace = (typeof namespaces)[number];

/**
 * Merge namespace resources into the legacy single `translation` namespace.
 */
type TranslationValue = string | string[];
function mergeNamespaces(
  ...nsObjects: Record<string, TranslationValue>[]
): Record<string, TranslationValue> {
  return Object.assign({}, ...nsObjects);
}

const resources = {
  en: {
    translation: mergeNamespaces(
      enCommon,
      enAnalytics,
      enSession,
      enSettings,
      enTools,
      enError,
      enMessage,
      enRenderers,
      enUpdate,
      enFeedback,
      enRecentEdits,
      enArchive
    ),
  },
  "zh-CN": {
    translation: mergeNamespaces(
      zhCNCommon,
      zhCNAnalytics,
      zhCNSession,
      zhCNSettings,
      zhCNTools,
      zhCNError,
      zhCNMessage,
      zhCNRenderers,
      zhCNUpdate,
      zhCNFeedback,
      zhCNRecentEdits,
      zhCNArchive
    ),
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'translation',
    ns: ['translation'],

    interpolation: {
      escapeValue: false,
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;

export { useAppTranslation } from './useAppTranslation';
export type { TranslationKey, TranslationPrefix } from './types.generated';
