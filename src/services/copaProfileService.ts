import { storageAdapter } from "@/services/storage";
import { persistLlmDebugLog } from "@/services/llmDebugLogger";
import {
  getLlmProxyResponseText,
  getLlmRuntimeConfig,
  requestLlmChatCompletion,
  saveLlmConfig,
  type LlmRuntimeConfig,
  type LlmProxyResponse,
} from "@/services/llmProxyService";
import type { ClaudeMessage } from "@/types";
import type {
  CopaFactor,
  CopaFactorCode,
  CopaFactors,
  CopaLanguage,
  CopaLlmConfigState,
  CopaModelConfig,
  CopaNormalizedResponse,
  CopaProfileMode,
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
const DEFAULT_PROMPT_SAMPLING_STRATEGY = "recent";

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

const COPA_FUN_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "copa_fun_profile",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        profile_text: { type: "string" },
      },
      required: ["title", "profile_text"],
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
  baseUrl: "",
  model: "",
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

function repairMissingJsonClosers(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  const closers: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of trimmed) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      closers.push("}");
      continue;
    }

    if (char === "[") {
      closers.push("]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (closers.pop() !== char) {
        return null;
      }
    }
  }

  if (inString || escaped || closers.length === 0) {
    return null;
  }

  return `${trimmed}${closers.reverse().join("")}`;
}

