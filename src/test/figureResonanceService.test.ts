import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPersistLlmDebugLog } = vi.hoisted(() => ({
  mockPersistLlmDebugLog: vi.fn().mockResolvedValue(undefined),
}));

const repoMock = vi.hoisted(() => {
  interface RepoEntry {
    directoryName: string;
    poolJson: string;
  }

  let entries: RepoEntry[] = [];

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
      return { ...entry, poolJson: JSON.stringify(parsed, null, 2) };
    });
  };

  return {
    reset: () => {
      entries = [];
    },
    setEntries: (nextEntries: RepoEntry[]) => {
      entries = nextEntries.map((entry) => ({ ...entry }));
    },
    listEntries: vi.fn(async () => entries.map((entry) => ({ ...entry }))),
    savePool: vi.fn(async (input: {
      requestedName: string;
      poolJson: string;
      previousDirectoryName?: string;
    }) => {
      const finalName = resolveUniqueName(input.requestedName, input.previousDirectoryName);
      const parsed = JSON.parse(input.poolJson) as Record<string, unknown>;
      parsed.name = finalName;
      const poolJson = JSON.stringify(parsed, null, 2);

      entries = entries.filter((entry) => entry.directoryName !== input.previousDirectoryName);
      entries = entries.filter((entry) => entry.directoryName !== finalName);
      entries.push({ directoryName: finalName, poolJson });

      if (parsed.isDefault === true) {
        clearOtherDefaults(finalName);
      }

      return { directoryName: finalName, poolJson };
    }),
    deletePool: vi.fn(async (directoryName: string) => {
      entries = entries.filter((entry) => entry.directoryName !== directoryName);
    }),
    readPortrait: vi.fn(async () => {
      throw new Error("Portrait reads are not used in figureResonanceService tests");
    }),
  };
});

vi.mock("@/services/llmDebugLogger", () => ({
  persistLlmDebugLog: mockPersistLlmDebugLog,
}));

vi.mock("@/services/figurePoolApi", () => ({
  figurePoolApi: {
    listEntries: repoMock.listEntries,
    savePool: repoMock.savePool,
    deletePool: repoMock.deletePool,
    readPortrait: repoMock.readPortrait,
  },
}));

import type { CopaSnapshot } from "@/types/copaProfile";
import {
  buildFigureResonanceCacheKey,
  deleteFigureResonanceResultsForProfile,
  generateFigureResonance,
  loadFigureResonanceResult,
} from "@/services/figureResonanceService";
import { deleteFigurePool, importFigurePool, loadFigurePools } from "@/services/figurePoolService";

const snapshot: CopaSnapshot = {
  id: "profile-1",
  createdAt: "2026-04-22T12:00:00.000Z",
  scope: {
    type: "global",
    ref: "global",
    label: "Global history",
    key: "global:all",
  },
  providerScope: ["claude"],
  sourceStats: {
    projectCount: 1,
    sessionCount: 1,
    rawUserMessages: 6,
    dedupedUserMessages: 6,
    truncatedMessages: 0,
  },
  modelConfig: {
    baseUrl: "http://example.com/v1",
    model: "test-model",
    temperature: 0.2,
  },
  promptSummary: "Prefer structured reasoning.",
  factors: {
    CT: {
      code: "CT",
      title: "Cognitive Trust",
      description: "Trust",
      user_profile_description: "Wants evidence and rigor.",
    },
    SA: {
      code: "SA",
      title: "Situational Anchoring",
      description: "Context",
      user_profile_description: "Keeps answers tightly scoped.",
    },
    SC: {
      code: "SC",
      title: "Schema Consistency",
      description: "Schema",
      user_profile_description: "Likes formal abstractions.",
    },
    CLM: {
      code: "CLM",
      title: "Cognitive Load Management",
      description: "Load",
      user_profile_description: "Prefers chunked explanations.",
    },
    MS: {
      code: "MS",
      title: "Metacognitive Scaffolding",
      description: "Scaffold",
      user_profile_description: "Wants reasoning structure.",
    },
    AMR: {
      code: "AMR",
      title: "Affective and Motivational Resonance",
      description: "Tone",
      user_profile_description: "Prefers calm, focused support.",
    },
  },
  markdown: "## CoPA Profile\n\n- User profile: Likes formal abstractions, structure compression, calm rigor.",
};

