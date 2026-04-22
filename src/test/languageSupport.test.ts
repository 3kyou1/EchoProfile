import { describe, expect, it } from "vitest";
import { LANGUAGES } from "../../scripts/i18n-config.mjs";
import {
  languageLocaleMap,
  normalizeLanguage,
  supportedLanguages,
} from "@/i18n/languageSupport";

describe("language support", () => {
  it("only exposes English and Simplified Chinese", () => {
    expect(supportedLanguages).toEqual({
      en: "English",
      "zh-CN": "简体中文",
    });
    expect(LANGUAGES).toEqual(["en", "zh-CN"]);
    expect(languageLocaleMap).toEqual({
      en: "en-US",
      "zh-CN": "zh-CN",
      "zh-HK": "zh-CN",
      "zh-MO": "zh-CN",
      "zh-TW": "zh-CN",
    });
  });

  it("normalizes all Chinese variants to Simplified Chinese", () => {
    expect(normalizeLanguage("zh")).toBe("zh-CN");
    expect(normalizeLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizeLanguage("zh-TW")).toBe("zh-CN");
    expect(normalizeLanguage("zh-HK")).toBe("zh-CN");
    expect(normalizeLanguage("zh-MO")).toBe("zh-CN");
  });

  it("falls back unsupported languages to English", () => {
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("ja-JP")).toBe("en");
    expect(normalizeLanguage("ko-KR")).toBe("en");
    expect(normalizeLanguage("fr-FR")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
  });
});