function parseCopaJsonContent(rawContent: string): unknown {
  const content = stripFence(rawContent);

  try {
    return JSON.parse(content);
  } catch (error) {
    const repaired = repairMissingJsonClosers(content);
    if (!repaired) {
      throw error;
    }

    return JSON.parse(repaired);
  }
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

interface SignalEntry {
  text: string;
  projectKey: string;
  index: number;
}

interface SignalExtractionOptions {
  pasteLikeSignalLength?: number;
  discardSignalLength?: number;
}

interface PromptSignalSelectionOptions extends SignalExtractionOptions {
  maxSignals?: number;
  strategy?: "recent" | "balanced";
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

function getSignalProjectKey(message: ClaudeMessage): string {
  return [
    message.provider ?? "unknown-provider",
    message.projectName ?? message.sessionId ?? "unknown-project",
  ].join(":");
}

function pickEvenly<T>(items: T[], count: number): T[] {
  if (count <= 0) {
    return [];
  }
  if (items.length <= count) {
    return items;
  }
  if (count === 1) {
    const middleItem = items[Math.floor((items.length - 1) / 2)];
    return middleItem === undefined ? [] : [middleItem];
  }

  const picked: T[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const itemIndex = Math.round((index * (items.length - 1)) / (count - 1));
    if (seen.has(itemIndex)) {
      continue;
    }
    seen.add(itemIndex);
    const item = items[itemIndex];
    if (item !== undefined) {
      picked.push(item);
    }
  }

  return picked;
}

function selectBalancedSignalEntries(entries: SignalEntry[], maxSignals: number): SignalEntry[] {
  if (entries.length <= maxSignals) {
    return entries;
  }

  const selected = new Map<number, SignalEntry>();
  const addEntry = (entry: SignalEntry) => {
    if (selected.size < maxSignals) {
      selected.set(entry.index, entry);
    }
  };

  const projectGroups = new Map<string, SignalEntry[]>();
  for (const entry of entries) {
    const group = projectGroups.get(entry.projectKey) ?? [];
    group.push(entry);
    projectGroups.set(entry.projectKey, group);
  }

  const recentBudget = Math.max(1, Math.floor(maxSignals * 0.3));
  const projectBudget = Math.min(projectGroups.size, Math.max(1, Math.ceil(maxSignals * 0.2)));
  const timelineBudget = Math.max(1, maxSignals - recentBudget - projectBudget);

  for (const entry of pickEvenly(entries, timelineBudget)) {
    addEntry(entry);
  }

  for (const entry of entries.slice(-recentBudget)) {
    addEntry(entry);
  }

  const projectRepresentatives = [...projectGroups.values()]
    .flatMap((group) => {
      const representative = group[group.length - 1];
      return representative === undefined ? [] : [representative];
    })
    .sort((left, right) => right.index - left.index);
  for (const entry of projectRepresentatives.slice(0, projectBudget)) {
    addEntry(entry);
  }

  for (let index = entries.length - 1; selected.size < maxSignals && index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry !== undefined) {
      addEntry(entry);
    }
  }

  return [...selected.values()].sort((left, right) => left.index - right.index);
}

function containsHanCharacters(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

export function normalizeCopaLanguage(language?: string | null): CopaLanguage {
  return typeof language === "string" && language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function normalizeCopaProfileMode(value: unknown): CopaProfileMode {
  return value === "fun" ? "fun" : "serious";
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

function extractFirstProfileSentence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^.+?[。！？.!?](?=\s|$|[\u4e00-\u9fff])/u);
  return (match?.[0] ?? normalized).trim();
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
  const temperature =
    typeof payload.temperature === "number" ? payload.temperature : fallback.temperature;
  const hasApiKey =
    typeof payload.hasApiKey === "boolean"
      ? payload.hasApiKey
      : typeof fallback.hasApiKey === "boolean"
        ? fallback.hasApiKey
        : undefined;

  return {
    baseUrl,
    model,
    temperature,
    ...(hasApiKey === undefined ? {} : { hasApiKey }),
  };
}

function normalizeLlmConfigState(value: unknown): CopaLlmConfigState {
  const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const signalThresholds = normalizeSignalThresholds({
    discardSignalLength: payload.discardSignalLength,
    pasteLikeSignalLength: payload.pasteLikeSignalLength,
  });

  if ("copa" in payload) {
    const resonancePayload =
      payload.resonance && typeof payload.resonance === "object"
        ? (payload.resonance as Record<string, unknown>)
        : {};

    return {
      copa: { ...DEFAULT_COPA_MODEL_CONFIG },
      resonance: {
        enabled: resonancePayload.enabled === true,
        config: { ...DEFAULT_COPA_MODEL_CONFIG },
      },
      ...signalThresholds,
    };
  }

  return {
    copa: { ...DEFAULT_COPA_MODEL_CONFIG },
    resonance: {
      enabled: false,
      config: { ...DEFAULT_COPA_MODEL_CONFIG },
    },
    ...signalThresholds,
  };
}

function applyRuntimeModelDefaults(config: CopaModelConfig, runtime?: LlmRuntimeConfig["copa"]): CopaModelConfig {
  if (!runtime) {
    return config;
  }

  return {
    ...config,
    baseUrl:
      config.baseUrl === DEFAULT_COPA_MODEL_CONFIG.baseUrl && runtime.baseUrl
        ? runtime.baseUrl
        : config.baseUrl,
    model: config.model.trim().length > 0 ? config.model : runtime.model,
    temperature:
      typeof config.temperature === "number" ? config.temperature : runtime.temperature,
    hasApiKey: runtime.hasApiKey,
  };
}

function applyRuntimeConfigDefaults(config: CopaLlmConfigState, runtime: LlmRuntimeConfig): CopaLlmConfigState {
  const copa = applyRuntimeModelDefaults(config.copa, runtime.copa);
  return {
    ...config,
    copa,
    resonance: {
      ...config.resonance,
      config: applyRuntimeModelDefaults(config.resonance.config, runtime.resonance),
    },
  };
}

function frontendStoredConfig(config: CopaLlmConfigState): Record<string, unknown> {
  const signalThresholds = normalizeSignalThresholds({
    discardSignalLength: config.discardSignalLength,
    pasteLikeSignalLength: config.pasteLikeSignalLength,
  });

  return {
    ...signalThresholds,
    resonance: {
      enabled: config.resonance.enabled === true,
    },
  };
}

function hasLegacyLlmFields(value: unknown): value is Record<string, unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    (typeof (value as Record<string, unknown>).baseUrl === "string" ||
      typeof (value as Record<string, unknown>).model === "string" ||
      typeof (value as Record<string, unknown>).apiKey === "string" ||
      typeof (value as Record<string, unknown>).temperature === "number")
  );
}

