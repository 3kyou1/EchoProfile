import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CopaSnapshot } from "@/types/copaProfile";
import {
  buildScientistResonanceCacheKey,
  deleteScientistResonanceResultsForProfile,
  generateScientistResonance,
  getScientistPoolCount,
  loadScientistResonanceResult,
} from "@/services/scientistResonanceService";

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
      response_strategy: ["Show assumptions clearly."],
    },
    SA: {
      code: "SA",
      title: "Situational Anchoring",
      description: "Context",
      user_profile_description: "Keeps answers tightly scoped.",
      response_strategy: ["Stay close to task constraints."],
    },
    SC: {
      code: "SC",
      title: "Schema Consistency",
      description: "Schema",
      user_profile_description: "Likes formal abstractions.",
      response_strategy: ["Reuse the user's terminology."],
    },
    CLM: {
      code: "CLM",
      title: "Cognitive Load Management",
      description: "Load",
      user_profile_description: "Prefers chunked explanations.",
      response_strategy: ["Break work into smaller steps."],
    },
    MS: {
      code: "MS",
      title: "Metacognitive Scaffolding",
      description: "Scaffold",
      user_profile_description: "Wants reasoning structure.",
      response_strategy: ["Expose the order of reasoning steps."],
    },
    AMR: {
      code: "AMR",
      title: "Affective and Motivational Resonance",
      description: "Tone",
      user_profile_description: "Prefers calm, focused support.",
      response_strategy: ["Keep the tone supportive and composed."],
    },
  },
  markdown: "## CoPA Profile\n\n- User profile: Likes formal abstractions, structure compression, calm rigor.",
};

describe("scientistResonanceService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
  });

  it("normalizes cache key by language", () => {
    expect(
      buildScientistResonanceCacheKey({
        scopeKey: "global:all",
        profileId: "profile-1",
        language: "zh-CN",
      })
    ).toBe("global:all:profile-1:zh");
  });

  it("falls back to heuristic generation when llm request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await generateScientistResonance({
      scopeKey: "global:all",
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
    expect(result.long_term.primary.slug).toBeTruthy();
    expect(result.long_term.secondary.length).toBeLessThanOrEqual(2);
    expect(result.recent_state).not.toBeNull();
    expect(getScientistPoolCount()).toBeGreaterThan(10);
  });

  it("persists generated resonance result in cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const generated = await generateScientistResonance({
      scopeKey: "global:all",
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

    const loaded = await loadScientistResonanceResult({
      scopeKey: "global:all",
      profileId: snapshot.id,
      language: "zh-CN",
    });

    expect(loaded?.id).toBe(generated.id);
    expect(loaded?.cache_key).toBe(generated.cache_key);
  });

  it("rehydrates cached resonance cards from the latest scientist pool data", async () => {
    const cacheKey = buildScientistResonanceCacheKey({
      scopeKey: "global:all",
      profileId: snapshot.id,
      language: "zh-CN",
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

    const loaded = await loadScientistResonanceResult({
      scopeKey: "global:all",
      profileId: snapshot.id,
      language: "zh-CN",
    });

    expect(loaded?.long_term.primary.slug).toBe("herbert_simon");
    expect(loaded?.long_term.primary.reason).toBe("cached reason");
    expect(loaded?.long_term.primary.quote_zh).toBe("信息的丰富，造成了注意力的贫乏。");
  });

  it("deletes cached resonance results for a profile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await generateScientistResonance({
      scopeKey: "global:all",
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

    await deleteScientistResonanceResultsForProfile(snapshot.id);

    const loaded = await loadScientistResonanceResult({
      scopeKey: "global:all",
      profileId: snapshot.id,
      language: "zh-CN",
    });

    expect(loaded).toBeNull();
  });
});
