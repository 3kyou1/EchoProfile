/**
 * Storage adapter — Tauri plugin-store in desktop mode, localStorage in web mode.
 *
 * Provides a unified interface so callers don't need to care about the runtime.
 *
 * Usage:
 *   import { storageAdapter } from "@/services/storage";
 *   const store = await storageAdapter.load("settings.json");
 *   await store.set("key", value);
 *   const val = await store.get("key");
 */

import { isTauri } from "@/utils/platform";

export interface StoreHandle {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

const WEB_DB_NAME = "echo-profile-webui";
const WEB_DB_VERSION = 1;
const WEB_DB_STORE = "kv";

interface WebDbEntry {
  id: string;
  value: string;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openWebDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WEB_DB_STORE)) {
        database.createObjectStore(WEB_DB_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open browser storage"));
  });
}

async function readFromIndexedDb(scopedKey: string): Promise<string | null> {
  const database = await openWebDb();

  return new Promise((resolve, reject) => {
    const request = database
      .transaction(WEB_DB_STORE, "readonly")
      .objectStore(WEB_DB_STORE)
      .get(scopedKey);

    request.onsuccess = () => {
      const entry = request.result as WebDbEntry | undefined;
      resolve(entry?.value ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error(`Failed to read ${scopedKey}`));
  });
}

async function writeToIndexedDb(scopedKey: string, value: string): Promise<void> {
  const database = await openWebDb();

  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(WEB_DB_STORE, "readwrite")
      .objectStore(WEB_DB_STORE)
      .put({ id: scopedKey, value } satisfies WebDbEntry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to write ${scopedKey}`));
  });
}

function readFromLocalStorage<T>(
  scopedKey: string,
  defaults: Record<string, unknown> | undefined,
  key: string,
): T | null {
  try {
    const raw = localStorage.getItem(scopedKey);
    if (raw != null) {
      return JSON.parse(raw) as T;
    }
  } catch {
    return null;
  }

  if (defaults && key in defaults) {
    return defaults[key] as T;
  }

  return null;
}

/**
 * Load (or create) a named store.
 *
 * In Tauri mode this delegates to `@tauri-apps/plugin-store`.
 * In web mode it uses `localStorage` with a namespace prefix.
 */
async function loadStore(
  name: string,
  _options?: { defaults?: Record<string, unknown>; autoSave?: boolean },
): Promise<StoreHandle> {
  if (isTauri()) {
    const { load } = await import("@tauri-apps/plugin-store");
    const storeOpts = _options
      ? { defaults: _options.defaults ?? {}, autoSave: _options.autoSave }
      : undefined;
    const tauriStore = await load(name, storeOpts);
    return {
      get: <T = unknown>(key: string) => tauriStore.get(key) as Promise<T | null>,
      set: (key: string, value: unknown) => tauriStore.set(key, value),
      save: () => tauriStore.save(),
    };
  }

  const prefix = `webui:${name}:`;
  const defaults = _options?.defaults;

  if (hasIndexedDb()) {
    return {
      get: async <T = unknown>(key: string) => {
        const scopedKey = `${prefix}${key}`;

        try {
          const raw = await readFromIndexedDb(scopedKey);
          if (raw != null) {
            return JSON.parse(raw) as T;
          }
        } catch {
          // Fall through to legacy localStorage data.
        }

        const fallback = readFromLocalStorage<T>(scopedKey, defaults, key);
        if (fallback != null) {
          void writeToIndexedDb(scopedKey, JSON.stringify(fallback)).catch(() => {
            // Migration is best-effort. Keep returning the recovered value.
          });
          return fallback;
        }

        return null;
      },
      set: async (key: string, value: unknown) => {
        const scopedKey = `${prefix}${key}`;
        await writeToIndexedDb(scopedKey, JSON.stringify(value));
        try {
          localStorage.removeItem(scopedKey);
        } catch {
          // Legacy cleanup is best-effort only.
        }
      },
      save: () => Promise.resolve(),
    };
  }

  // Web fallback — localStorage with namespace when IndexedDB is unavailable.
  return {
    get: <T = unknown>(key: string) =>
      Promise.resolve(readFromLocalStorage<T>(`${prefix}${key}`, defaults, key)),
    set: (key: string, value: unknown) => {
      localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
      return Promise.resolve();
    },
    save: () => Promise.resolve(), // no-op in web mode
  };
}

export const storageAdapter = { load: loadStore };
