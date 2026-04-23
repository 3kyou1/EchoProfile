import { beforeEach, describe, expect, test } from "vitest";
import type { ClaudeMessage } from "@/types";
import {
  buildCopaPrompt,
  buildScopeKey,
  createSnapshot,
  deleteCopaSnapshot,
  extractUserSignals,
  loadCopaConfig,
  normalizeCopaResponse,
  renderCopaMarkdown,
  resolveResonanceModelConfig,
  saveCopaSnapshot,
  saveCopaConfig,
  loadCopaSnapshots,
} from "@/services/copaProfileService";
import type { CopaSnapshot } from "@/types/copaProfile";

describe("copaProfileService", () => {
  beforeEach(() => {
    const backing = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => backing.get(key) ?? null,
        setItem: (key: string, value: string) => {
          backing.set(key, value);
        },
        removeItem: (key: string) => {
          backing.delete(key);
        },
        clear: () => {
          backing.clear();
        },
      },
    });
  });

  test("extractUserSignals keeps user text only, including short messages, and removes duplicates", () => {
    const messages: ClaudeMessage[] = [
      {
        uuid: "u1",
        sessionId: "s1",
        timestamp: "2026-04-22T00:00:00Z",
        type: "user",
        role: "user",
        content: "Explain this like I know the basics but not the details.",
      },
      {
        uuid: "a1",
        sessionId: "s1",
        timestamp: "2026-04-22T00:01:00Z",
        type: "assistant",
        role: "assistant",
        content: "Sure",
      },
      {
        uuid: "u2",
        sessionId: "s1",
        timestamp: "2026-04-22T00:02:00Z",
        type: "user",
        role: "user",
        content: [
          { type: "text", text: "Please give me a checklist." },
          { type: "text", text: "Please give me a checklist." },
        ],
      },
      {
        uuid: "u3",
        sessionId: "s1",
        timestamp: "2026-04-22T00:03:00Z",
        type: "user",
        role: "user",
        content: "ok",
      },
    ];

    const result = extractUserSignals(messages);

    expect(result.messages).toEqual([
      "Explain this like I know the basics but not the details.",
      "Please give me a checklist.",
      "ok",
    ]);
    expect(result.stats.userMessages).toBe(3);
    expect(result.stats.dedupedMessages).toBe(3);
  });

  test("extractUserSignals drops only long pasted content while keeping long preference-style messages", () => {
    const pastedLog = Array.from(
      { length: 12 },
      (_, index) => `Error: request failed ${index}\n    at module${index}.ts:10:5`
    ).join("\n");
    const longPreference =
      "我希望你回答时先给结论，再补关键依据，并且尽量贴近我的实际限制，不要把重点淹没在背景介绍里。".repeat(10);

    const result = extractUserSignals([
      {
        uuid: "u-long-log",
        sessionId: "s1",
        timestamp: "2026-04-22T00:04:00Z",
        type: "user",
        role: "user",
        content: pastedLog,
      },
      {
        uuid: "u-long-pref",
        sessionId: "s1",
        timestamp: "2026-04-22T00:05:00Z",
        type: "user",
        role: "user",
        content: longPreference,
      },
    ]);

    expect(pastedLog.length).toBeGreaterThan(400);
    expect(longPreference.length).toBeGreaterThan(400);
    expect(result.messages).toEqual([longPreference]);
    expect(result.stats.userMessages).toBe(2);
    expect(result.stats.dedupedMessages).toBe(1);
  });

  test("normalizeCopaResponse fills missing factors with defaults", () => {
    const result = normalizeCopaResponse({
      factors: {
        CT: {
          user_profile_description: "The user wants evidence.",
          response_strategy: ["Show sources."],
        },
      },
      prompt_summary: "Prioritize evidence and practical context.",
    });

    expect(result.factors.CT.user_profile_description).toContain("evidence");
    expect(result.factors.SA.response_strategy.length).toBeGreaterThan(0);
    expect(result.promptSummary).toContain("Prioritize");
  });

  test("normalizeCopaResponse accepts full English factor names", () => {
    const result = normalizeCopaResponse({
      factors: {
        "Cognitive Trust": {
          user_profile_description: "Wants claims backed by evidence.",
          response_strategy: ["Cite concrete evidence."],
        },
      },
      prompt_summary: "Lead with evidence.",
    });

    expect(result.factors.CT.user_profile_description).toContain("evidence");
    expect(result.factors.CT.response_strategy).toEqual(["Cite concrete evidence."]);
    expect(result.promptSummary).toBe("Lead with evidence.");
  });

  test("buildCopaPrompt localizes the prompt to English and Chinese", () => {
    const english = buildCopaPrompt(["Please keep this practical."], "en");
    const chinese = buildCopaPrompt(["请保持结论简洁。"], "zh");

    expect(english.system).toContain("You are generating a CoPA profile from user-only interaction history.");
    expect(english.system).toContain("- Cognitive Trust -");
    expect(english.system).not.toContain("CT:");
    expect(english.system).not.toContain("Cognitive Trust (CT)");
    expect(english.user).toContain("Generate a CoPA profile from these user messages only.");
    expect(english.user).toContain("- Please keep this practical.");

    expect(chinese.system).toContain("你正在基于仅包含用户消息的互动历史生成 CoPA profile。");
    expect(chinese.system).toContain("- 认知信任 -");
    expect(chinese.system).not.toContain("（CT）");
    expect(chinese.user).toContain("请仅基于这些用户消息生成 CoPA profile。");
    expect(chinese.user).toContain("- 请保持结论简洁。");
  });

  test("saveCopaSnapshot appends snapshots and loadCopaSnapshots returns latest first", async () => {
    const first: CopaSnapshot = {
      id: "snap-1",
      createdAt: "2026-04-22T10:00:00.000Z",
      language: "en",
      scope: {
        type: "project",
        ref: "/tmp/project-a",
        label: "Project A",
        key: buildScopeKey({ type: "project", ref: "/tmp/project-a" }),
      },
      providerScope: ["claude"],
      sourceStats: {
        projectCount: 1,
        sessionCount: 2,
        rawUserMessages: 10,
        dedupedUserMessages: 8,
        truncatedMessages: 0,
      },
      modelConfig: {
        baseUrl: "https://example.com/v1",
        model: "gpt-test",
      },
      promptSummary: "Summary one",
      factors: normalizeCopaResponse({}).factors,
      markdown: "markdown one",
    };

    const second: CopaSnapshot = {
      ...first,
      id: "snap-2",
      createdAt: "2026-04-22T11:00:00.000Z",
      language: "zh",
      promptSummary: "Summary two",
      markdown: "markdown two",
    };

    await saveCopaSnapshot(first);
    await saveCopaSnapshot(second);

    const snapshots = await loadCopaSnapshots();

    expect(snapshots.map((snapshot) => snapshot.id)).toEqual(["snap-2", "snap-1"]);
    expect(snapshots.map((snapshot) => snapshot.language)).toEqual(["zh", "en"]);
  });

  test("deleteCopaSnapshot removes only the target snapshot", async () => {
    const first: CopaSnapshot = {
      id: "snap-1",
      createdAt: "2026-04-22T10:00:00.000Z",
      language: "en",
      scope: {
        type: "project",
        ref: "/tmp/project-a",
        label: "Project A",
        key: buildScopeKey({ type: "project", ref: "/tmp/project-a" }),
      },
      providerScope: ["claude"],
      sourceStats: {
        projectCount: 1,
        sessionCount: 2,
        rawUserMessages: 10,
        dedupedUserMessages: 8,
        truncatedMessages: 0,
      },
      modelConfig: {
        baseUrl: "https://example.com/v1",
        model: "gpt-test",
      },
      promptSummary: "Summary one",
      factors: normalizeCopaResponse({}).factors,
      markdown: "markdown one",
    };

    const second: CopaSnapshot = {
      ...first,
      id: "snap-2",
      createdAt: "2026-04-22T11:00:00.000Z",
      language: "en",
      promptSummary: "Summary two",
      markdown: "markdown two",
    };

    await saveCopaSnapshot(first);
    await saveCopaSnapshot(second);

    const snapshots = await deleteCopaSnapshot("snap-2");

    expect(snapshots.map((snapshot) => snapshot.id)).toEqual(["snap-1"]);
  });

  test("renderCopaMarkdown includes all factor sections and metadata", () => {
    const normalized = normalizeCopaResponse({
      prompt_summary: "Keep answers practical and trustworthy.",
    }, "en");

    const markdown = renderCopaMarkdown({
      id: "snap-1",
      createdAt: "2026-04-22T12:00:00.000Z",
      language: "en",
      scope: {
        type: "global",
        ref: "global",
        label: "Global",
        key: buildScopeKey({ type: "global", ref: "global", providerScope: ["claude", "codex"] }),
      },
      providerScope: ["claude", "codex"],
      sourceStats: {
        projectCount: 4,
        sessionCount: 18,
        rawUserMessages: 120,
        dedupedUserMessages: 96,
        truncatedMessages: 3,
      },
      modelConfig: {
        baseUrl: "https://example.com/v1",
        model: "gpt-test",
      },
      promptSummary: normalized.promptSummary,
      factors: normalized.factors,
      markdown: "",
    });

    expect(markdown).toContain("## CoPA Profile");
    expect(markdown).toContain("### Cognitive Trust (CT)");
    expect(markdown).toContain("### Affective and Motivational Resonance (AMR)");
    expect(markdown).toContain("## Metadata");
  });

  test("createSnapshot freezes the generation language and localized factor copy", () => {
    const normalized = normalizeCopaResponse({}, "zh");

    const snapshot = createSnapshot({
      language: "zh",
      scope: {
        type: "global",
        ref: "global",
        label: "全局历史",
        key: buildScopeKey({ type: "global", ref: "global", providerScope: ["claude"] }),
      },
      providerScope: ["claude"],
      sourceStats: {
        projectCount: 1,
        sessionCount: 1,
        rawUserMessages: 3,
        dedupedUserMessages: 3,
        truncatedMessages: 0,
      },
      modelConfig: {
        baseUrl: "https://example.com/v1",
        model: "gpt-test",
      },
      promptSummary: "保持聚焦、简洁和严谨。",
      factors: normalized.factors,
    });

    expect(snapshot.language).toBe("zh");
    expect(snapshot.factors.CT.title).toBe("认知信任（CT）");
    expect(snapshot.markdown).toContain("## CoPA 画像");
  });

  test("loadCopaSnapshots backfills a missing legacy snapshot language without rewriting its copy", async () => {
    localStorage.setItem(
      "webui:copa-profiles.json:snapshots",
      JSON.stringify([
        {
          id: "legacy-1",
          createdAt: "2026-04-22T09:00:00.000Z",
          scope: {
            type: "global",
            ref: "global",
            label: "Global",
            key: "global:all",
          },
          providerScope: ["claude"],
          sourceStats: {
            projectCount: 1,
            sessionCount: 1,
            rawUserMessages: 8,
            dedupedUserMessages: 6,
            truncatedMessages: 0,
          },
          modelConfig: {
            baseUrl: "https://example.com/v1",
            model: "gpt-test",
          },
          promptSummary: "保持简洁。",
          factors: normalizeCopaResponse({}, "zh").factors,
          markdown: "## CoPA 画像",
        },
      ])
    );

    const [snapshot] = await loadCopaSnapshots();

    expect(snapshot.language).toBe("zh");
    expect(snapshot.promptSummary).toBe("保持简洁。");
    expect(snapshot.factors.CT.title).toBe("认知信任（CT）");
  });

  test("loadCopaConfig migrates legacy single-config storage into dual llm config", async () => {
    localStorage.setItem(
      "webui:copa-profiles.json:config",
      JSON.stringify({
        baseUrl: "https://legacy.example.com/v1",
        model: "legacy-model",
        apiKey: "legacy-key",
        temperature: 0.4,
      })
    );

    const config = await loadCopaConfig();

    expect(config.copa.baseUrl).toBe("https://legacy.example.com/v1");
    expect(config.copa.model).toBe("legacy-model");
    expect(config.resonance.enabled).toBe(false);
    expect(config.resonance.config.model).toBe("legacy-model");
  });

  test("resolveResonanceModelConfig falls back to CoPA config until a separate resonance config is enabled", async () => {
    const config = await saveCopaConfig({
      copa: {
        baseUrl: "https://copa.example.com/v1",
        model: "copa-model",
        apiKey: "copa-key",
        temperature: 0.2,
      },
      resonance: {
        enabled: false,
        config: {
          baseUrl: "https://res.example.com/v1",
          model: "res-model",
          apiKey: "res-key",
          temperature: 0.3,
        },
      },
    });

    expect(resolveResonanceModelConfig(config)).toMatchObject({
      baseUrl: "https://copa.example.com/v1",
      model: "copa-model",
      apiKey: "copa-key",
    });

    const withSeparateResonance = await saveCopaConfig({
      ...config,
      resonance: {
        enabled: true,
        config: {
          baseUrl: "https://res.example.com/v1",
          model: "res-model",
          apiKey: "res-key",
          temperature: 0.3,
        },
      },
    });

    expect(resolveResonanceModelConfig(withSeparateResonance)).toMatchObject({
      baseUrl: "https://res.example.com/v1",
      model: "res-model",
      apiKey: "res-key",
    });
  });
});
