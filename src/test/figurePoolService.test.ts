import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repoMock = vi.hoisted(() => {
  interface RepoEntry {
    directoryName: string;
    poolJson: string;
    portraits: Record<string, string>;
  }

  let entries: RepoEntry[] = [];

  const cloneEntries = () =>
    entries.map((entry) => ({
      directoryName: entry.directoryName,
      poolJson: entry.poolJson,
      portraits: { ...entry.portraits },
    }));

  const normalizeName = (value: string) => value.trim().toLocaleLowerCase();

  const resolveUniqueName = (requestedName: string, previousDirectoryName?: string) => {
    const base = requestedName.trim() || "Imported pool";
    const taken = new Set(
      entries
        .filter((entry) => entry.directoryName !== previousDirectoryName)
        .map((entry) => normalizeName(entry.directoryName))
    );

    if (!taken.has(normalizeName(base))) {
      return base;
    }

    let index = 2;
    while (true) {
      const candidate = `${base} (${index})`;
      if (!taken.has(normalizeName(candidate))) {
        return candidate;
      }
      index += 1;
    }
  };

  const rewritePoolName = (poolJson: string, name: string) => {
    const parsed = JSON.parse(poolJson) as Record<string, unknown>;
    parsed.name = name;
    return JSON.stringify(parsed, null, 2);
  };

  const clearOtherDefaults = (targetDirectoryName: string) => {
    entries = entries.map((entry) => {
      if (entry.directoryName === targetDirectoryName) {
        return entry;
      }

      const parsed = JSON.parse(entry.poolJson) as Record<string, unknown>;
      if (parsed.isDefault !== true) {
        return entry;
      }
      parsed.isDefault = false;
      return {
        ...entry,
        poolJson: JSON.stringify(parsed, null, 2),
      };
    });
  };

  return {
    reset: () => {
      entries = [];
    },
    setEntries: (nextEntries: RepoEntry[]) => {
      entries = nextEntries.map((entry) => ({
        directoryName: entry.directoryName,
        poolJson: entry.poolJson,
        portraits: { ...entry.portraits },
      }));
    },
    listEntries: vi.fn(async () =>
      cloneEntries().map(({ directoryName, poolJson }) => ({ directoryName, poolJson }))
    ),
    savePool: vi.fn(async (input: {
      requestedName: string;
      poolJson: string;
      previousDirectoryName?: string;
      portraits?: Array<{ relativePath: string; dataBase64: string }>;
      removePortraitPaths?: string[];
    }) => {
      const finalName = resolveUniqueName(input.requestedName, input.previousDirectoryName);
      const poolJson = rewritePoolName(input.poolJson, finalName);
      const parsed = JSON.parse(poolJson) as Record<string, unknown>;
      const previous = input.previousDirectoryName
        ? entries.find((entry) => entry.directoryName === input.previousDirectoryName)
        : undefined;

      const nextEntry: RepoEntry = {
        directoryName: finalName,
        poolJson,
        portraits: previous ? { ...previous.portraits } : {},
      };

      for (const relativePath of input.removePortraitPaths ?? []) {
        delete nextEntry.portraits[relativePath];
      }

      for (const portrait of input.portraits ?? []) {
        nextEntry.portraits[portrait.relativePath] = portrait.dataBase64;
      }

      entries = entries.filter((entry) => entry.directoryName !== input.previousDirectoryName);
      entries = entries.filter((entry) => entry.directoryName !== finalName);
      entries.push(nextEntry);

      if (parsed.isDefault === true) {
        clearOtherDefaults(finalName);
      }

      return {
        directoryName: finalName,
        poolJson,
      };
    }),
    deletePool: vi.fn(async (directoryName: string) => {
      entries = entries.filter((entry) => entry.directoryName !== directoryName);
    }),
    readPortrait: vi.fn(async (input: { directoryName: string; relativePath: string }) => {
      const entry = entries.find((item) => item.directoryName === input.directoryName);
      const dataBase64 = entry?.portraits[input.relativePath];
      if (!dataBase64) {
        throw new Error(`Portrait not found: ${input.directoryName}/${input.relativePath}`);
      }
      return { dataBase64 };
    }),
  };
});

vi.mock("@/services/figurePoolApi", () => ({
  figurePoolApi: {
    listEntries: repoMock.listEntries,
    savePool: repoMock.savePool,
    deletePool: repoMock.deletePool,
    readPortrait: repoMock.readPortrait,
  },
}));

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

