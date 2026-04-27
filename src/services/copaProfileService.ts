import { storageAdapter } from "@/services/storage";
import { persistLlmDebugLog } from "@/services/llmDebugLogger";
import type { ClaudeMessage } from "@/types";
import type {
  CopaFactor,
  CopaFactorCode,
  CopaFactors,
  CopaLanguage,
  CopaLlmConfigState,
  CopaModelConfig,
  CopaNormalizedResponse,
  CopaSnapshot,
  CopaStoredState,
  ExtractedSignalResult,
} from "@/types/copaProfile";

const STORE_NAME = "copa-profiles.json";
const SNAPSHOTS_KEY = "snapshots";
const CONFIG_KEY = "config";
const MAX_SIGNAL_LENGTH = 1200;
const DEFAULT_DISCARD_SIGNAL_LENGTH = 50;
const DEFAULT_PASTE_LIKE_SIGNAL_LENGTH = 40;

const FACTOR_ORDER: CopaFactorCode[] = ["CT", "SA", "SC", "CLM", "MS", "AMR"];

const FACTOR_SPECS: Record<
  CopaLanguage,
  Record<CopaFactorCode, { title: string; description: string; fallbackSummary: string }>
> = {
  en: {
    CT: {
      title: "Cognitive Trust (CT)",
      description:
        "How strongly the user expects evidence, source quality, rigor, and trustworthy reasoning.",
      fallbackSummary: "The user shows no strong new trust signal yet.",
    },
    SA: {
      title: "Situational Anchoring (SA)",
      description:
        "How tightly the answer should stay anchored to the user's task, constraints, and real situation.",
      fallbackSummary: "The user shows no strong new situational anchoring signal yet.",
    },
    SC: {
      title: "Schema Consistency (SC)",
      description:
        "How much the answer should align with the user's vocabulary, mental model, and existing framework.",
      fallbackSummary: "The user shows no strong new schema consistency signal yet.",
    },
    CLM: {
      title: "Cognitive Load Management (CLM)",
      description:
        "How much complexity, density, and number of steps the user can comfortably absorb at once.",
      fallbackSummary: "The user shows no strong new cognitive load signal yet.",
    },
    MS: {
      title: "Metacognitive Scaffolding (MS)",
      description:
        "How much the answer should help the user reason, self-check, debug, and structure decisions.",
      fallbackSummary: "The user shows no strong new metacognitive scaffolding signal yet.",
    },
    AMR: {
      title: "Affective and Motivational Resonance (AMR)",
      description:
        "How much tone, encouragement, and support style should match the user's motivation and emotional state.",
      fallbackSummary: "The user shows no strong new motivational tone signal yet.",
    },
  },
  zh: {
    CT: {
      title: "认知信任（CT）",
      description: "用户对证据、来源质量、严谨性与可信推理的期待强度。",
      fallbackSummary: "用户暂时没有表现出明显的新信任偏好信号。",
    },
    SA: {
      title: "情境锚定（SA）",
      description: "回答需要多紧密地锚定在用户当前任务、约束与真实处境上。",
      fallbackSummary: "用户暂时没有表现出明显的新情境锚定信号。",
    },
    SC: {
      title: "图式一致性（SC）",
      description: "回答需要多大程度贴合用户的术语、心智模型与既有框架。",
      fallbackSummary: "用户暂时没有表现出明显的新图式一致性信号。",
    },
    CLM: {
      title: "认知负荷管理（CLM）",
      description: "用户一次能舒适吸收的复杂度、信息密度与步骤数量。",
      fallbackSummary: "用户暂时没有表现出明显的新认知负荷信号。",
    },
    MS: {
      title: "元认知支架（MS）",
      description: "回答需要多大程度帮助用户进行推理、自检、调试与结构化决策。",
      fallbackSummary: "用户暂时没有表现出明显的新元认知支架信号。",
    },
    AMR: {
      title: "情感与动机共振（AMR）",
      description: "语气、鼓励与支持风格需要多大程度贴合用户的动机和情绪状态。",
      fallbackSummary: "用户暂时没有表现出明显的新动机语气信号。",
    },
  },
};

const MARKDOWN_LABELS: Record<
  CopaLanguage,
  {
    profileTitle: string;
    generated: string;
    scope: string;
    definition: string;
    userProfile: string;
    promptSummary: string;
    metadata: string;
    providers: string;
    projects: string;
    sessions: string;
    rawUserMessages: string;
    dedupedUserMessages: string;
    truncatedMessages: string;
    model: string;
    baseUrl: string;
  }
