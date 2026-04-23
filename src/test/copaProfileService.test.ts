import { beforeEach, describe, expect, test } from "vitest";
import type { ClaudeMessage } from "@/types";
import {
  buildScopeKey,
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

  test("extractUserSignals keeps user text only and removes duplicates", () => {
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
    ]);
    expect(result.stats.userMessages).toBe(3);
    expect(result.stats.dedupedMessages).toBe(2);
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

  test("saveCopaSnapshot appends snapshots and loadCopaSnapshots returns latest first", async () => {
    const first: CopaSnapshot = {
      id: "snap-1",
      createdAt: "2026-04-22T10:00:00.000Z",
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
      promptSummary: "Summary two",
      markdown: "markdown two",
    };

    await saveCopaSnapshot(first);
    await saveCopaSnapshot(second);

    const snapshots = await loadCopaSnapshots();

    expect(snapshots.map((snapshot) => snapshot.id)).toEqual(["snap-2", "snap-1"]);
  });

  test("deleteCopaSnapshot removes only the target snapshot", async () => {
    const first: CopaSnapshot = {
      id: "snap-1",
      createdAt: "2026-04-22T10:00:00.000Z",
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
    });

    const markdown = renderCopaMarkdown({
      id: "snap-1",
      createdAt: "2026-04-22T12:00:00.000Z",
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
