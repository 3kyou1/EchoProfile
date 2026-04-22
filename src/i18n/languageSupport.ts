export const supportedLanguages = {
  en: "English",
  "zh-CN": "简体中文",
} as const;

export type SupportedLanguage = keyof typeof supportedLanguages;

export const languageLocaleMap: Record<string, string> = {
  en: "en-US",
  "zh-CN": "zh-CN",
  "zh-HK": "zh-CN",
  "zh-MO": "zh-CN",
  "zh-TW": "zh-CN",
};

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return value in supportedLanguages;
}

export function normalizeLanguage(language?: string | null): SupportedLanguage {
  if (!language) {
    return "en";
  }

  if (language.startsWith("zh")) {
    return "zh-CN";
  }

  return language.startsWith("en") ? "en" : "en";
}
