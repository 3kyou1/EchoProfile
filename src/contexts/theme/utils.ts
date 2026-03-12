import type { Theme } from "@/contexts/theme/context";
import { storageAdapter } from "@/services/storage";

export const saveThemeToTauriStore = async (theme: Theme) => {
  const store = await storageAdapter.load("settings.json", { defaults: {}, autoSave: false });
  await store.set("theme", theme);
  await store.save();
};

export const loadThemeFromTauriStore = async () => {
  try {
    const store = await storageAdapter.load("settings.json", { defaults: {}, autoSave: false });
    return (await store.get("theme")) as Theme | null;
  } catch (error) {
    console.error("Failed to load theme:", error);
    throw error;
  }
};
