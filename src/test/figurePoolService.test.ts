import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FigurePoolImportPayload, FigureRecordInput } from "@/types/figurePool";
import {
  deleteFigurePool,
  exportFigurePoolToZip,
  importFigurePool,
  importFigurePoolFromZip,
  inspectFigurePoolZip,
  loadFigurePools,
  updateFigureRecord,
} from "@/services/figurePoolService";

interface FakeIdbRecord {
  id: string;
  value: string;
}

function installFakeIndexedDb() {
  const stores = new Map<string, Map<string, FakeIdbRecord>>();

  const createRequest = <T,>() => {
    const request = {
      result: undefined as T | undefined,
      error: null as Error | null,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      onupgradeneeded: null as ((event: Event) => void) | null,
    };
    return request;
  };

  const database = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore: (name: string) => {
      if (!stores.has(name)) {
        stores.set(name, new Map());
      }
      return {};
    },
    transaction: (name: string) => {
      if (!stores.has(name)) {
        stores.set(name, new Map());
      }
      const store = stores.get(name)!;
      return {
        objectStore: () => ({
          get: (id: string) => {
            const request = createRequest<FakeIdbRecord | undefined>();
            queueMicrotask(() => {
              request.result = store.get(id);
              request.onsuccess?.({} as Event);
            });
            return request;
          },
          put: (value: FakeIdbRecord) => {
            const request = createRequest<FakeIdbRecord>();
            queueMicrotask(() => {
              store.set(value.id, value);
              request.result = value;
              request.onsuccess?.({} as Event);
            });
            return request;
          },
        }),
      };
    },
  };

  const indexedDb = {
    open: (..._args: [string, (number | undefined)?]) => {
      void _args;
      const request = createRequest<typeof database>();
      queueMicrotask(() => {
        request.result = database;
        request.onupgradeneeded?.({} as Event);
        request.onsuccess?.({} as Event);
      });
      return request;
    },
  };

  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    writable: true,
    value: indexedDb,
  });

  if (typeof window !== "undefined") {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      writable: true,
      value: indexedDb,
    });
  }
}

function buildRecord(overrides: Partial<FigureRecordInput> = {}): FigureRecordInput {
  return {
    slug: "grace_hopper",
    name: "Grace Hopper",
    localized_names: { zh: "格蕾丝·霍珀" },
    portrait_url: "/scientist-portraits/grace_hopper.jpg",
    quote_en: "The most dangerous phrase is 'We've always done it this way.'",
    quote_zh: "最危险的一句话是：我们一直都是这么做的。",
    core_traits: "系统化、工程直觉、语言设计",
    thinking_style: "把复杂系统拆成可操作的抽象层。",
    temperament_tags: "务实、清晰、工程化",
    temperament_summary: "偏向系统工程与抽象落地。",
    loading_copy_zh: "正在对齐她的系统化思维...",
    loading_copy_en: "Aligning her systems thinking...",
    bio_zh: "美国计算机科学家，推动编译器与编程语言普及。",
    bio_en: "American computer scientist who helped popularize compilers and programming languages.",
    achievements_zh: ["推动 COBOL", "编译器先驱", "海军少将"],
    achievements_en: ["Advanced COBOL", "Compiler pioneer", "Rear admiral"],
    ...overrides,
  };
}

async function buildPoolZip(
  payload: FigurePoolImportPayload,
  portraits: Record<string, Uint8Array> = {},
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("pool.json", JSON.stringify(payload, null, 2));
  for (const [path, bytes] of Object.entries(portraits)) {
    zip.file(path, bytes);
  }
  return zip.generateAsync({ type: "uint8array" });
}