async function migrateLegacyLlmConfig(rawConfig: unknown): Promise<void> {
  const payload = rawConfig && typeof rawConfig === "object" ? (rawConfig as Record<string, unknown>) : {};
  const candidates: Array<{ purpose: "copa" | "resonance"; value: unknown }> = [];

  if (hasLegacyLlmFields(payload)) {
    candidates.push({ purpose: "copa", value: payload });
  }
  if ("copa" in payload) {
    candidates.push({ purpose: "copa", value: payload.copa });
  }
  if (payload.resonance && typeof payload.resonance === "object") {
    const resonance = payload.resonance as Record<string, unknown>;
    candidates.push({ purpose: "resonance", value: resonance.config });
  }

  for (const candidate of candidates) {
    if (!hasLegacyLlmFields(candidate.value)) {
      continue;
    }
    const baseUrl = typeof candidate.value.baseUrl === "string" ? candidate.value.baseUrl.trim() : "";
    const model = typeof candidate.value.model === "string" ? candidate.value.model.trim() : "";
    if (!baseUrl || !model) {
      continue;
    }

    await saveLlmConfig({
      purpose: candidate.purpose,
      baseUrl,
      model,
      temperature:
        typeof candidate.value.temperature === "number" ? candidate.value.temperature : undefined,
      apiKey: typeof candidate.value.apiKey === "string" ? candidate.value.apiKey : undefined,
    });
  }
}