function buildStoredPoolJson(overrides: Partial<{ id: string; name: string; isDefault: boolean }> = {}) {
  return JSON.stringify(
    {
      id: overrides.id ?? "pool-default",
      name: overrides.name ?? "Scientists",
      description: "Default repo-backed pool",
      origin: "imported",
      isDefault: overrides.isDefault ?? true,
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      schemaVersion: 1,
      validationSummary: { validCount: 2, invalidCount: 0, errorCount: 0 },
      records: [
        {
          slug: "herbert_simon",
          name: "Herbert A. Simon",
          localized_names: { zh: "赫伯特·西蒙" },
          portrait_url: "portraits/herbert_simon.png",
          quote_en: "A wealth of information creates a poverty of attention.",
          quote_zh: "信息的丰富，造成了注意力的贫乏。",
          core_traits: "bounded rationality, systems",
          thinking_style: "Builds decision models and bounded-rational frameworks.",
          temperament_tags: "structured, analytical",
          temperament_summary: "Systematic and decision-oriented.",
          loading_copy_zh: "正在对齐他的决策模型...",
          loading_copy_en: "Aligning his decision models...",
          bio_zh: "决策科学家。", bio_en: "Decision scientist.",
          achievements_zh: ["有限理性"], achievements_en: ["Bounded rationality"],
          status: "valid", errors: [], updatedAt: "2026-04-25T00:00:00.000Z",
        },
        {
          slug: "grace_hopper",
          name: "Grace Hopper",
          localized_names: { zh: "格蕾丝·霍珀" },
          portrait_url: "portraits/grace_hopper.png",
          quote_en: "We've always done it this way is dangerous.",
          quote_zh: "我们一直这么做很危险。",
          core_traits: "systems, engineering",
          thinking_style: "Turns abstractions into operational layers.",
          temperament_tags: "clear, practical",
          temperament_summary: "Systematic and applied.",
          loading_copy_zh: "正在对齐她的工程化思维...",
          loading_copy_en: "Aligning her engineering mind...",
          bio_zh: "编译器先驱。", bio_en: "Compiler pioneer.",
          achievements_zh: ["COBOL"], achievements_en: ["COBOL"],
          status: "valid", errors: [], updatedAt: "2026-04-25T00:00:00.000Z",
        },
      ],
    },
    null,
    2,
  );
}

