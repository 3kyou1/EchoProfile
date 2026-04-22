import { storageAdapter } from "@/services/storage";
import type { ClaudeMessage } from "@/types";
import type {
  CopaFactor,
  CopaFactorCode,
  CopaFactors,
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
const MIN_SIGNAL_LENGTH = 4;

const FACTOR_ORDER: CopaFactorCode[] = ["CT", "SA", "SC", "CLM", "MS", "AMR"];

const FACTOR_SPECS: Record<
  CopaFactorCode,
  { title: string; description: string; fallbackSummary: string; fallbackStrategy: string[] }
> = {
  CT: {
    title: "Cognitive Trust (CT)",
    description:
      "How strongly the user expects evidence, source quality, rigor, and trustworthy reasoning.",
    fallbackSummary: "The user shows no strong new trust signal yet.",
    fallbackStrategy: [
      "State assumptions clearly before making strong claims.",
      "Add concrete evidence when the answer could be contested.",
    ],
  },
  SA: {
    title: "Situational Anchoring (SA)",
    description:
      "How tightly the answer should stay anchored to the user's task, constraints, and real situation.",
    fallbackSummary: "The user shows no strong new situational anchoring signal yet.",
    fallbackStrategy: [
      "Keep the answer tied to the user's current task.",
      "Call out practical constraints before expanding scope.",
    ],
  },
  SC: {
    title: "Schema Consistency (SC)",
    description:
      "How much the answer should align with the user's vocabulary, mental model, and existing framework.",
    fallbackSummary: "The user shows no strong new schema consistency signal yet.",
    fallbackStrategy: [
      "Reuse the user's terminology where possible.",
      "Bridge new concepts from the user's existing frame of reference.",
    ],
  },
  CLM: {
    title: "Cognitive Load Management (CLM)",
    description:
      "How much complexity, density, and number of steps the user can comfortably absorb at once.",
    fallbackSummary: "The user shows no strong new cognitive load signal yet.",
    fallbackStrategy: [
      "Prefer manageable step sizes over dense explanations.",
      "Chunk long answers into short sections.",
    ],
  },
  MS: {
    title: "Metacognitive Scaffolding (MS)",
    description:
      "How much the answer should help the user reason, self-check, debug, and structure decisions.",
    fallbackSummary: "The user shows no strong new metacognitive scaffolding signal yet.",
    fallbackStrategy: [
      "Provide a decision or debugging frame when useful.",
      "Expose the order of reasoning steps instead of only the final answer.",
    ],
  },
  AMR: {
    title: "Affective and Motivational Resonance (AMR)",
    description:
      "How much tone, encouragement, and support style should match the user's motivation and emotional state.",
    fallbackSummary: "The user shows no strong new motivational tone signal yet.",
    fallbackStrategy: [
      "Match the user's tone without becoming flat or overly dramatic.",
      "Use encouragement when the user seems blocked or uncertain.",
    ],
  },
};

export const DEFAULT_COPA_MODEL_CONFIG: CopaModelConfig = {
  baseUrl: "http://35.220.164.252:3888/v1",
  model: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
  apiKey: "sk-bJGY1sslj60pLLE3Mx8FFAUUCmJKEFsVBvoZ3oAE1DUpLFa6",
  temperature: 0.2,
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

function buildDefaultFactor(code: CopaFactorCode): CopaFactor {
  const spec = FACTOR_SPECS[code];
  return {
    code,
    title: spec.title,
    description: spec.description,
    user_profile_description: spec.fallbackSummary,
    response_strategy: [...spec.fallbackStrategy],
  };
}

function normalizeFactor(code: CopaFactorCode, value: unknown): CopaFactor {
  const fallback = buildDefaultFactor(code);

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const payload = value as {
    user_profile_description?: unknown;
    response_strategy?: unknown;
  };

  const responseStrategy = Array.isArray(payload.response_strategy)
    ? payload.response_strategy
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    ...fallback,
    user_profile_description:
      typeof payload.user_profile_description === "string" &&
      payload.user_profile_description.trim().length > 0
        ? payload.user_profile_description.trim()
        : fallback.user_profile_description,
    response_strategy:
      responseStrategy.length > 0 ? responseStrategy : fallback.response_strategy,
  };
}

function buildPromptSummary(factors: CopaFactors): string {
  const parts = ["SA", "CLM", "SC", "MS", "CT", "AMR"].map((code) => {
    const factor = factors[code as keyof CopaFactors];
    return factor.response_strategy[0]?.replace(/[.;]+$/g, "").trim();
  });

  const compact = parts.filter(Boolean).join("; ");
  return compact || "Adapt to the user's task, pace, framework, and trust needs.";
}

async function loadStoreState(): Promise<CopaStoredState> {
  const store = await storageAdapter.load(STORE_NAME, {
    defaults: {
      [SNAPSHOTS_KEY]: [],
      [CONFIG_KEY]: DEFAULT_COPA_MODEL_CONFIG,
    },
    autoSave: true,
  });

  const snapshots = (await store.get<CopaSnapshot[]>(SNAPSHOTS_KEY)) ?? [];
  const config = (await store.get<CopaModelConfig>(CONFIG_KEY)) ?? DEFAULT_COPA_MODEL_CONFIG;

  return {
    snapshots: snapshots
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    config: {
      ...DEFAULT_COPA_MODEL_CONFIG,
      ...config,
    },
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

export function extractUserSignals(messages: ClaudeMessage[]): ExtractedSignalResult {
  const normalized: string[] = [];
  const seen = new Set<string>();
  let userMessages = 0;
  let truncatedMessages = 0;

  for (const message of messages) {
    if (message.type !== "user") {
      continue;
    }

    userMessages += 1;

    const text = normalizeSignal(contentToText(message.content));
    if (!text || text.length < MIN_SIGNAL_LENGTH) {
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

export function normalizeCopaResponse(value: unknown): CopaNormalizedResponse {
  const payload =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const factorsValue =
    payload.factors && typeof payload.factors === "object"
      ? (payload.factors as Record<string, unknown>)
      : {};

  const factors = FACTOR_ORDER.reduce((accumulator, code) => {
    accumulator[code] = normalizeFactor(code, factorsValue[code]);
    return accumulator;
  }, {} as CopaFactors);

  const promptSummary =
    typeof payload.prompt_summary === "string" && payload.prompt_summary.trim().length > 0
      ? payload.prompt_summary.trim()
      : buildPromptSummary(factors);

  return {
    factors,
    promptSummary,
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

export async function loadCopaConfig(): Promise<CopaModelConfig> {
  const state = await loadStoreState();
  return state.config;
}

export async function saveCopaConfig(config: CopaModelConfig): Promise<CopaModelConfig> {
  const state = await loadStoreState();
  const nextConfig = {
    ...DEFAULT_COPA_MODEL_CONFIG,
    ...config,
  };
  await saveStoreState({ ...state, config: nextConfig });
  return nextConfig;
}

export function renderCopaMarkdown(snapshot: Omit<CopaSnapshot, "markdown">): string {
  const sections = [
    "## CoPA Profile",
    "",
    `Generated: ${snapshot.createdAt}`,
    `Scope: ${snapshot.scope.label}`,
    "",
  ];

  for (const code of FACTOR_ORDER) {
    const factor = snapshot.factors[code];
    sections.push(`### ${factor.title}`);
    sections.push(`- Definition: ${factor.description}`);
    sections.push(`- User profile: ${factor.user_profile_description}`);
    sections.push("- Response strategy:");
    for (const item of factor.response_strategy) {
      sections.push(`  - ${item}`);
    }
    sections.push("");
  }

  sections.push("## Prompt Summary");
  sections.push(snapshot.promptSummary);
  sections.push("");
  sections.push("## Metadata");
  sections.push(`- Providers: ${snapshot.providerScope.join(", ") || "none"}`);
  sections.push(`- Projects: ${snapshot.sourceStats.projectCount}`);
  sections.push(`- Sessions: ${snapshot.sourceStats.sessionCount}`);
  sections.push(`- Raw user messages: ${snapshot.sourceStats.rawUserMessages}`);
  sections.push(`- Deduped user messages: ${snapshot.sourceStats.dedupedUserMessages}`);
  sections.push(`- Truncated messages: ${snapshot.sourceStats.truncatedMessages}`);
  sections.push(`- Model: ${snapshot.modelConfig.model}`);
  sections.push(`- Base URL: ${snapshot.modelConfig.baseUrl}`);

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

export function buildCopaPrompt(signals: string[]): { system: string; user: string } {
  const factorDescriptions = FACTOR_ORDER.map((code) => {
    const spec = FACTOR_SPECS[code];
    return `- ${code}: ${spec.title} - ${spec.description}`;
  }).join("\n");

  return {
    system: [
      "You are generating a CoPA profile from user-only interaction history.",
      "Infer stable answering preferences, not temporary topics.",
      "Return strict JSON only with top-level keys: factors, prompt_summary.",
      "Each factor must contain user_profile_description and response_strategy.",
      "Keep response_strategy short, practical, and generation-oriented.",
      "CoPA factors:",
      factorDescriptions,
    ].join("\n"),
    user: [
      "Generate a CoPA profile from these user messages only.",
      "Do not mention assistant behavior or tool output.",
      "Messages:",
      ...signals.map((signal) => `- ${signal}`),
    ].join("\n"),
  };
}

export async function requestCopaProfile(
  signals: string[],
  config: CopaModelConfig
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

  const prompt = buildCopaPrompt(signals);
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `CoPA generation failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }> } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  const rawContent = Array.isArray(content)
    ? content
        .map((item) => (typeof item?.text === "string" ? item.text : ""))
        .join("\n")
    : typeof content === "string"
      ? content
      : "";

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(stripFence(rawContent));
  } catch {
    parsed = {};
  }

  return normalizeCopaResponse(parsed);
}