describe("figurePoolService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    }
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      clear: () => {
        memory.clear();
      },
    });
  });

  it("seeds a builtin default pool from the bundled scientist data", async () => {
    const pools = await loadFigurePools();

    expect(pools).toHaveLength(1);
    expect(pools[0]?.origin).toBe("builtin");
    expect(pools[0]?.isDefault).toBe(true);
    expect(pools[0]?.records.length).toBeGreaterThan(10);
    expect(pools[0]?.validationSummary.invalidCount).toBe(0);
  });

  it("imports a pool and keeps invalid records excluded while valid ones remain usable", async () => {
    const payload: FigurePoolImportPayload = {
      name: "Entrepreneurs",
      description: "Imported pool",
      records: [
        buildRecord({
          slug: "steve_jobs",
          name: "Steve Jobs",
        }),
        buildRecord({
          slug: "broken-founder",
          name: "Broken Founder",
          portrait_url: "",
        }),
      ],
    };

    const imported = await importFigurePool(payload);

    expect(imported.name).toBe("Entrepreneurs");
    expect(imported.validationSummary.validCount).toBe(1);
    expect(imported.validationSummary.invalidCount).toBe(1);
    expect(imported.records.find((record) => record.slug === "steve_jobs")?.status).toBe("valid");
    expect(imported.records.find((record) => record.slug === "broken-founder")?.status).toBe("invalid");
  });

  it("revalidates a record when it is updated", async () => {
    const imported = await importFigurePool({
      name: "Operators",
      records: [
        buildRecord({
          slug: "broken-operator",
          portrait_url: "",
        }),
      ],
    });

    const updated = await updateFigureRecord(imported.id, "broken-operator", {
      portrait_url: "/portraits/operator.jpg",
    });

    expect(updated.slug).toBe("broken-operator");
    expect(updated.status).toBe("valid");

    const pools = await loadFigurePools();
    const pool = pools.find((item) => item.id === imported.id);
    expect(pool?.validationSummary.invalidCount).toBe(0);
    expect(pool?.validationSummary.validCount).toBe(1);
  });

  it("falls back to another available pool as default when the current default is deleted", async () => {
    const imported = await importFigurePool({
      name: "Investors",
      records: [buildRecord({ slug: "charlie_munger", name: "Charlie Munger" })],
    });

    await deleteFigurePool("builtin-scientists");

    const pools = await loadFigurePools();
    expect(pools.find((pool) => pool.id === imported.id)?.isDefault).toBe(true);
  });

  it("exports a pool as a zip with pool.json and bundled portraits", async () => {
    const portraitBytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "Content-Type": "image/jpeg" }),
        arrayBuffer: async () => portraitBytes.buffer.slice(0),
      }),
    );

    const imported = await importFigurePool({
      name: "Operators",
      records: [
        buildRecord({
          portrait_url: "/figure-portraits/grace_hopper.jpg",
        }),
      ],
    });

    const zipBytes = await exportFigurePoolToZip(imported.id);
    const zip = await JSZip.loadAsync(zipBytes);
    const poolManifest = JSON.parse(
      await zip.file("pool.json")!.async("string"),
    ) as FigurePoolImportPayload;

    expect(poolManifest.name).toBe("Operators");
    expect(poolManifest.records[0]?.portrait_url).toBe("portraits/grace_hopper.jpg");
    expect(await zip.file("portraits/grace_hopper.jpg")!.async("uint8array")).toEqual(portraitBytes);
    expect(fetch).toHaveBeenCalledWith("/figure-portraits/grace_hopper.jpg");
  });

  it("inspects a zip and reports pool-name conflicts before import", async () => {
    const zipBytes = await buildPoolZip(
      {
        name: "Scientists",
        records: [
          buildRecord({
            portrait_url: "portraits/grace_hopper.jpg",
          }),
        ],
      },
      {
        "portraits/grace_hopper.jpg": new Uint8Array([9, 8, 7]),
      },
    );

    const inspection = await inspectFigurePoolZip(zipBytes);

    expect(inspection.payload.name).toBe("Scientists");
    expect(inspection.hasNameConflict).toBe(true);
    expect(inspection.conflictingPoolId).toBe("builtin-scientists");
  });

  it("imports a pool zip, rewrites portraits, and keeps invalid records excluded", async () => {
    const zipBytes = await buildPoolZip(
      {
        name: "Entrepreneurs",
        records: [
          buildRecord({
            slug: "steve_jobs",
            name: "Steve Jobs",
            portrait_url: "portraits/steve_jobs.jpg",
          }),
          buildRecord({
            slug: "broken-founder",
            name: "Broken Founder",
            portrait_url: "",
          }),
        ],
      },
      {
        "portraits/steve_jobs.jpg": new Uint8Array([6, 5, 4, 3]),
      },
    );

    const imported = await importFigurePoolFromZip(zipBytes);

    expect(imported.name).toBe("Entrepreneurs");
    expect(imported.validationSummary.validCount).toBe(1);
    expect(imported.validationSummary.invalidCount).toBe(1);
    expect(imported.records.find((record) => record.slug === "steve_jobs")?.portrait_url).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(imported.records.find((record) => record.slug === "broken-founder")?.status).toBe("invalid");
  });

  it("imports a conflicting zip with a user-provided replacement name", async () => {
    const zipBytes = await buildPoolZip(
      {
        name: "Scientists",
        records: [
          buildRecord({
            portrait_url: "portraits/grace_hopper.jpg",
          }),
        ],
      },
      {
        "portraits/grace_hopper.jpg": new Uint8Array([1, 1, 2, 3]),
      },
    );

    const imported = await importFigurePoolFromZip(zipBytes, {
      name: "Scientists Copy",
    });

    expect(imported.name).toBe("Scientists Copy");
  });

  it("persists imported zip pools even when web localStorage is full", async () => {
    installFakeIndexedDb();

    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError");
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    const zipBytes = await buildPoolZip(
      {
        name: "Imported Operators",
        records: [
          buildRecord({
            portrait_url: "portraits/grace_hopper.jpg",
          }),
        ],
      },
      {
        "portraits/grace_hopper.jpg": new Uint8Array([4, 3, 2, 1]),
      },
    );

    const imported = await importFigurePoolFromZip(zipBytes);
    const pools = await loadFigurePools();

    expect(imported.name).toBe("Imported Operators");
    expect(pools.some((pool) => pool.id === imported.id)).toBe(true);
  });
});