function buildRecord(overrides: Partial<FigureRecordInput> = {}): FigureRecordInput {
  return {
    slug: "grace_hopper",
    name: "Grace Hopper",
    localized_names: { zh: "格蕾丝·霍珀" },
    portrait_url: "portraits/grace_hopper.jpg",
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

function buildStoredPool(
  overrides: Partial<{
    id: string;
    name: string;
    isDefault: boolean;
    records: FigureRecordInput[];
    description: string;
  }> = {}
) {
  return JSON.stringify(
    {
      id: overrides.id ?? "pool-1",
      name: overrides.name ?? "Scientists",
      description: overrides.description ?? "Bundled pool",
      origin: "imported",
      isDefault: overrides.isDefault ?? true,
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      schemaVersion: 1,
      validationSummary: { validCount: 1, invalidCount: 0, errorCount: 0 },
      records: (overrides.records ?? [buildRecord()]).map((record) => ({
        ...record,
        status: "valid",
        errors: [],
        updatedAt: "2026-04-25T00:00:00.000Z",
      })),
    },
    null,
    2,
  );
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
    repoMock.reset();
  });

  it("loads repo-backed pool entries and makes the first one default when none is marked", async () => {
    repoMock.setEntries([
      {
        directoryName: "企业家候选池",
        poolJson: JSON.stringify({
          name: "企业家候选池",
          description: "Legacy payload",
          records: [buildRecord({ slug: "jack_ma", name: "Jack Ma" })],
        }),
        portraits: {},
      },
    ]);

    const pools = await loadFigurePools();

    expect(pools).toHaveLength(1);
    expect(pools[0]?.name).toBe("企业家候选池");
    expect(pools[0]?.isDefault).toBe(true);
    expect(pools[0]?.id).toBe("legacy-pool");
  });

  it("resolves repo-local portrait paths to displayable data URLs when loading pools", async () => {
    repoMock.setEntries([
      {
        directoryName: "Scientists",
        poolJson: buildStoredPool({ id: "pool-1", name: "Scientists", isDefault: true }),
        portraits: {
          "portraits/grace_hopper.jpg": btoa(String.fromCharCode(1, 2, 3, 4)),
        },
      },
    ]);

    const pools = await loadFigurePools();

    expect(pools[0]?.records[0]?.portrait_url).toBe(
      "data:image/jpeg;base64,AQIDBA=="
    );
  });

  it("imports a pool, auto-suffixes name collisions, and keeps invalid records excluded while valid ones remain usable", async () => {
    repoMock.setEntries([
      {
        directoryName: "Entrepreneurs",
        poolJson: buildStoredPool({ id: "pool-existing", name: "Entrepreneurs", isDefault: true }),
        portraits: {},
      },
    ]);

    const imported = await importFigurePool({
      name: "Entrepreneurs",
      description: "Imported pool",
      records: [
        buildRecord({ slug: "steve_jobs", name: "Steve Jobs" }),
        buildRecord({ slug: "broken-founder", name: "Broken Founder", portrait_url: "" }),
      ],
    });

    expect(imported.name).toBe("Entrepreneurs (2)");
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
      portrait_url: "portraits/operator.jpg",
    });

    expect(updated.slug).toBe("broken-operator");
    expect(updated.status).toBe("valid");

    const pools = await loadFigurePools();
    const pool = pools.find((item) => item.id === imported.id);
    expect(pool?.validationSummary.invalidCount).toBe(0);
    expect(pool?.validationSummary.validCount).toBe(1);
  });

  it("falls back to another available pool as default when the current default is deleted", async () => {
    repoMock.setEntries([
      {
        directoryName: "Scientists",
        poolJson: buildStoredPool({ id: "pool-1", name: "Scientists", isDefault: true }),
        portraits: {},
      },
      {
        directoryName: "Investors",
        poolJson: buildStoredPool({ id: "pool-2", name: "Investors", isDefault: false }),
        portraits: {},
      },
    ]);

    await deleteFigurePool("pool-1");

    const pools = await loadFigurePools();
    expect(pools.find((pool) => pool.id === "pool-2")?.isDefault).toBe(true);
  });

  it("exports a pool as a zip with pool.json and repo-local portraits without fetching them", async () => {
    repoMock.setEntries([
      {
        directoryName: "Operators",
        poolJson: buildStoredPool({ id: "pool-1", name: "Operators", isDefault: true }),
        portraits: {
          "portraits/grace_hopper.jpg": btoa(String.fromCharCode(1, 2, 3, 4)),
        },
      },
    ]);
    vi.stubGlobal("fetch", vi.fn());

    const zipBytes = await exportFigurePoolToZip("pool-1");
    const zip = await JSZip.loadAsync(zipBytes);
    const poolManifest = JSON.parse(
      await zip.file("pool.json")!.async("string"),
    ) as FigurePoolImportPayload;

    expect(poolManifest.name).toBe("Operators");
    expect(poolManifest.records[0]?.portrait_url).toBe("portraits/grace_hopper.jpg");
    expect(await zip.file("portraits/grace_hopper.jpg")!.async("uint8array")).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("inspects a zip and pre-resolves a suffixed pool name instead of surfacing a manual conflict", async () => {
    repoMock.setEntries([
      {
        directoryName: "Scientists",
        poolJson: buildStoredPool({ id: "pool-1", name: "Scientists", isDefault: true }),
        portraits: {},
      },
    ]);

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

    expect(inspection.payload.name).toBe("Scientists (2)");
    expect(inspection.hasNameConflict).toBe(false);
  });

  it("imports a pool zip, rewrites portraits into pool-local paths, and keeps invalid records excluded", async () => {
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
    expect(imported.records.find((record) => record.slug === "steve_jobs")?.portrait_url).toBe(
      "portraits/steve_jobs.jpg",
    );
    expect(imported.records.find((record) => record.slug === "broken-founder")?.status).toBe("invalid");
  });

  it("imports a conflicting zip with a user-provided replacement name and still auto-suffixes when needed", async () => {
    repoMock.setEntries([
      {
        directoryName: "Scientists Copy",
        poolJson: buildStoredPool({ id: "pool-1", name: "Scientists Copy", isDefault: true }),
        portraits: {},
      },
    ]);

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

    expect(imported.name).toBe("Scientists Copy (2)");
  });
});
