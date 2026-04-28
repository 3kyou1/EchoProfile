import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ClaudeMessage } from "@/types";

const { mockPersistLlmDebugLog } = vi.hoisted(() => ({
  mockPersistLlmDebugLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/llmDebugLogger", () => ({
  persistLlmDebugLog: mockPersistLlmDebugLog,
}));

import {
  buildCopaPrompt,
  buildScopeKey,
  createSnapshot,
  deleteCopaSnapshot,
  extractUserSignals,
  loadCopaConfig,
  normalizeCopaResponse,
  requestCopaProfile,
  requestThinkingAnalysis,
  renderCopaMarkdown,
  resolveResonanceModelConfig,
  saveCopaSnapshot,
  saveCopaConfig,
  loadCopaSnapshots,
} from "@/services/copaProfileService";
import type { CopaSnapshot } from "@/types/copaProfile";

describe("copaProfileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        content: "Explain with a checklist.",
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
      "Explain with a checklist.",
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

    const result = extractUserSignals(
      [
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
      ],
      { pasteLikeSignalLength: 400, discardSignalLength: 1200 }
    );

    expect(pastedLog.length).toBeGreaterThan(400);
    expect(longPreference.length).toBeGreaterThan(400);
    expect(result.messages).toEqual([longPreference]);
    expect(result.stats.userMessages).toBe(2);
    expect(result.stats.dedupedMessages).toBe(1);
  });

  test("extractUserSignals respects a configurable paste-like length threshold", () => {
    const pastedLog = Array.from(
      { length: 6 },
      (_, index) => `Error: request failed ${index}\n    at module${index}.ts:10:5`
    ).join("\n");

    expect(pastedLog.length).toBeGreaterThan(50);
    expect(pastedLog.length).toBeLessThan(400);

    const withStrictThreshold = extractUserSignals(
      [
        {
          uuid: "u-log",
          sessionId: "s1",
          timestamp: "2026-04-22T00:04:00Z",
          type: "user",
          role: "user",
          content: pastedLog,
        },
      ],
      { pasteLikeSignalLength: 50, discardSignalLength: 400 }
    );

    const withLooseThreshold = extractUserSignals(
      [
        {
          uuid: "u-log",
          sessionId: "s1",
          timestamp: "2026-04-22T00:04:00Z",
          type: "user",
          role: "user",
          content: pastedLog,
        },
      ],
      { pasteLikeSignalLength: 399, discardSignalLength: 400 }
    );

    expect(withStrictThreshold.messages).toEqual([]);
    expect(withLooseThreshold.messages).toEqual([pastedLog.replace(/\s+/g, " ").trim()]);
  });

  test("extractUserSignals drops messages above the discard threshold before paste-like filtering", () => {
    const longPreference =
      "我希望你回答时先给结论，再补关键依据，并且尽量贴近我的实际限制。".repeat(3);
    const shortStructuredPaste = '{"error":"x","stack":["at a","at b"],"code":500}';

    const result = extractUserSignals(
      [
        {
          uuid: "u-long-pref",
          sessionId: "s1",
          timestamp: "2026-04-22T00:05:00Z",
          type: "user",
          role: "user",
          content: longPreference,
        },
        {
          uuid: "u-short-log",
          sessionId: "s1",
          timestamp: "2026-04-22T00:06:00Z",
          type: "user",
          role: "user",
          content: shortStructuredPaste,
        },
      ],
      { pasteLikeSignalLength: 20, discardSignalLength: 80 }
    );

    expect(longPreference.length).toBeGreaterThan(80);
    expect(shortStructuredPaste.length).toBeLessThanOrEqual(80);
    expect(result.messages).toEqual([]);
  });

  test("normalizeCopaResponse fills missing factors with defaults", () => {
    const result = normalizeCopaResponse({
      factors: {
        CT: {
          user_profile_description: "The user wants evidence.",
        },
      },
      prompt_summary: "Prioritize evidence and practical context.",
    });

    expect(result.factors.CT.user_profile_description).toContain("evidence");
    expect(result.factors.SA.user_profile_description.length).toBeGreaterThan(0);
    expect(result.promptSummary).toContain("Prioritize");
  });

  test("normalizeCopaResponse accepts full English factor names", () => {
    const result = normalizeCopaResponse({
      factors: {
        "Cognitive Trust": {
          user_profile_description: "Wants claims backed by evidence.",
        },
      },
      prompt_summary: "Lead with evidence.",
    });

    expect(result.factors.CT.user_profile_description).toContain("evidence");
    expect(result.promptSummary).toBe("Lead with evidence.");
  });

  test("normalizeCopaResponse accepts factors returned as an array with factor_name labels", () => {
    const result = normalizeCopaResponse(
      {
        factors: [
          {
            factor_name: "认知信任",
            user_profile_description: "用户重视可验证的证据。",
          },
          {
            factor_name: "情境锚定",
            user_profile_description: "回答要贴合当前任务。",
          },
        ],
        prompt_summary: "整体偏好高验证性与高情境贴合。",
      },
      "zh"
    );

    expect(result.factors.CT.user_profile_description).toBe("用户重视可验证的证据。");
    expect(result.factors.SA.user_profile_description).toBe("回答要贴合当前任务。");
    expect(result.promptSummary).toBe("整体偏好高验证性与高情境贴合。");
  });

  test("normalizeCopaResponse accepts factors returned as an array with name labels", () => {
    const result = normalizeCopaResponse(
      {
        factors: [
          {
            name: "Cognitive Trust",
            user_profile_description: "Wants evidence-backed claims.",
          },
        ],
        prompt_summary: "Lead with evidence.",
      },
      "en"
    );

    expect(result.factors.CT.user_profile_description).toBe("Wants evidence-backed claims.");
  });

  test("buildCopaPrompt localizes the prompt to English and Chinese", () => {
    const english = buildCopaPrompt(["Please keep this practical."], "en");
    const chinese = buildCopaPrompt(["请保持结论简洁。"], "zh");

    expect(english.system).toContain("You are generating a CoPA profile from user-only interaction history.");
    expect(english.system).toContain("- Cognitive Trust -");
    expect(english.system).not.toContain("CT:");
    expect(english.system).not.toContain("Cognitive Trust (CT)");
    expect(english.system).toContain("Each factor must contain user_profile_description.");
    expect(english.system).not.toContain("response_strategy");
    expect(english.user).toContain("Generate a CoPA profile from these user messages only.");
    expect(english.user).toContain("- Please keep this practical.");

    expect(chinese.system).toContain("你正在基于仅包含用户消息的互动历史生成 CoPA profile。");
    expect(chinese.system).toContain("- 认知信任 -");
    expect(chinese.system).not.toContain("（CT）");
    expect(chinese.system).toContain("每个 factor 都必须包含 user_profile_description。");
    expect(chinese.system).not.toContain("response_strategy");
    expect(chinese.user).toContain("请仅基于这些用户消息生成 CoPA profile。");
    expect(chinese.user).toContain("- 请保持结论简洁。");
  });

  test("buildCopaPrompt supports a lighter entertainment profile mode", () => {
    const english = buildCopaPrompt(["Please keep this practical."], "en", "fun");
    const chinese = buildCopaPrompt(["请保持结论简洁。"], "zh", "fun");

    expect(english.system).toContain("You are generating a profile from user-only interaction history.");
    expect(english.system).toContain("profile_text");
    expect(english.system).toContain("part stand-up comic");
    expect(english.system).toContain("product backlog waiting to be optimized");
    expect(english.system).not.toContain("CoPA factors:");
    expect(english.user).toContain("Ensure title and profile_text are written in English.");
    expect(chinese.system).toContain("你正在基于仅包含用户消息的互动历史生成 profile。");
    expect(chinese.system).toContain("熟人局吐槽大师");
    expect(chinese.system).toContain("人生当成待优化系统的产品经理");
    expect(chinese.system).not.toContain("CoPA 因子：");
    expect(chinese.user).toContain("请确保 title、profile_text 都使用中文。");
  });

  test("normalizeCopaResponse accepts one-paragraph entertainment profiles", () => {
    const result = normalizeCopaResponse(
      {
        title: "高压锅型架构师",
        profile_text: "这个人像一台自带报警器的高压锅：能把复杂系统炖成结构化方案。",
      },
      "zh",
      "fun"
    );

    expect(result.promptSummary).toBe("高压锅型架构师");
    expect(result.funProfileText).toBe("这个人像一台自带报警器的高压锅：能把复杂系统炖成结构化方案。");
  });

  test("requestCopaProfile logs the prompt input and raw response for debugging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "{\"factors\":{},\"prompt_summary\":\"Lead with evidence.\"}",
              },
            },
          ],
        }),
      })
    );

    await requestCopaProfile(
      ["Please keep this practical."],
      {
        baseUrl: "https://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      "en"
    );

    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "copa",
        stage: "request",
        payload: expect.objectContaining({
          language: "en",
          model: "test-model",
          signalCount: 1,
          systemPrompt: expect.stringContaining("You are generating a CoPA profile"),
          userPrompt: expect.stringContaining("- Please keep this practical."),
        }),
      })
    );
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "copa",
        stage: "response",
        payload: {
          rawContent: "{\"factors\":{},\"prompt_summary\":\"Lead with evidence.\"}",
        },
      })
    );
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "copa",
        stage: "diagnosis",
        payload: expect.objectContaining({
          missingFactors: expect.arrayContaining(["CT", "SA", "SC", "CLM", "MS", "AMR"]),
          usedFallbackPromptSummary: false,
        }),
      })
    );
  });

  test("requestThinkingAnalysis uses the Nuwa skill prompt directly on user signals", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "{\"thinking_analysis_text\":\"你用结构先驯服混乱，再把判断压成行动。\"}",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestThinkingAnalysis(
      ["我需要先拆结构再推进。"],
      {
        baseUrl: "https://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      "zh"
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body ?? "{}")) as {
      response_format?: { json_schema?: { name?: string; schema?: Record<string, unknown> } };
      messages?: Array<{ role: string; content: string }>;
    };

    expect(body.response_format?.json_schema?.name).toBe("nuwa_thinking_analysis");
    expect(body.messages?.[0]?.content).toContain("你正在使用思维蒸馏方法");
    expect(body.messages?.[0]?.content).toContain("一个好的人物思维框架是一套全面的认知操作系统");
    expect(body.messages?.[0]?.content).toContain("关键区分：捕捉的是HOW they think，不是WHAT they said。");
    expect(body.messages?.[0]?.content).not.toContain("CoPA 因子");
    expect(body.messages?.[1]?.content).toContain("请仅基于这些用户消息生成思维分析。");
    expect(body.messages?.[1]?.content).toContain("- 我需要先拆结构再推进。");
    expect(result).toBe("你用结构先驯服混乱，再把判断压成行动。");
  });

  test("requestThinkingAnalysis uses the synchronized English Nuwa-style prompt for English UI", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "{\"thinking_analysis_text\":\"You tame ambiguity by making structure executable.\"}",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestThinkingAnalysis(
      ["I need to split the structure before moving forward."],
      {
        baseUrl: "https://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      "en"
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body ?? "{}")) as {
      messages?: Array<{ role: string; content: string }>;
    };

    expect(body.messages?.[0]?.content).toContain("You are using a thinking distillation method");
    expect(body.messages?.[0]?.content).toContain("A good personal thinking framework is a comprehensive cognitive operating system");
    expect(body.messages?.[0]?.content).toContain("Key distinction: capture HOW they think, not WHAT they said.");
    expect(body.messages?.[1]?.content).toContain("Generate a thinking analysis based only on these user messages.");
    expect(result).toBe("You tame ambiguity by making structure executable.");
  });

  test("requestCopaProfile sends a json_schema response format", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "{\"factors\":{},\"prompt_summary\":\"Lead with evidence.\"}",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestCopaProfile(
      ["Please keep this practical."],
      {
        baseUrl: "https://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      "en"
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body ?? "{}")) as {
      response_format?: { type?: string; json_schema?: { name?: string; schema?: Record<string, unknown> } };
    };

    expect(body.response_format?.type).toBe("json_schema");
    expect(body.response_format?.json_schema?.name).toBe("copa_profile");
    expect(body.response_format?.json_schema?.schema).toEqual(
      expect.objectContaining({
        type: "object",
        required: expect.arrayContaining(["factors", "prompt_summary"]),
      })
    );
  });

  test("requestCopaProfile asks for a one-paragraph schema in entertainment mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "{\"title\":\"Builder gremlin\",\"profile_text\":\"A playful profile.\"}",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestCopaProfile(
      ["Please keep this practical."],
      {
        baseUrl: "https://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      "en",
      "fun"
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body ?? "{}")) as {
      response_format?: { type?: string; json_schema?: { name?: string; schema?: Record<string, unknown> } };
    };

    expect(body.response_format?.json_schema?.name).toBe("copa_fun_profile");
    expect(body.response_format?.json_schema?.schema?.required).toEqual(["title", "profile_text"]);
    expect(result.promptSummary).toBe("Builder gremlin");
    expect(result.funProfileText).toBe("A playful profile.");
  });

  test("requestCopaProfile repairs an entertainment response missing the final object brace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"title":"Builder gremlin","profile_text":"A playful profile with enough closure."',
              },
            },
          ],
        }),
      })
    );

    const result = await requestCopaProfile(
      ["Please keep this practical."],
      {
        baseUrl: "https://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      "en",
      "fun"
    );

    expect(result.promptSummary).toBe("Builder gremlin");
    expect(result.funProfileText).toBe("A playful profile with enough closure.");
  });

  test("requestCopaProfile falls back to json_object when json_schema is unsupported", async () => {
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
                content: "{\"factors\":{},\"prompt_summary\":\"Lead with evidence.\"}",
              },
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestCopaProfile(
      ["Please keep this practical."],
      {
        baseUrl: "https://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      "en"
    );

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      response_format?: { type?: string };
    };
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}")) as {
      response_format?: { type?: string };
    };

    expect(firstBody.response_format?.type).toBe("json_schema");
    expect(secondBody.response_format?.type).toBe("json_object");
    expect(result.promptSummary).toBe("Lead with evidence.");
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "copa",
        stage: "schema_fallback",
        payload: expect.objectContaining({
          from: "json_schema",
          to: "json_object",
          status: 400,
        }),
      })
    );
  });

  test("requestCopaProfile throws when the model returns invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "not valid json",
              },
            },
          ],
        }),
      })
    );

    await expect(
      requestCopaProfile(
        ["Please keep this practical."],
        {
          baseUrl: "https://example.com/v1",
          model: "test-model",
          apiKey: "test-key",
        },
        "en"
      )
    ).rejects.toThrow("CoPA model returned invalid JSON.");

    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "copa",
        stage: "parse_error",
        level: "warn",
        payload: expect.objectContaining({
          rawContent: "not valid json",
        }),
      })
    );
  });

  test("requestCopaProfile logs http errors before throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        statusText: "Gateway Timeout",
        text: async () => "upstream timeout",
      })
    );

    await expect(
      requestCopaProfile(
        ["Please keep this practical."],
        {
          baseUrl: "https://example.com/v1",
          model: "test-model",
          apiKey: "test-key",
        },
        "en"
      )
    ).rejects.toThrow("upstream timeout");

    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "copa",
        stage: "fetch_resolved",
        payload: expect.objectContaining({
          ok: false,
          status: 504,
          statusText: "Gateway Timeout",
        }),
      })
    );
    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "copa",
        stage: "http_error",
        level: "warn",
        payload: expect.objectContaining({
          status: 504,
          detail: "upstream timeout",
        }),
      })
    );
  });

  test("requestCopaProfile logs response json errors before throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => {
          throw new Error("unexpected end of json input");
        },
      })
    );

    await expect(
      requestCopaProfile(
        ["Please keep this practical."],
        {
          baseUrl: "https://example.com/v1",
          model: "test-model",
          apiKey: "test-key",
        },
        "en"
      )
    ).rejects.toThrow("unexpected end of json input");

    expect(mockPersistLlmDebugLog).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "copa",
        stage: "response_json_error",
        level: "warn",
        payload: expect.objectContaining({
          status: 200,
          error: "unexpected end of json input",
        }),
      })
    );
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

  test("renderCopaMarkdown renders entertainment profiles without factor sections", () => {
    const markdown = renderCopaMarkdown({
      id: "snap-fun",
      createdAt: "2026-04-22T12:00:00.000Z",
      language: "zh",
      profileMode: "fun",
      scope: {
        type: "global",
        ref: "global",
        label: "全局",
        key: buildScopeKey({ type: "global", ref: "global", providerScope: ["claude"] }),
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
      promptSummary: "高压锅型架构师",
      factors: normalizeCopaResponse({}, "zh").factors,
      funProfileText: "这个人像一台自带报警器的高压锅。",
      markdown: "",
    });

    expect(markdown).toContain("这个人像一台自带报警器的高压锅。");
    expect(markdown).not.toContain("### 认知信任");
    expect(markdown).toContain("## 元数据");
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
      profileMode: "fun",
    });

    expect(snapshot.language).toBe("zh");
    expect(snapshot.profileMode).toBe("fun");
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
    expect(config.discardSignalLength).toBe(50);
    expect(config.pasteLikeSignalLength).toBe(40);
  });

  test("saveCopaConfig keeps the paste-like filter threshold below the discard threshold", async () => {
    const config = await saveCopaConfig({
      copa: {
        baseUrl: "https://copa.example.com/v1",
        model: "copa-model",
      },
      resonance: {
        enabled: false,
        config: {
          baseUrl: "https://res.example.com/v1",
          model: "res-model",
        },
      },
      discardSignalLength: 50,
      pasteLikeSignalLength: 80,
    });

    expect(config.discardSignalLength).toBe(50);
    expect(config.pasteLikeSignalLength).toBe(49);
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