describe("figureResonanceService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    repoMock.reset();
    repoMock.setEntries([
      {
        directoryName: "Scientists",
        poolJson: buildStoredPoolJson(),
      },
    ]);
    const memory = new Map<string, string>();
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const href = String(input);
        if (href.startsWith("http://example.com")) {
          return {
            ok: false,
            status: 500,
            statusText: "Test fetch not configured",
            text: async () => "Test fetch not configured",
          };
        }

        return {
          ok: true,
          headers: new Headers({ "Content-Type": "image/png" }),
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer.slice(0),
        };
      })
    );
  });

  it("normalizes cache key by language", () => {
    expect(
      buildFigureResonanceCacheKey({
        scopeKey: "global:all",
        profileId: "profile-1",
        language: "zh-CN",
        poolId: "builtin-scientists",
      })
    ).toBe("global:all:profile-1:zh:builtin-scientists");
  });

  it("falls back to heuristic generation when llm request fails and excludes invalid pool records", async () => {
    const imported = await importFigurePool({
      name: "Operators",
      records: [
        {
          slug: "valid_operator",
          name: "Valid Operator",
          localized_names: { zh: "有效操盘手" },
          portrait_url: "/valid.png",
          quote_en: "A short quote.",
          quote_zh: "一句简短的话。",
          core_traits: "结构化、系统化",
          thinking_style: "把复杂问题转成清晰结构。",
          temperament_tags: "冷静、抽象",
          temperament_summary: "偏系统思考。",
          loading_copy_zh: "正在对齐...",
          loading_copy_en: "Aligning...",
          bio_zh: "有效人物。",
          bio_en: "Valid figure.",
          achievements_zh: ["成就一"],
          achievements_en: ["Achievement one"],
        },
        {
          slug: "broken_operator",
          name: "Broken Operator",
          localized_names: { zh: "失效操盘手" },
          portrait_url: "",
          quote_en: "Broken",
          quote_zh: "坏的",
          core_traits: "系统化",
          thinking_style: "坏数据不应参与匹配。",
          temperament_tags: "抽象",
          temperament_summary: "无效数据。",
          loading_copy_zh: "坏的",
          loading_copy_en: "Broken",
          bio_zh: "坏的",
          bio_en: "Broken",
          achievements_zh: ["成就"],
          achievements_en: ["Achievement"],
        },
      ],
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await generateFigureResonance({
      scopeKey: "global:all",
      poolId: imported.id,
      profileSnapshot: snapshot,
      recentMessages: [
        "我喜欢把复杂系统压缩成结构化框架。",
        "我希望看到严谨推导，而不是泛泛而谈。",
        "请用清晰的步骤讲解。",
        "我更在意抽象结构和公理化表达。",
      ],
      config: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      language: "zh-CN",
    });

    expect(result.source).toBe("heuristic");
    expect(result.long_term.primary.slug).toBe("valid_operator");
    expect(result.long_term.secondary.length).toBeLessThanOrEqual(2);
    expect(result.recent_state).not.toBeNull();
    expect(result.pool_id).toBe(imported.id);
    expect(result.pool_name_snapshot).toBe("Operators");
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "resonance",
        stage: "network_error",
        level: "warn",
        payload: expect.objectContaining({
          error: "network down",
        }),
      })
    );
  });

  it("persists generated resonance result in cache", async () => {
    const pools = await loadFigurePools();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const generated = await generateFigureResonance({
      scopeKey: "global:all",
      poolId: pools[0]!.id,
      profileSnapshot: snapshot,
      recentMessages: [
        "我喜欢把复杂系统压缩成结构化框架。",
        "我希望看到严谨推导，而不是泛泛而谈。",
        "请用清晰的步骤讲解。",
        "我更在意抽象结构和公理化表达。",
      ],
      config: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      language: "zh-CN",
    });

    const loaded = await loadFigureResonanceResult({
      scopeKey: "global:all",
      profileId: snapshot.id,
      language: "zh-CN",
      poolId: pools[0]!.id,
    });

    expect(loaded?.id).toBe(generated.id);
    expect(loaded?.cache_key).toBe(generated.cache_key);
    expect(loaded?.pool_id).toBe(pools[0]!.id);
  });

  it("logs thought echoes prompt and raw response when llm generation succeeds", async () => {
    const pools = await loadFigurePools();
    const validRecords = pools[0]!.records.filter((record) => record.status === "valid");
    const primary = validRecords[0]!;
    const secondary = validRecords.slice(1, 3);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  long_term: {
                    primary: {
                      slug: primary.slug,
                      reason: "Matches the user's structured reasoning style.",
                      resonance_axes: ["structured", "rigorous"],
                    },
                    secondary: secondary.map((record) => ({
                      slug: record.slug,
                      reason: `Echoes ${record.name}.`,
                      resonance_axes: ["adjacent"],
                    })),
                  },
                  recent_state: null,
                }),
              },
            },
          ],
        }),
      })
    );

    await generateFigureResonance({
      scopeKey: "global:all",
      poolId: pools[0]!.id,
      profileSnapshot: snapshot,
      recentMessages: [
        "I want a rigorous structure.",
        "Please show the reasoning steps clearly.",
      ],
      config: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      language: "en",
    });

    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "resonance",
        stage: "request",
        payload: expect.objectContaining({
          model: "test-model",
          language: "en",
          systemPrompt: expect.stringContaining("Generate Thought Echoes"),
        }),
      })
    );
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "resonance",
        stage: "response",
        payload: expect.objectContaining({
          rawContent: expect.stringContaining(primary.slug),
        }),
      })
    );
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "resonance",
        stage: "diagnosis",
        payload: expect.objectContaining({
          hasLongTermPrimary: true,
          secondaryCount: 1,
          allowRecentState: false,
          hasRecentStatePayload: false,
        }),
      })
    );
  });

  it("sends a json_schema response format for thought echoes generation", async () => {
    const pools = await loadFigurePools();
    const validRecords = pools[0]!.records.filter((record) => record.status === "valid");
    const primary = validRecords[0]!;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                long_term: {
                  primary: {
                    slug: primary.slug,
                    reason: "Matches the user's structured reasoning style.",
                    resonance_axes: ["structured", "rigorous"],
                  },
                  secondary: [],
                },
                recent_state: null,
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateFigureResonance({
      scopeKey: "global:all",
      poolId: pools[0]!.id,
      profileSnapshot: snapshot,
      recentMessages: [
        "I want a rigorous structure.",
        "Please show the reasoning steps clearly.",
      ],
      config: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      language: "en",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body ?? "{}")) as {
      response_format?: { type?: string; json_schema?: { name?: string; schema?: Record<string, unknown> } };
    };

    expect(body.response_format?.type).toBe("json_schema");
    expect(body.response_format?.json_schema?.name).toBe("figure_resonance");
    expect(body.response_format?.json_schema?.schema).toEqual(
      expect.objectContaining({
        type: "object",
        required: expect.arrayContaining(["long_term", "recent_state"]),
      })
    );
  });

  it("falls back to json_object when json_schema is unsupported for thought echoes generation", async () => {
    const pools = await loadFigurePools();
    const validRecords = pools[0]!.records.filter((record) => record.status === "valid");
    const primary = validRecords[0]!;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "response_format json_schema is not supported for this model",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  long_term: {
                    primary: {
                      slug: primary.slug,
                      reason: "Matches the user's structured reasoning style.",
                      resonance_axes: ["structured", "rigorous"],
                    },
                    secondary: [],
                  },
                  recent_state: null,
                }),
              },
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateFigureResonance({
      scopeKey: "global:all",
      poolId: pools[0]!.id,
      profileSnapshot: snapshot,
      recentMessages: [
        "I want a rigorous structure.",
        "Please show the reasoning steps clearly.",
      ],
      config: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      language: "en",
    });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      response_format?: { type?: string };
    };
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}")) as {
      response_format?: { type?: string };
    };

    expect(firstBody.response_format?.type).toBe("json_schema");
    expect(secondBody.response_format?.type).toBe("json_object");
    expect(result.source).toBe("llm");
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "resonance",
        stage: "schema_fallback",
        payload: expect.objectContaining({
          from: "json_schema",
          to: "json_object",
          status: 400,
        }),
      })
    );
  });

  it("logs thought echoes http errors before falling back", async () => {
    const pools = await loadFigurePools();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => "bad gateway",
      })
    );

    const result = await generateFigureResonance({
      scopeKey: "global:all",
      poolId: pools[0]!.id,
      profileSnapshot: snapshot,
      recentMessages: [
        "I want a rigorous structure.",
        "Please show the reasoning steps clearly.",
      ],
      config: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      language: "en",
    });

    expect(result.source).toBe("heuristic");
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "resonance",
        stage: "fetch_resolved",
        payload: expect.objectContaining({
          ok: false,
          status: 502,
          statusText: "Bad Gateway",
        }),
      })
    );
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "resonance",
        stage: "http_error",
        level: "warn",
        payload: expect.objectContaining({
          status: 502,
          detail: "bad gateway",
        }),
      })
    );
  });

  it("rehydrates cached resonance cards from the latest figure pool data", async () => {
    const pools = await loadFigurePools();
    const cacheKey = buildFigureResonanceCacheKey({
      scopeKey: "global:all",
      profileId: snapshot.id,
      language: "zh-CN",
      poolId: pools[0]!.id,
    });

    localStorage.setItem(
      "webui:scientist-resonance.json:results",
      JSON.stringify([
        {
          id: "cached-1",
          cache_key: cacheKey,
          scope_key: "global:all",
          profile_id: snapshot.id,
          generated_at: "2026-04-22T12:00:00.000Z",
          language: "zh",
          pool_id: pools[0]!.id,
          pool_name_snapshot: pools[0]!.name,
          pool_updated_at_snapshot: pools[0]!.updatedAt,
          source: "heuristic",
          long_term: {
            primary: {
              name: "Herbert A. Simon",
              slug: "herbert_simon",
              portrait_url: "/old.png",
              hook: "old hook",
              quote_zh:
                "在信息丰富的世界里，信息的丰富意味其他东西的匮乏：信息消费掉的东西的稀缺。",
              quote_en: "old quote",
              reason: "cached reason",
              resonance_axes: ["工程理性"],
              confidence_style: "strong_resonance",
              loading_copy_zh: "",
              loading_copy_en: "",
              bio_zh: "old bio",
              bio_en: "old bio",
              achievements_zh: ["old"],
              achievements_en: ["old"],
            },
            secondary: [],
          },
          recent_state: null,
        },
      ])
    );

    const loaded = await loadFigureResonanceResult({
      scopeKey: "global:all",
      profileId: snapshot.id,
      language: "zh-CN",
      poolId: pools[0]!.id,
    });

    expect(loaded?.long_term.primary.slug).toBe("herbert_simon");
    expect(loaded?.long_term.primary.reason).toBe("cached reason");
    expect(loaded?.long_term.primary.quote_zh).toBe("信息的丰富，造成了注意力的贫乏。");
    expect(localStorage.getItem("webui:figure-resonance.json:results")).not.toBeNull();
  });

  it("keeps stored pool metadata after the source pool is deleted", async () => {
    const imported = await importFigurePool({
      name: "Investors",
      records: [
        {
          slug: "investor_one",
          name: "Investor One",
          localized_names: { zh: "投资人一号" },
          portrait_url: "/investor.png",
          quote_en: "Focus.",
          quote_zh: "专注。",
          core_traits: "结构化、概率思维",
          thinking_style: "重视框架和复利。",
          temperament_tags: "克制、耐心",
          temperament_summary: "偏向长期主义。",
          loading_copy_zh: "正在匹配长期主义...",
          loading_copy_en: "Matching long-term thinking...",
          bio_zh: "投资人。",
          bio_en: "Investor.",
          achievements_zh: ["长期主义"],
          achievements_en: ["Long-termism"],
        },
      ],
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await generateFigureResonance({
      scopeKey: "global:all",
      poolId: imported.id,
      profileSnapshot: snapshot,
      recentMessages: [
        "我偏好长期主义。",
        "我倾向于框架先行。",
        "我希望表达尽量结构化。",
        "我会过滤掉噪音。",
      ],
      config: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      language: "zh-CN",
    });

    await deleteFigurePool(imported.id);

    const loaded = await loadFigureResonanceResult({
      scopeKey: "global:all",
      profileId: snapshot.id,
      language: "zh-CN",
      poolId: imported.id,
    });

    expect(loaded?.pool_name_snapshot).toBe("Investors");
    expect(loaded?.pool_deleted).toBe(true);
  });

  it("deletes cached resonance results for a profile", async () => {
    const pools = await loadFigurePools();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await generateFigureResonance({
      scopeKey: "global:all",
      poolId: pools[0]!.id,
      profileSnapshot: snapshot,
      recentMessages: [
        "我喜欢把复杂系统压缩成结构化框架。",
        "我希望看到严谨推导，而不是泛泛而谈。",
        "请用清晰的步骤讲解。",
        "我更在意抽象结构和公理化表达。",
      ],
      config: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      language: "zh-CN",
    });

    await deleteFigureResonanceResultsForProfile(snapshot.id);

    const loaded = await loadFigureResonanceResult({
      scopeKey: "global:all",
      profileId: snapshot.id,
      language: "zh-CN",
      poolId: pools[0]!.id,
    });

    expect(loaded).toBeNull();
  });
});