> = {
  en: {
    profileTitle: "## CoPA Profile",
    generated: "Generated",
    scope: "Scope",
    definition: "Definition",
    userProfile: "User profile",
    promptSummary: "## Prompt Summary",
    metadata: "## Metadata",
    providers: "Providers",
    projects: "Projects",
    sessions: "Sessions",
    rawUserMessages: "Raw user messages",
    dedupedUserMessages: "Deduped user messages",
    truncatedMessages: "Truncated messages",
    model: "Model",
    baseUrl: "Base URL",
  },
  zh: {
    profileTitle: "## CoPA 画像",
    generated: "生成时间",
    scope: "范围",
    definition: "定义",
    userProfile: "用户画像",
    promptSummary: "## Prompt 摘要",
    metadata: "## 元数据",
    providers: "Provider",
    projects: "项目数",
    sessions: "会话数",
    rawUserMessages: "原始用户消息数",
    dedupedUserMessages: "去重后用户消息数",
    truncatedMessages: "截断消息数",
    model: "模型",
    baseUrl: "Base URL",
  },
};

const COPA_FACTOR_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    user_profile_description: { type: "string" },
  },
  required: ["user_profile_description"],
};

const COPA_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "copa_profile",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        factors: {
          type: "object",
          additionalProperties: false,
          properties: Object.fromEntries(
            FACTOR_ORDER.map((code) => [code, COPA_FACTOR_RESPONSE_SCHEMA])
          ),
          required: [...FACTOR_ORDER],
        },
        prompt_summary: { type: "string" },
      },
      required: ["factors", "prompt_summary"],
    },
  },
};

const COPA_JSON_OBJECT_RESPONSE_FORMAT = { type: "json_object" } as const;
const COPA_INVALID_JSON_ERROR = "CoPA model returned invalid JSON.";

function shouldFallbackToJsonObject(status: number, detail: string): boolean {
  if (status !== 400) {
    return false;
  }

  const normalized = detail.toLowerCase();
  return (
    normalized.includes("json_schema") ||
    normalized.includes("response_format") ||
    normalized.includes("not supported") ||
    normalized.includes("unsupported")
  );
}

export const DEFAULT_COPA_MODEL_CONFIG: CopaModelConfig = {
  baseUrl: "http://35.220.164.252:3888/v1",
  model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
  apiKey: "sk-bJGY1sslj60pLLE3Mx8FFAUUCmJKEFsVBvoZ3oAE1DUpLFa6",
  temperature: 0.2,
};

export const DEFAULT_COPA_LLM_CONFIG: CopaLlmConfigState = {
  copa: { ...DEFAULT_COPA_MODEL_CONFIG },
  resonance: {
    enabled: false,
    config: { ...DEFAULT_COPA_MODEL_CONFIG },
  },
  discardSignalLength: DEFAULT_DISCARD_SIGNAL_LENGTH,
  pasteLikeSignalLength: DEFAULT_PASTE_LIKE_SIGNAL_LENGTH,
};

function stripFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const lines = trimmed.split("\n");
  const body = lines.slice(1, lines[lines.length - 1]?.trim() === "```" ? -1 : undefined);
  return body.join("\n").trim();
}

function contentToText(content: ClaudeMessage["content"]): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      if ("text" in item && typeof item.text === "string") {
        return item.text.trim();
      }

      if ("content" in item && typeof item.content === "string") {
        return item.content.trim();
      }

      return "";
    })
    .filter(Boolean);

  return [...new Set(parts)].join("\n").trim();
}

function normalizeSignal(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeSignalLengthThreshold(value: unknown, fallback: number, minimum = 1): number {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(normalized)) {
    return fallback;
  }

  return Math.min(MAX_SIGNAL_LENGTH, Math.max(minimum, Math.round(normalized)));
}

function normalizeSignalThresholds(input: {
  discardSignalLength?: unknown;
  pasteLikeSignalLength?: unknown;
}): { discardSignalLength: number; pasteLikeSignalLength: number } {
  const discardSignalLength = normalizeSignalLengthThreshold(
    input.discardSignalLength,
    DEFAULT_DISCARD_SIGNAL_LENGTH,
    2
  );
  const rawPasteLikeSignalLength = normalizeSignalLengthThreshold(
    input.pasteLikeSignalLength,
    DEFAULT_PASTE_LIKE_SIGNAL_LENGTH,
    1
  );

  return {
    discardSignalLength,
    pasteLikeSignalLength: Math.min(rawPasteLikeSignalLength, discardSignalLength - 1),
  };
}