async function loadStoreState(): Promise<CopaStoredState> {
  const store = await storageAdapter.load(STORE_NAME, {
    defaults: {
      [SNAPSHOTS_KEY]: [],
      [CONFIG_KEY]: frontendStoredConfig(DEFAULT_COPA_LLM_CONFIG),
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
  await store.set(SNAPSHOTS_KEY, state.snapshots.map((snapshot) => normalizeSnapshot(snapshot)));
  await store.set(CONFIG_KEY, frontendStoredConfig(state.config));
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

function collectUserSignalEntries(
  messages: ClaudeMessage[],
  options: number | SignalExtractionOptions = {}
): { entries: SignalEntry[]; stats: ExtractedSignalResult["stats"] } {
  const { discardSignalLength, pasteLikeSignalLength } =
    typeof options === "number"
      ? normalizeSignalThresholds({ pasteLikeSignalLength: options })
      : normalizeSignalThresholds(options);
  const entries: SignalEntry[] = [];
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
    entries.push({
      text: clipped,
      projectKey: getSignalProjectKey(message),
      index: entries.length,
    });
  }

  return {
    entries,
    stats: {
      userMessages,
      dedupedMessages: entries.length,
      truncatedMessages,
    },
  };
}

export function extractUserSignals(
  messages: ClaudeMessage[],
  options: number | SignalExtractionOptions = {}
): ExtractedSignalResult {
  const extracted = collectUserSignalEntries(messages, options);

  return {
    messages: extracted.entries.map((entry) => entry.text),
    stats: extracted.stats,
  };
}

export function selectPromptSignals(
  messages: ClaudeMessage[],
  options: PromptSignalSelectionOptions = {}
): ExtractedSignalResult {
  const extracted = collectUserSignalEntries(messages, options);
  const maxSignals = options.maxSignals;
  const strategy = options.strategy ?? DEFAULT_PROMPT_SAMPLING_STRATEGY;
  const selectedEntries =
    typeof maxSignals === "number" && maxSignals > 0 && extracted.entries.length > maxSignals
      ? strategy === "balanced"
        ? selectBalancedSignalEntries(extracted.entries, maxSignals)
        : extracted.entries.slice(-maxSignals)
      : extracted.entries;

  return {
    messages: selectedEntries.map((entry) => entry.text),
    stats: extracted.stats,
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
  const profileMode = normalizeCopaProfileMode(payload.profileMode);
  const normalized = normalizeCopaResponse(
    {
      factors: payload.factors,
      prompt_summary: payload.promptSummary,
      profile_text: payload.funProfileText,
    },
    language,
    profileMode
  );
  const funProfileText =
    typeof payload.funProfileText === "string" && payload.funProfileText.trim().length > 0
      ? payload.funProfileText.trim()
      : normalized.funProfileText;
  const id = typeof payload.id === "string" && payload.id.trim().length > 0 ? payload.id : `copa-${Date.now()}`;
  const createdAt =
    typeof payload.createdAt === "string" && payload.createdAt.trim().length > 0
      ? payload.createdAt
      : new Date(0).toISOString();
  const scope =
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
          type: "global" as const,
          ref: "global",
          label: "Global",
          key: "global:all",
        };
  const providerScope = Array.isArray(payload.providerScope)
    ? payload.providerScope.filter((item): item is string => typeof item === "string")
    : [];
  const sourceStats =
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
        };
  const snapshotBase: Omit<CopaSnapshot, "markdown"> = {
    id,
    createdAt,
    language,
    profileMode,
    scope,
    providerScope,
    sourceStats,
    promptSummary: normalized.promptSummary,
    factors: normalized.factors,
    funProfileText,
  };

  return {
    ...snapshotBase,
    markdown: renderCopaMarkdown(snapshotBase),
  };
}

export function normalizeCopaResponse(
  value: unknown,
  language: CopaLanguage = "en",
  profileMode: CopaProfileMode = "serious"
): CopaNormalizedResponse {
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

  const funProfileText =
    typeof payload.profile_text === "string" && payload.profile_text.trim().length > 0
      ? payload.profile_text.trim()
      : undefined;
  const title =
    typeof payload.title === "string" && payload.title.trim().length > 0
      ? payload.title.trim()
      : undefined;
  const promptSummaryPayload =
    typeof payload.prompt_summary === "string" && payload.prompt_summary.trim().length > 0
      ? payload.prompt_summary.trim()
      : undefined;
  const promptSummary =
    profileMode === "fun" && (title || funProfileText)
      ? (title ?? promptSummaryPayload ?? extractFirstProfileSentence(funProfileText ?? "")).trim()
      : promptSummaryPayload
        ? promptSummaryPayload
        : buildPromptSummary(factors, language);

  return {
    factors,
    promptSummary,
    funProfileText,
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
  const store = await storageAdapter.load(STORE_NAME, { autoSave: true });
  const rawConfig = await store.get<unknown>(CONFIG_KEY);
  try {
    await migrateLegacyLlmConfig(rawConfig);
  } catch {
    // Migration is best-effort; missing backend configuration will surface when generating.
  }

  const state = await loadStoreState();
  await saveStoreState(state);
  try {
    const runtime = await getLlmRuntimeConfig();
    return applyRuntimeConfigDefaults(state.config, runtime);
  } catch {
    return state.config;
  }
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

  if (snapshot.profileMode === "fun" && snapshot.funProfileText) {
    sections.push(snapshot.funProfileText);
    sections.push("");
  } else {
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
  }
  sections.push(labels.metadata);
  sections.push(`- ${labels.providers}: ${snapshot.providerScope.join(", ") || "none"}`);
  sections.push(`- ${labels.projects}: ${snapshot.sourceStats.projectCount}`);
  sections.push(`- ${labels.sessions}: ${snapshot.sourceStats.sessionCount}`);
  sections.push(`- ${labels.rawUserMessages}: ${snapshot.sourceStats.rawUserMessages}`);
  sections.push(`- ${labels.dedupedUserMessages}: ${snapshot.sourceStats.dedupedUserMessages}`);
  sections.push(`- ${labels.truncatedMessages}: ${snapshot.sourceStats.truncatedMessages}`);

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
  language: CopaLanguage = "en",
  profileMode: CopaProfileMode = "serious"
): { system: string; user: string } {
  const factorDescriptions = FACTOR_ORDER.map((code) => {
    const spec = FACTOR_SPECS[language][code];
    return `- ${factorPromptLabel(code, language)} - ${spec.description}`;
  }).join("\n");

  if (language === "zh") {
    const modeInstructions =
      profileMode === "fun"
        ? [
            "你的角色不是心理测评师，也不是咨询师，而是一个很懂用户、嘴很毒但没有恶意的朋友：像脱口秀演员 + 互联网锐评博主 + 熟人局吐槽大师的混合体。",
            "请只基于用户消息里真实出现的表达习惯、反复出现的需求、做事方式、焦虑点、控制欲、审美偏好、沟通风格和思维惯性来写。允许轻微夸张、比喻、梗感、反差和角色卡风格，但不要编造用户消息中不存在的经历、身份、职业、关系或具体偏好。",
            "不要写研究报告，不要写心理测评说明书，不要用“该用户表现出……”这种学术腔。要像一个朋友看完聊天记录后忍不住锐评：“这个人一看就是……”那种感觉。",
            "写法要求：",
            "- 要好笑、贴脸、有画面感。",
            "- 可以犀利，但不能恶毒。",
            "- 可以吐槽，但底层要是善意和准确。",
            "- 多用具体比喻，不要抽象空话。",
            "- 避免安全无聊的总结句，比如“你是一个注重效率的人”。",
            "- 更像“这个人是把人生当成待优化系统的产品经理”，而不是“用户偏好结构化表达”。",
          ]
        : ["这是严肃版 profile：保持研究报告式的严谨、克制和稳定分析。"];
    return {
      system: [
        profileMode === "fun"
          ? "你正在基于仅包含用户消息的互动历史生成 profile。"
          : "你正在基于仅包含用户消息的互动历史生成 CoPA profile。",
        ...modeInstructions,
        "请推断稳定的回答偏好，而不是暂时性话题，请你从心理学高维的角度去描述。",
        ...(profileMode === "fun"
          ? [
              "只返回严格 JSON，顶层键仅允许为：title、profile_text。",
              "title 必须非空，必须是一个短、有记忆点、可展示在历史卡片上的中文短语；不要把 title 写成普通摘要句，不要留空，不要省略。",
              "profile_text 是一段完整、有趣、可直接展示的中文 profile。",
            ]
          : [
              "只返回严格 JSON，顶层键仅允许为：factors、prompt_summary。",
              "每个 factor 都必须包含 user_profile_description。",
              "user_profile_description 应该是一个高维的、与具体任务无关的、深挖用户内在稳定倾向的描述。",
              "请优先描述用户长期稳定的认知风格、判断方式、控制需求、信息处理偏好、动机结构与情绪互动方式。",
              "不要泛泛复述消息表层主题，不要只总结“用户在做什么”，而要总结“用户是如何思考、判断、感受与推进事情的”。",
            ]),
        "所有返回内容必须使用中文。",
        ...(profileMode === "fun" ? [] : ["CoPA 因子：", factorDescriptions]),
      ].join("\n"),
      user: [
        "请仅基于这些用户消息生成 CoPA profile。",
        profileMode === "fun"
          ? "请确保 title、profile_text 都使用中文。"
          : "请确保 factors、prompt_summary、各项文案都使用中文。",
        "消息：",
        ...signals.map((signal) => `- ${signal}`),
      ].join("\n"),
    };
  }

  const modeInstructions =
    profileMode === "fun"
      ? [
          "Your role is not a psychologist, therapist, or evaluator. You are a sharp but kind friend: part stand-up comic, part internet commentator, part 'I know you too well' roastmaster.",
          "Base the profile only on real signals from the user's messages: recurring phrasing, repeated needs, working style, anxieties, control patterns, taste, communication habits, and thinking loops. You may use light exaggeration, metaphors, meme-like phrasing, contrast, and character-card energy, but do not invent experiences, identities, jobs, relationships, or specific preferences that are not supported by the messages.",
          "Do not write a research report. Do not sound like a psychometric manual. Avoid phrases like 'the user demonstrates...' Make it feel like a friend read the chat history and immediately went: 'This person is absolutely the type who...'",
          "Writing requirements:",
          "- Make it funny, specific, vivid, and easy to picture.",
          "- Be sharp, but not cruel.",
          "- Roast the pattern, but keep the foundation kind and accurate.",
          "- Use concrete metaphors instead of abstract summaries.",
          "- Avoid safe, boring lines like 'you value efficiency.'",
          "- Prefer lines like 'this person treats life like a product backlog waiting to be optimized' over 'the user prefers structured expression.'",
        ]
      : ["This is a serious profile: keep the tone rigorous, restrained, and analysis-oriented."];
  return {
    system: [
      profileMode === "fun"
        ? "You are generating a profile from user-only interaction history."
        : "You are generating a CoPA profile from user-only interaction history.",
      ...modeInstructions,
      "Infer stable answering preferences rather than temporary topics, and describe them from a high-level psychological perspective.",
      ...(profileMode === "fun"
        ? [
            "Return strict JSON only with top-level keys: title, profile_text.",
            "title must be non-empty. It must be a short, memorable phrase suitable for display in the profile history card. Do not make title a generic summary sentence. Do not leave it empty or omit it.",
            "profile_text is one complete, entertaining profile paragraph ready to display.",
          ]
        : [
            "Return strict JSON only with top-level keys: factors, prompt_summary.",
            "Each factor must contain user_profile_description.",
            "user_profile_description should be a high-level, task-independent description that deeply captures the user's stable inner tendencies.",
            "Prioritize the user's long-term cognitive style, judgment patterns, control needs, information-processing preferences, motivational structure, and emotional interaction style.",
            "Do not merely restate surface topics from the messages; do not only summarize what the user is doing, but how the user tends to think, judge, feel, and move things forward.",
          ]),
      "All returned content must be written in English.",
      ...(profileMode === "fun" ? [] : ["CoPA factors:", factorDescriptions]),
    ].join("\n"),
    user: [
      "Generate a CoPA profile from these user messages only.",
      profileMode === "fun"
        ? "Ensure title and profile_text are written in English."
        : "Ensure factors, prompt_summary, and all descriptive text are written in English.",
      "Messages:",
      ...signals.map((signal) => `- ${signal}`),
    ].join("\n"),
  };
}

export async function requestCopaProfile(
  signals: string[],
  _config: CopaModelConfig,
  language: CopaLanguage = "en",
  profileMode: CopaProfileMode = "serious"
): Promise<CopaNormalizedResponse> {
  if (signals.length === 0) {
    throw new Error("No user signals available");
  }

  const prompt = buildCopaPrompt(signals, language, profileMode);
  await persistLlmDebugLog({
    category: "copa",
    stage: "request",
    payload: {
      language,
      profileMode,
      responseFormat: COPA_RESPONSE_FORMAT.type,
      signalCount: signals.length,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
    },
  });
  let response: LlmProxyResponse | null = null;
  const primaryResponseFormat = profileMode === "fun" ? COPA_FUN_RESPONSE_FORMAT : COPA_RESPONSE_FORMAT;
  for (const responseFormat of [primaryResponseFormat, COPA_JSON_OBJECT_RESPONSE_FORMAT]) {
    try {
      response = await requestLlmChatCompletion({
        purpose: "copa",
        responseFormat,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
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
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: response.statusText,
        responseFormat: responseFormat.type,
      },
    });

    if (response.status >= 200 && response.status < 300) {
      break;
    }

    const detail = getLlmProxyResponseText(response);
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
    payload = (response.body ?? JSON.parse(response.text ?? "")) as {
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
    parsed = parseCopaJsonContent(rawContent);
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

  const normalized = normalizeCopaResponse(parsed, language, profileMode);
  await persistLlmDebugLog({
    category: "copa",
    stage: "diagnosis",
    payload: diagnoseCopaResponse(parsed, normalized, language),
  });

  return normalized;
}
