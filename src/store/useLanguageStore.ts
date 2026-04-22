import { create } from "zustand";
import { toast } from "sonner";
import { storageAdapter } from "@/services/storage";
import { isTauri } from "@/utils/platform";
import i18n from "../i18n";
import type { SupportedLanguage } from "../i18n";
import { normalizeLanguage } from "../i18n";

interface LanguageStore {
  language: SupportedLanguage;
  isLoading: boolean;
  setLanguage: (language: SupportedLanguage) => Promise<void>;
  loadLanguage: () => Promise<void>;
}

const getCurrentLanguage = (): SupportedLanguage => {
  const storedLang = localStorage.getItem("i18nextLng");
  if (storedLang) {
    return normalizeLanguage(storedLang);
  }
  return normalizeLanguage(i18n.language || "en");
};

export const useLanguageStore = create<LanguageStore>((set, get) => ({
  language: getCurrentLanguage(),
  isLoading: true,

  setLanguage: async (language) => {
    await i18n.changeLanguage(language);
    set({ language });

    try {
      const store = await storageAdapter.load("settings.json", { defaults: {}, autoSave: true });
      await store.set("language", language);
      await store.save();
    } catch {
      toast.error(i18n.t("common.settings.language.saveFailed"));
    }
  },

  loadLanguage: async () => {
    set({ isLoading: true });
    try {
      let language: SupportedLanguage | null = null;

      const i18nextLang = localStorage.getItem("i18nextLng");
      if (i18nextLang) {
        language = normalizeLanguage(i18nextLang);
      }

      if (!language) {
        try {
          const store = await storageAdapter.load("settings.json", { defaults: {}, autoSave: true });
          const storedLanguage = (await store.get("language")) as string | null;
          language = storedLanguage ? normalizeLanguage(storedLanguage) : null;
        } catch (e) {
          console.log("Store not available:", e);
        }
      }

      if (language) {
        await i18n.changeLanguage(language);
        set({ language });
      } else {
        let detectedLanguage: SupportedLanguage = "en";
        try {
          if (isTauri()) {
            const { locale } = await import("@tauri-apps/plugin-os");
            const systemLocale = (await locale()) || navigator.language || "en";
            detectedLanguage = normalizeLanguage(systemLocale);
          } else {
            detectedLanguage = normalizeLanguage(navigator.language || "en");
          }
        } catch (error) {
          console.log("Failed to get system locale:", error);
          detectedLanguage = normalizeLanguage(navigator.language || "en");
        }
        await get().setLanguage(detectedLanguage);
      }
    } catch (error) {
      console.error("Failed to load language:", error);
      set({ language: "en" }); // Fallback to English
    } finally {
      set({ isLoading: false });
    }
  },
}));