function factorPromptLabel(code: CopaFactorCode, language: CopaLanguage): string {
  return FACTOR_SPECS[language][code].title.replace(/\s*\([A-Z]+\)$|\s*（[A-Z]+）$/g, "").trim();
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function isLikelyPastedContent(
  rawText: string,
  normalizedText: string,
  pasteLikeSignalLength: number
): boolean {
  if (normalizedText.length <= pasteLikeSignalLength) {
    return false;
  }

  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const shortLineCount = lines.filter((line) => line.length <= 120).length;
  const structuredLineCount = lines.filter((line) =>
    /^(at\s+\S+\s*\(|\{|\}|\[|\]|<\/?[a-z]+|[\w.-]+\s*:|error:|exception\b|traceback\b)/i.test(line)
  ).length;
  const stackTraceLike = /(traceback|exception|error:|^\s*at\s+\S+)/im.test(rawText);
  const codeKeywordLike =
    /\b(function|const|let|var|import|export|class|public|private|return|console\.log|select\b|insert\b|update\b|delete\b|create table)\b/i.test(
      rawText
    );
  const jsonLike =
    /"\w[\w.-]*"\s*:/.test(rawText) || /(?:\{|\[)\s*[\s\S]*:\s*[\s\S]*(?:\}|\])/.test(rawText);
  const htmlLike = /<\/?[a-z][^>]*>/i.test(rawText);
  const urlCount = countMatches(rawText, /https?:\/\/\S+/g);
  const symbolCount = countMatches(rawText, /(?:\{|\}|\[|\]|<|>|`|;|\$|=|\|)/g);
  const symbolDensity = symbolCount / Math.max(1, rawText.length);
  const manyStructuredLines = lines.length >= 8 && shortLineCount >= Math.ceil(lines.length * 0.6);

  if (stackTraceLike && manyStructuredLines) {
    return true;
  }

  if ((codeKeywordLike || jsonLike || htmlLike) && (structuredLineCount >= 3 || symbolDensity >= 0.04)) {
    return true;
  }

  if (urlCount >= 3 && lines.length >= 4) {
    return true;
  }

  return false;
}

function containsHanCharacters(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

export function normalizeCopaLanguage(language?: string | null): CopaLanguage {
  return typeof language === "string" && language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function buildDefaultFactor(code: CopaFactorCode, language: CopaLanguage): CopaFactor {
  const spec = FACTOR_SPECS[language][code];
  return {
    code,
    title: spec.title,
    description: spec.description,
    user_profile_description: spec.fallbackSummary,
  };
}

function factorLookupKeys(code: CopaFactorCode): string[] {
  return [
    code,
    factorPromptLabel(code, "en"),
    factorPromptLabel(code, "zh"),
    FACTOR_SPECS.en[code].title,
    FACTOR_SPECS.zh[code].title,
  ];
}

function pickFactorPayload(
  factorsValue: Record<string, unknown>,
  code: CopaFactorCode
): unknown {
  for (const key of factorLookupKeys(code)) {
    if (key in factorsValue) {
      return factorsValue[key];
    }
  }

  return undefined;
}

function buildFactorRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return value.reduce((accumulator, item) => {
      if (!item || typeof item !== "object") {
        return accumulator;
      }

      const payload = item as Record<string, unknown>;
      const factorName =
        typeof payload.factor_name === "string"
          ? payload.factor_name.trim()
          : typeof payload.name === "string"
            ? payload.name.trim()
            : "";

      if (!factorName) {
        return accumulator;
      }

      accumulator[factorName] = payload;
      return accumulator;
    }, {} as Record<string, unknown>);
  }

  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeFactor(code: CopaFactorCode, value: unknown, language: CopaLanguage): CopaFactor {
  const fallback = buildDefaultFactor(code, language);

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const payload = value as {
    title?: unknown;
    description?: unknown;
    user_profile_description?: unknown;
  };

  return {
    ...fallback,
    title: typeof payload.title === "string" && payload.title.trim().length > 0 ? payload.title.trim() : fallback.title,
    description:
      typeof payload.description === "string" && payload.description.trim().length > 0
        ? payload.description.trim()
        : fallback.description,
    user_profile_description:
      typeof payload.user_profile_description === "string" &&
      payload.user_profile_description.trim().length > 0
        ? payload.user_profile_description.trim()
        : fallback.user_profile_description,
  };
}

function buildPromptSummary(factors: CopaFactors, language: CopaLanguage): string {
  const parts = ["SA", "CLM", "SC", "MS", "CT", "AMR"].map((code) => {
    const factor = factors[code as keyof CopaFactors];
    return factor.user_profile_description
      .split(/(?<=[.!?。！？])\s+/)[0]
      ?.replace(/[.;。；]+$/g, "")
      .trim();
  });

  const compact = parts.filter(Boolean).join("; ");
  if (compact) {
    return compact;
  }

  return language === "zh"
    ? "根据用户的任务、节奏、认知框架与信任需求来调整回答。"
    : "Adapt to the user's task, pace, framework, and trust needs.";
}

function normalizeModelConfig(value: unknown, fallback: CopaModelConfig): CopaModelConfig {
  const payload = value && typeof value === "object" ? (value as Partial<CopaModelConfig>) : {};

  const baseUrl =
    typeof payload.baseUrl === "string" && payload.baseUrl.trim().length > 0
      ? payload.baseUrl.trim()
      : fallback.baseUrl;
  const model =
    typeof payload.model === "string" && payload.model.trim().length > 0
      ? payload.model.trim()
      : fallback.model;
  const apiKey =
    typeof payload.apiKey === "string" && payload.apiKey.trim().length > 0
      ? payload.apiKey.trim()
      : fallback.apiKey;
  const temperature =
    typeof payload.temperature === "number" ? payload.temperature : fallback.temperature;

  return {
    baseUrl,
    model,
    apiKey,
    temperature,
  };
}

function normalizeLlmConfigState(value: unknown): CopaLlmConfigState {
  const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const signalThresholds = normalizeSignalThresholds({
    discardSignalLength: payload.discardSignalLength,
    pasteLikeSignalLength: payload.pasteLikeSignalLength,
  });

  if ("copa" in payload) {
    const copa = normalizeModelConfig(payload.copa, DEFAULT_COPA_MODEL_CONFIG);
    const resonancePayload =
      payload.resonance && typeof payload.resonance === "object"
        ? (payload.resonance as Record<string, unknown>)
        : {};

    return {
      copa,
      resonance: {
        enabled: resonancePayload.enabled === true,
        config: normalizeModelConfig(resonancePayload.config, copa),
      },
      ...signalThresholds,
    };
  }

  const legacyCopa = normalizeModelConfig(payload, DEFAULT_COPA_MODEL_CONFIG);
  return {
    copa: legacyCopa,
    resonance: {
      enabled: false,
      config: { ...legacyCopa },
    },
    ...signalThresholds,
  };
}

async function loadStoreState(): Promise<CopaStoredState> {
  const store = await storageAdapter.load(STORE_NAME, {
    defaults: {
      [SNAPSHOTS_KEY]: [],
      [CONFIG_KEY]: DEFAULT_COPA_LLM_CONFIG,
    },
    autoSave: true,
  });

  const snapshots = (await store.get<CopaSnapshot[]>(SNAPSHOTS_KEY)) ?? [];
  const config = normalizeLlmConfigState(
    (await store.get<CopaLlmConfigState | CopaModelConfig>(CONFIG_KEY)) ?? DEFAULT_COPA_LLM_CONFIG
  );

  return {
    snapshots: snapshots
      .map((snapshot) => normalizeSnapshot(snapshot))
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    config,
  };
}

async function saveStoreState(state: CopaStoredState): Promise<void> {
  const store = await storageAdapter.load(STORE_NAME, { autoSave: true });
  await store.set(SNAPSHOTS_KEY, state.snapshots);
  await store.set(CONFIG_KEY, state.config);
  await store.save();
}

export function buildScopeKey(input: {
  type: "session" | "project" | "global";
  ref: string;
  providerScope?: string[];
}): string {
  if (input.type !== "global") {
    return `${input.type}:${input.ref}`;
  }

  const providers = [...(input.providerScope ?? [])].sort().join(",");
  return `global:${providers || "all"}`;
}

export function extractUserSignals(
  messages: ClaudeMessage[],
  options: number | { pasteLikeSignalLength?: number; discardSignalLength?: number } = {}
): ExtractedSignalResult {
  const { discardSignalLength, pasteLikeSignalLength } =
    typeof options === "number"
      ? normalizeSignalThresholds({ pasteLikeSignalLength: options })
      : normalizeSignalThresholds(options);
  const normalized: string[] = [];
  const seen = new Set<string>();
  let userMessages = 0;
  let truncatedMessages = 0;

  for (const message of messages) {
    if (message.type !== "user") {
      continue;
    }

    userMessages += 1;

    const rawText = contentToText(message.content);
    const text = normalizeSignal(rawText);
    if (!text) {
      continue;
    }

    if (text.length > discardSignalLength) {
      continue;
    }

    if (isLikelyPastedContent(rawText, text, pasteLikeSignalLength)) {
      continue;
    }

    const clipped = text.length > MAX_SIGNAL_LENGTH ? `${text.slice(0, MAX_SIGNAL_LENGTH)}...` : text;
    if (clipped !== text) {
      truncatedMessages += 1;
    }

    if (seen.has(clipped)) {
      continue;
    }

    seen.add(clipped);
    normalized.push(clipped);
  }

  return {
    messages: normalized,
    stats: {
      userMessages,
      dedupedMessages: normalized.length,
      truncatedMessages,
    },
  };
}

function inferSnapshotLanguage(value: {
  promptSummary?: string;
  markdown?: string;
  factors?: Record<string, unknown>;
}): CopaLanguage {
  const factorValues = value.factors ? Object.values(value.factors) : [];
  const signalText = [
    value.promptSummary ?? "",
    value.markdown ?? "",
    ...factorValues.flatMap((factor) => {
      if (!factor || typeof factor !== "object") {
        return [];
      }
      const payload = factor as Record<string, unknown>;
      return [
        typeof payload.title === "string" ? payload.title : "",
        typeof payload.description === "string" ? payload.description : "",
        typeof payload.user_profile_description === "string" ? payload.user_profile_description : "",
      ];
    }),
  ].join("\n");

  return containsHanCharacters(signalText) ? "zh" : "en";
}

function normalizeSnapshot(value: unknown): CopaSnapshot {
  const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const inferredLanguage = inferSnapshotLanguage({
    promptSummary: typeof payload.promptSummary === "string" ? payload.promptSummary : "",
    markdown: typeof payload.markdown === "string" ? payload.markdown : "",
    factors: payload.factors && typeof payload.factors === "object" ? (payload.factors as Record<string, unknown>) : {},
  });
  const language = normalizeCopaLanguage(
    typeof payload.language === "string" ? payload.language : inferredLanguage
  );
  const normalized = normalizeCopaResponse(
    {
      factors: payload.factors,
      prompt_summary: payload.promptSummary,
    },
    language
  );

  return {
    id: typeof payload.id === "string" && payload.id.trim().length > 0 ? payload.id : `copa-${Date.now()}`,
    createdAt:
      typeof payload.createdAt === "string" && payload.createdAt.trim().length > 0
        ? payload.createdAt
        : new Date(0).toISOString(),
    language,
    scope:
      payload.scope && typeof payload.scope === "object"
        ? {
            type:
              (payload.scope as Record<string, unknown>).type === "session" ||
              (payload.scope as Record<string, unknown>).type === "project" ||
              (payload.scope as Record<string, unknown>).type === "global"
                ? ((payload.scope as Record<string, unknown>).type as CopaSnapshot["scope"]["type"])
                : "global",
            ref:
              typeof (payload.scope as Record<string, unknown>).ref === "string"
                ? ((payload.scope as Record<string, unknown>).ref as string)
                : "global",
            label:
              typeof (payload.scope as Record<string, unknown>).label === "string"
                ? ((payload.scope as Record<string, unknown>).label as string)
                : "Global",
            key:
              typeof (payload.scope as Record<string, unknown>).key === "string"
                ? ((payload.scope as Record<string, unknown>).key as string)
                : "global:all",
          }
        : {
            type: "global",
            ref: "global",
            label: "Global",
            key: "global:all",
          },
    providerScope: Array.isArray(payload.providerScope)
      ? payload.providerScope.filter((item): item is string => typeof item === "string")
      : [],
    sourceStats:
      payload.sourceStats && typeof payload.sourceStats === "object"
        ? {
            projectCount:
              typeof (payload.sourceStats as Record<string, unknown>).projectCount === "number"
                ? ((payload.sourceStats as Record<string, unknown>).projectCount as number)
                : 0,
            sessionCount:
              typeof (payload.sourceStats as Record<string, unknown>).sessionCount === "number"
                ? ((payload.sourceStats as Record<string, unknown>).sessionCount as number)
                : 0,
            rawUserMessages:
              typeof (payload.sourceStats as Record<string, unknown>).rawUserMessages === "number"
                ? ((payload.sourceStats as Record<string, unknown>).rawUserMessages as number)
                : 0,
            dedupedUserMessages:
              typeof (payload.sourceStats as Record<string, unknown>).dedupedUserMessages === "number"
                ? ((payload.sourceStats as Record<string, unknown>).dedupedUserMessages as number)
                : 0,
            truncatedMessages:
              typeof (payload.sourceStats as Record<string, unknown>).truncatedMessages === "number"
                ? ((payload.sourceStats as Record<string, unknown>).truncatedMessages as number)
                : 0,
          }
        : {
            projectCount: 0,
            sessionCount: 0,
            rawUserMessages: 0,
            dedupedUserMessages: 0,
            truncatedMessages: 0,
          },
    modelConfig:
      payload.modelConfig && typeof payload.modelConfig === "object"
        ? {
            baseUrl:
              typeof (payload.modelConfig as Record<string, unknown>).baseUrl === "string"
                ? ((payload.modelConfig as Record<string, unknown>).baseUrl as string)
                : DEFAULT_COPA_MODEL_CONFIG.baseUrl,
            model:
              typeof (payload.modelConfig as Record<string, unknown>).model === "string"
                ? ((payload.modelConfig as Record<string, unknown>).model as string)
                : DEFAULT_COPA_MODEL_CONFIG.model,
            temperature:
              typeof (payload.modelConfig as Record<string, unknown>).temperature === "number"
                ? ((payload.modelConfig as Record<string, unknown>).temperature as number)
                : DEFAULT_COPA_MODEL_CONFIG.temperature,
          }
        : {
            baseUrl: DEFAULT_COPA_MODEL_CONFIG.baseUrl,
            model: DEFAULT_COPA_MODEL_CONFIG.model,
            temperature: DEFAULT_COPA_MODEL_CONFIG.temperature,
          },
    promptSummary: normalized.promptSummary,
    factors: normalized.factors,
    markdown:
      typeof payload.markdown === "string" && payload.markdown.trim().length > 0
        ? payload.markdown
        : renderCopaMarkdown({
            id:
              typeof payload.id === "string" && payload.id.trim().length > 0
                ? payload.id
                : `copa-${Date.now()}`,
            createdAt:
              typeof payload.createdAt === "string" && payload.createdAt.trim().length > 0
                ? payload.createdAt
                : new Date(0).toISOString(),
            language,
            scope:
              payload.scope && typeof payload.scope === "object"
                ? {
                    type:
                      (payload.scope as Record<string, unknown>).type === "session" ||
                      (payload.scope as Record<string, unknown>).type === "project" ||
                      (payload.scope as Record<string, unknown>).type === "global"
                        ? ((payload.scope as Record<string, unknown>).type as CopaSnapshot["scope"]["type"])
                        : "global",
                    ref:
                      typeof (payload.scope as Record<string, unknown>).ref === "string"
                        ? ((payload.scope as Record<string, unknown>).ref as string)
                        : "global",
                    label:
                      typeof (payload.scope as Record<string, unknown>).label === "string"
                        ? ((payload.scope as Record<string, unknown>).label as string)
                        : "Global",
                    key:
                      typeof (payload.scope as Record<string, unknown>).key === "string"
                        ? ((payload.scope as Record<string, unknown>).key as string)
                        : "global:all",
                  }
                : {
                    type: "global",
                    ref: "global",
                    label: "Global",
                    key: "global:all",
                  },
            providerScope: Array.isArray(payload.providerScope)
              ? payload.providerScope.filter((item): item is string => typeof item === "string")
              : [],
            sourceStats:
              payload.sourceStats && typeof payload.sourceStats === "object"
                ? {
                    projectCount:
                      typeof (payload.sourceStats as Record<string, unknown>).projectCount === "number"
                        ? ((payload.sourceStats as Record<string, unknown>).projectCount as number)
                        : 0,
                    sessionCount:
                      typeof (payload.sourceStats as Record<string, unknown>).sessionCount === "number"
                        ? ((payload.sourceStats as Record<string, unknown>).sessionCount as number)
                        : 0,
                    rawUserMessages:
                      typeof (payload.sourceStats as Record<string, unknown>).rawUserMessages === "number"
                        ? ((payload.sourceStats as Record<string, unknown>).rawUserMessages as number)
                        : 0,
                    dedupedUserMessages:
                      typeof (payload.sourceStats as Record<string, unknown>).dedupedUserMessages === "number"
                        ? ((payload.sourceStats as Record<string, unknown>).dedupedUserMessages as number)
                        : 0,
                    truncatedMessages:
                      typeof (payload.sourceStats as Record<string, unknown>).truncatedMessages === "number"
                        ? ((payload.sourceStats as Record<string, unknown>).truncatedMessages as number)
                        : 0,
                  }
                : {
                    projectCount: 0,
                    sessionCount: 0,
                    rawUserMessages: 0,
                    dedupedUserMessages: 0,
                    truncatedMessages: 0,
                  },
            modelConfig:
              payload.modelConfig && typeof payload.modelConfig === "object"
                ? {
                    baseUrl:
                      typeof (payload.modelConfig as Record<string, unknown>).baseUrl === "string"
                        ? ((payload.modelConfig as Record<string, unknown>).baseUrl as string)
                        : DEFAULT_COPA_MODEL_CONFIG.baseUrl,
                    model:
                      typeof (payload.modelConfig as Record<string, unknown>).model === "string"
                        ? ((payload.modelConfig as Record<string, unknown>).model as string)
                        : DEFAULT_COPA_MODEL_CONFIG.model,
                    temperature:
                      typeof (payload.modelConfig as Record<string, unknown>).temperature === "number"
                        ? ((payload.modelConfig as Record<string, unknown>).temperature as number)
                        : DEFAULT_COPA_MODEL_CONFIG.temperature,
                  }
                : {
                    baseUrl: DEFAULT_COPA_MODEL_CONFIG.baseUrl,
                    model: DEFAULT_COPA_MODEL_CONFIG.model,
                    temperature: DEFAULT_COPA_MODEL_CONFIG.temperature,
                  },
            promptSummary: normalized.promptSummary,
            factors: normalized.factors,
          }),
  };
}

export function normalizeCopaResponse(value: unknown, language: CopaLanguage = "en"): CopaNormalizedResponse {
  const payload =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const factorsValue = buildFactorRecord(payload.factors);

  const factors = FACTOR_ORDER.reduce((accumulator, code) => {
    accumulator[code] = normalizeFactor(
      code,
      pickFactorPayload(factorsValue, code),
      language
    );
    return accumulator;
  }, {} as CopaFactors);

  const promptSummary =
    typeof payload.prompt_summary === "string" && payload.prompt_summary.trim().length > 0
      ? payload.prompt_summary.trim()
      : buildPromptSummary(factors, language);

  return {
    factors,
    promptSummary,
  };
}

function diagnoseCopaResponse(
  value: unknown,
  normalized: CopaNormalizedResponse,
  language: CopaLanguage
): Record<string, unknown> {
  const payload =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const factorsValue = buildFactorRecord(payload.factors);

  const missingFactors: CopaFactorCode[] = [];
  const fallbackFactors: CopaFactorCode[] = [];
  const providedFactors: CopaFactorCode[] = [];

  for (const code of FACTOR_ORDER) {
    const factorPayload = pickFactorPayload(factorsValue, code);
    const fallback = buildDefaultFactor(code, language);
    const factor = normalized.factors[code];

    if (typeof factorPayload === "undefined") {
      missingFactors.push(code);
    } else {
      providedFactors.push(code);
    }

    if (
      factor.user_profile_description === fallback.user_profile_description
    ) {
      fallbackFactors.push(code);
    }
  }

  return {
    recognizedFactorKeys: Object.keys(factorsValue),
    providedFactors,
    missingFactors,
    fallbackFactors,
    usedFallbackPromptSummary:
      !(typeof payload.prompt_summary === "string" && payload.prompt_summary.trim().length > 0),
  };
}

export async function loadCopaSnapshots(): Promise<CopaSnapshot[]> {
  const state = await loadStoreState();
  return state.snapshots;
}

export async function saveCopaSnapshot(snapshot: CopaSnapshot): Promise<CopaSnapshot[]> {
  const state = await loadStoreState();
  const snapshots = [...state.snapshots, snapshot].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
  await saveStoreState({ ...state, snapshots });
  return snapshots;
}

export async function deleteCopaSnapshot(snapshotId: string): Promise<CopaSnapshot[]> {
  const state = await loadStoreState();
  const snapshots = state.snapshots.filter((snapshot) => snapshot.id !== snapshotId);
  await saveStoreState({ ...state, snapshots });
  return snapshots;
}

export function resolveCopaModelConfig(config: CopaLlmConfigState): CopaModelConfig {
  return normalizeModelConfig(config.copa, DEFAULT_COPA_MODEL_CONFIG);
}

export function resolveResonanceModelConfig(config: CopaLlmConfigState): CopaModelConfig {
  return config.resonance.enabled
    ? normalizeModelConfig(config.resonance.config, resolveCopaModelConfig(config))
    : resolveCopaModelConfig(config);
}

export async function loadCopaConfig(): Promise<CopaLlmConfigState> {
  const state = await loadStoreState();
  return state.config;
}

export async function saveCopaConfig(config: CopaLlmConfigState): Promise<CopaLlmConfigState> {
  const state = await loadStoreState();
  const nextConfig = normalizeLlmConfigState(config);
  await saveStoreState({ ...state, config: nextConfig });
  return nextConfig;
}

export function renderCopaMarkdown(snapshot: Omit<CopaSnapshot, "markdown">): string {
  const labels = MARKDOWN_LABELS[snapshot.language];
  const sections = [
    labels.profileTitle,
    "",
    `${labels.generated}: ${snapshot.createdAt}`,
    `${labels.scope}: ${snapshot.scope.label}`,
    "",
  ];

  for (const code of FACTOR_ORDER) {
    const factor = snapshot.factors[code];
    sections.push(`### ${factor.title}`);
    sections.push(`- ${labels.definition}: ${factor.description}`);
    sections.push(`- ${labels.userProfile}: ${factor.user_profile_description}`);
    sections.push("");
  }

  sections.push(labels.promptSummary);
  sections.push(snapshot.promptSummary);
  sections.push("");
  sections.push(labels.metadata);
  sections.push(`- ${labels.providers}: ${snapshot.providerScope.join(", ") || "none"}`);
  sections.push(`- ${labels.projects}: ${snapshot.sourceStats.projectCount}`);
  sections.push(`- ${labels.sessions}: ${snapshot.sourceStats.sessionCount}`);
  sections.push(`- ${labels.rawUserMessages}: ${snapshot.sourceStats.rawUserMessages}`);
  sections.push(`- ${labels.dedupedUserMessages}: ${snapshot.sourceStats.dedupedUserMessages}`);
  sections.push(`- ${labels.truncatedMessages}: ${snapshot.sourceStats.truncatedMessages}`);
  sections.push(`- ${labels.model}: ${snapshot.modelConfig.model}`);
  sections.push(`- ${labels.baseUrl}: ${snapshot.modelConfig.baseUrl}`);

  return sections.join("\n").trim();
}

export function createSnapshot(input: Omit<CopaSnapshot, "id" | "createdAt" | "markdown">): CopaSnapshot {
  const createdAt = new Date().toISOString();
  const snapshot: Omit<CopaSnapshot, "markdown"> = {
    ...input,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `copa-${Date.now()}`,
    createdAt,
  };

  return {
    ...snapshot,
    markdown: renderCopaMarkdown(snapshot),
  };
}

export function buildCopaPrompt(
  signals: string[],
  language: CopaLanguage = "en"
): { system: string; user: string } {
  const factorDescriptions = FACTOR_ORDER.map((code) => {
    const spec = FACTOR_SPECS[language][code];
    return `- ${factorPromptLabel(code, language)} - ${spec.description}`;
  }).join("\n");

  if (language === "zh") {
    return {
      system: [
        "你正在基于仅包含用户消息的互动历史生成 CoPA profile。",
        "请推断稳定的回答偏好，而不是暂时性话题，请你从心理学高维的角度去描述。",
        "只返回严格 JSON，顶层键仅允许为：factors、prompt_summary。",
        "每个 factor 都必须包含 user_profile_description。",
        "user_profile_description 应该是一个高维的、与具体任务无关的、深挖用户内在稳定倾向的描述。",
        "请优先描述用户长期稳定的认知风格、判断方式、控制需求、信息处理偏好、动机结构与情绪互动方式。",
        "不要泛泛复述消息表层主题，不要只总结“用户在做什么”，而要总结“用户是如何思考、判断、感受与推进事情的”。",
        "所有返回内容必须使用中文。",
        "CoPA 因子：",
        factorDescriptions,
      ].join("\n"),
      user: [
        "请仅基于这些用户消息生成 CoPA profile。",
        "请确保 factors、prompt_summary、各项文案都使用中文。",
        "消息：",
        ...signals.map((signal) => `- ${signal}`),
      ].join("\n"),
    };
  }

  return {
    system: [
      "You are generating a CoPA profile from user-only interaction history.",
      "Infer stable answering preferences rather than temporary topics, and describe them from a high-level psychological perspective.",
      "Return strict JSON only with top-level keys: factors, prompt_summary.",
      "Each factor must contain user_profile_description.",
      "user_profile_description should be a high-level, task-independent description that deeply captures the user's stable inner tendencies.",
      "Prioritize the user's long-term cognitive style, judgment patterns, control needs, information-processing preferences, motivational structure, and emotional interaction style.",
      "Do not merely restate surface topics from the messages; do not only summarize what the user is doing, but how the user tends to think, judge, feel, and move things forward.",
      "All returned content must be written in English.",
      "CoPA factors:",
      factorDescriptions,
    ].join("\n"),
    user: [
      "Generate a CoPA profile from these user messages only.",
      "Ensure factors, prompt_summary, and all descriptive text are written in English.",
      "Messages:",
      ...signals.map((signal) => `- ${signal}`),
    ].join("\n"),
  };
}

export async function requestCopaProfile(
  signals: string[],
  config: CopaModelConfig,
  language: CopaLanguage = "en"
): Promise<CopaNormalizedResponse> {
  if (!config.apiKey?.trim()) {
    throw new Error("Missing API key");
  }
  if (!config.model.trim()) {
    throw new Error("Missing model name");
  }
  if (signals.length === 0) {
    throw new Error("No user signals available");
  }

  const prompt = buildCopaPrompt(signals, language);
  await persistLlmDebugLog({
    category: "copa",
    stage: "request",
    payload: {
      baseUrl: config.baseUrl,
      model: config.model,
      language,
      responseFormat: COPA_RESPONSE_FORMAT.type,
      signalCount: signals.length,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
    },
  });
  let response: Response | null = null;
  for (const responseFormat of [COPA_RESPONSE_FORMAT, COPA_JSON_OBJECT_RESPONSE_FORMAT]) {
    try {
      response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature ?? 0.2,
          response_format: responseFormat,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        }),
      });
    } catch (error) {
      await persistLlmDebugLog({
        category: "copa",
        stage: "network_error",
        level: "warn",
        payload: {
          error: error instanceof Error ? error.message : String(error),
          responseFormat: responseFormat.type,
        },
      });
      throw error;
    }

    await persistLlmDebugLog({
      category: "copa",
      stage: "fetch_resolved",
      payload: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        responseFormat: responseFormat.type,
      },
    });

    if (response.ok) {
      break;
    }

    const detail = await response.text();
    if (
      responseFormat.type === "json_schema" &&
      shouldFallbackToJsonObject(response.status, detail)
    ) {
      await persistLlmDebugLog({
        category: "copa",
        stage: "schema_fallback",
        level: "warn",
        payload: {
          from: "json_schema",
          to: "json_object",
          status: response.status,
          statusText: response.statusText,
          detail,
        },
      });
      response = null;
      continue;
    }

    await persistLlmDebugLog({
      category: "copa",
      stage: "http_error",
      level: "warn",
      payload: {
        status: response.status,
        statusText: response.statusText,
        detail,
        responseFormat: responseFormat.type,
      },
    });
    throw new Error(detail || `CoPA generation failed (${response.status})`);
  }

  if (!response) {
    throw new Error("CoPA generation failed before receiving a response.");
  }

  let payload: {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }> } }>;
  };
  try {
    payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }> } }>;
    };
  } catch (error) {
    await persistLlmDebugLog({
      category: "copa",
      stage: "response_json_error",
      level: "warn",
      payload: {
        status: response.status,
        statusText: response.statusText,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
  const content = payload.choices?.[0]?.message?.content;

  const rawContent = Array.isArray(content)
    ? content
        .map((item) => (typeof item?.text === "string" ? item.text : ""))
        .join("\n")
    : typeof content === "string"
      ? content
      : "";
  await persistLlmDebugLog({
    category: "copa",
    stage: "response",
    payload: { rawContent },
  });

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(stripFence(rawContent));
  } catch (error) {
    await persistLlmDebugLog({
      category: "copa",
      stage: "parse_error",
      level: "warn",
      payload: {
        rawContent,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw new Error(COPA_INVALID_JSON_ERROR);
  }

  const normalized = normalizeCopaResponse(parsed, language);
  await persistLlmDebugLog({
    category: "copa",
    stage: "diagnosis",
    payload: diagnoseCopaResponse(parsed, normalized, language),
  });

  return normalized;
}
