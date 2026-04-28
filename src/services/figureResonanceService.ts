import { loadFigurePool, loadFigurePools } from "@/services/figurePoolService";
import { persistLlmDebugLog } from "@/services/llmDebugLogger";
import {
  getLlmProxyResponseText,
  requestLlmChatCompletion,
  type LlmProxyResponse,
} from "@/services/llmProxyService";
import { storageAdapter } from "@/services/storage";
import type { FigurePool, FigurePoolRecord } from "@/types/figurePool";
import type { CopaModelConfig, CopaSnapshot } from "@/types/copaProfile";
import type {
  FigureConfidenceStyle,
  FigureRecord,
  FigureResonanceCard,
  FigureResonancePayload,
  FigureResonanceResult,
} from "@/types/figureResonance";

const STORE_NAME = "figure-resonance.json";
const LEGACY_STORE_NAME = "scientist-resonance.json";
const RESULTS_KEY = "results";
const RECENT_WINDOW = 12;
const RECENT_MIN_MESSAGES = 4;
const MAX_POOL_AXES = 4;

const FIGURE_RESONANCE_CARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slug: { type: "string" },
    reason: { type: "string" },
    resonance_axes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["slug", "reason", "resonance_axes"],
};

const FIGURE_RESONANCE_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "figure_resonance",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        long_term: {
          type: "object",
          additionalProperties: false,
          properties: {
            primary: FIGURE_RESONANCE_CARD_SCHEMA,
            secondary: {
              type: "array",
              items: FIGURE_RESONANCE_CARD_SCHEMA,
            },
          },
          required: ["primary", "secondary"],
        },
        recent_state: {
          anyOf: [FIGURE_RESONANCE_CARD_SCHEMA, { type: "null" }],
        },
      },
      required: ["long_term", "recent_state"],
    },
  },
};

const FIGURE_RESONANCE_JSON_OBJECT_RESPONSE_FORMAT = { type: "json_object" } as const;

interface PoolContext {
  pool: FigurePool;
  allRecordsBySlug: Map<string, FigurePoolRecord>;
  validRecords: FigurePoolRecord[];
  validRecordsBySlug: Map<string, FigurePoolRecord>;
}

function stripFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const lines = trimmed.split("\n");
  const body = lines.slice(1, lines[lines.length - 1]?.trim() === "```" ? -1 : undefined);
  return body.join("\n").trim();
}

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

function normalizeLanguage(language: string): string {
  return language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function uniqueAxes(values: unknown[]): string[] {
  const axes: string[] = [];
  for (const value of values) {
    const item = typeof value === "string" ? value.trim() : "";
    if (item && !axes.includes(item)) {
      axes.push(item);
    }
  }
  return axes;
}

function figureSignature(record: FigureRecord): Set<string> {
  const parts = `${record.core_traits} ${record.temperament_tags}`.split(/[、,，;/｜|\s]+/);
  return new Set(parts.map((part) => part.trim().toLowerCase()).filter(Boolean));
}

function candidateSimilarity(left: FigureRecord, right: FigureRecord): number {
  const leftSig = figureSignature(left);
  const rightSig = figureSignature(right);
  if (leftSig.size === 0 || rightSig.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const item of leftSig) {
    if (rightSig.has(item)) {
      shared += 1;
    }
  }

  const universe = new Set([...leftSig, ...rightSig]);
  return universe.size === 0 ? 0 : shared / universe.size;
}

function localizedThinkingStyle(record: FigureRecord, language: string): string {
  return normalizeLanguage(language) === "zh"
    ? record.thinking_style
    : record.thinking_style_en?.trim() || record.thinking_style;
}

function localizedTemperamentSummary(record: FigureRecord, language: string): string {
  return normalizeLanguage(language) === "zh"
    ? record.temperament_summary
    : record.temperament_summary_en?.trim() || record.temperament_summary;
}

function localizedCoreTraits(record: FigureRecord, language: string): string {
  return normalizeLanguage(language) === "zh"
    ? record.core_traits
    : record.core_traits_en?.trim() || record.core_traits;
}

function localizedTemperamentTags(record: FigureRecord, language: string): string {
  return normalizeLanguage(language) === "zh"
    ? record.temperament_tags
    : record.temperament_tags_en?.trim() || record.temperament_tags;
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function defaultReason(record: FigureRecord, mode: "long_term" | "recent_state", language: string): string {
  const thinkingStyle = localizedThinkingStyle(record, language);
  if (normalizeLanguage(language) === "zh") {
    const prefix = mode === "long_term" ? "你长期更像" : "你最近这段时间更像";
    return `${prefix}${record.name}式研究者：${thinkingStyle}`;
  }

  const prefix = mode === "long_term" ? "Your long-term archetype feels closest to" : "Your recent state feels closest to";
  return `${prefix} ${record.name}: ${thinkingStyle}`;
}

function scoreFigure(signalText: string, record: FigureRecord): { score: number; resonanceAxes: string[] } {
  const signal = signalText.toLowerCase();
  const fields = [record.core_traits, record.temperament_tags, record.core_traits_en ?? "", record.temperament_tags_en ?? ""];
  let score = 0;
  const matchedAxes: string[] = [];

  for (const field of fields) {
    for (const raw of field.split(/[、,，]/)) {
      const axis = raw.trim();
      if (!axis) {
        continue;
      }
      if (signal.includes(axis.toLowerCase())) {
        score += 2;
        matchedAxes.push(axis);
      } else if (
        axis.length >= 2 &&
        axis
          .split(/[/-]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .some((part) => signal.includes(part.toLowerCase()))
      ) {
        score += 1;
        matchedAxes.push(axis);
      }
    }
  }

  return { score, resonanceAxes: uniqueAxes(matchedAxes) };
}

async function loadPoolContext(poolId: string): Promise<PoolContext> {
  const pool = await loadFigurePool(poolId);
  if (!pool) {
    throw new Error(`Figure pool not found: ${poolId}`);
  }

  return buildPoolContext(pool);
}

function buildPoolContext(pool: FigurePool): PoolContext {
  const allRecordsBySlug = new Map(pool.records.map((record) => [record.slug, record]));
  const validRecords = pool.records.filter((record) => record.status === "valid");
  const validRecordsBySlug = new Map(validRecords.map((record) => [record.slug, record]));

  return {
    pool,
    allRecordsBySlug,
    validRecords,
    validRecordsBySlug,
  };
}

function heuristicCandidates(
  signalText: string,
  language: string,
  records: FigureRecord[]
): Array<{
  slug: string;
  score: number;
  reason: string;
  resonanceAxes: string[];
}> {
  return [...records]
    .map((record) => {
      const scored = scoreFigure(signalText, record);
      const fallbackTraits = localizedCoreTraits(record, language);
      return {
        slug: record.slug,
        score: scored.score,
        reason: defaultReason(record, "long_term", language),
        resonanceAxes:
          scored.resonanceAxes.length > 0
            ? scored.resonanceAxes
            : uniqueAxes(fallbackTraits.split(/[、,，]/).slice(0, 2)),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.resonanceAxes.length - left.resonanceAxes.length;
    });
}

function buildCardPayload(
  record: FigureRecord,
  options: {
    reason: string;
    resonanceAxes: unknown[];
    confidenceStyle: FigureConfidenceStyle;
    language: string;
  }
): FigureResonanceCard {
  const normalizedAxes = uniqueAxes(options.resonanceAxes).slice(0, MAX_POOL_AXES);
  const fallbackAxes = uniqueAxes([
    ...localizedCoreTraits(record, options.language).split(/[、,，]/).slice(0, 2),
    ...localizedTemperamentTags(record, options.language).split(/[、,，]/).slice(0, 1),
  ]).slice(0, MAX_POOL_AXES);

  return {
    name: record.name,
    localized_names: record.localized_names,
    wikipedia_url: record.wikipedia_url,
    wikipedia_urls: record.wikipedia_urls,
    slug: record.slug,
    portrait_url: record.portrait_url,
    hook: localizedTemperamentSummary(record, options.language),
    quote_zh: record.quote_zh,
    quote_en: record.quote_en,
    reason: options.reason.trim() || localizedThinkingStyle(record, options.language),
    resonance_axes: normalizedAxes.length > 0 ? normalizedAxes : fallbackAxes,
    confidence_style: options.confidenceStyle,
    core_traits_en: record.core_traits_en,
    thinking_style_en: record.thinking_style_en,
    temperament_tags_en: record.temperament_tags_en,
    temperament_summary_en: record.temperament_summary_en,
    loading_copy_zh: record.loading_copy_zh,
    loading_copy_en: record.loading_copy_en,
    bio_zh: record.bio_zh,
    bio_en: record.bio_en,
    achievements_zh: record.achievements_zh,
    achievements_en: record.achievements_en,
  };
}

function normalizeCardPayload(
  payload: unknown,
  options: {
    confidenceStyle: FigureConfidenceStyle;
    recordsBySlug: Map<string, FigureRecord>;
    language: string;
  }
): FigureResonanceCard | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const slug = typeof record.slug === "string" ? record.slug.trim() : "";
  const matchedRecord = options.recordsBySlug.get(slug);
  if (!matchedRecord) {
    return null;
  }

  const axes = Array.isArray(record.resonance_axes) ? record.resonance_axes : [];
  const rawReason = typeof record.reason === "string" ? record.reason.trim() : "";
  const reason =
    rawReason && !(normalizeLanguage(options.language) === "en" && containsCjk(rawReason))
      ? rawReason
      : defaultReason(matchedRecord, options.confidenceStyle === "phase_resonance" ? "recent_state" : "long_term", options.language);
  return buildCardPayload(matchedRecord, {
    reason,
    resonanceAxes: axes,
    confidenceStyle: options.confidenceStyle,
    language: options.language,
  });
}

function rehydrateStoredCard(
  card: FigureResonanceCard,
  confidenceStyle: FigureConfidenceStyle,
  context: PoolContext | null,
  language: string
): FigureResonanceCard {
  const matchedRecord = context?.allRecordsBySlug.get(card.slug);
  if (!matchedRecord || matchedRecord.status === "invalid") {
    return card;
  }

  const reason =
    normalizeLanguage(language) === "en" && containsCjk(card.reason)
      ? defaultReason(matchedRecord, confidenceStyle === "phase_resonance" ? "recent_state" : "long_term", language)
      : card.reason;

  return buildCardPayload(matchedRecord, {
    reason,
    resonanceAxes: card.resonance_axes,
    confidenceStyle,
    language,
  });
}

function rehydrateStoredResult(
  result: FigureResonanceResult,
  context: PoolContext | null
): FigureResonanceResult {
  const poolUpdatedAtSnapshot = result.pool_updated_at_snapshot || context?.pool.updatedAt || "";

  return {
    ...result,
    pool_id: result.pool_id || context?.pool.id || "",
    pool_name_snapshot: result.pool_name_snapshot || context?.pool.name || "",
    pool_updated_at_snapshot: poolUpdatedAtSnapshot,
    pool_deleted: context ? false : true,
    pool_updated: context ? poolUpdatedAtSnapshot !== context.pool.updatedAt : false,
    long_term: {
      primary: rehydrateStoredCard(result.long_term.primary, "strong_resonance", context, result.language),
      secondary: result.long_term.secondary.map((card) =>
        rehydrateStoredCard(card, "strong_resonance", context, result.language)
      ),
    },
    recent_state: result.recent_state
      ? rehydrateStoredCard(result.recent_state, "phase_resonance", context, result.language)
      : null,
  };
}

function resultSlugs(result: FigureResonanceResult): string[] {
  return [
    result.long_term.primary.slug,
    ...result.long_term.secondary.map((card) => card.slug),
    result.recent_state?.slug ?? "",
  ].filter(Boolean);
}

function contextMatchesResult(context: PoolContext, result: FigureResonanceResult): boolean {
  return resultSlugs(result).some((slug) => context.allRecordsBySlug.has(slug));
}

function normalizeLongTermPayload(
  payload: unknown,
  context: PoolContext,
  language: string
): FigureResonancePayload["long_term"] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const primaryPayload = record.primary && typeof record.primary === "object" ? record.primary : payload;
  const primary = normalizeCardPayload(primaryPayload, {
    confidenceStyle: "strong_resonance",
    recordsBySlug: context.validRecordsBySlug,
    language,
  });
  if (!primary) {
    return null;
  }

  const secondaryPayloads = Array.isArray(record.secondary) ? record.secondary : [];
  const secondary: FigureResonanceCard[] = [];
  const seen = new Set([primary.slug]);
  for (const item of secondaryPayloads) {
    const normalized = normalizeCardPayload(item, {
      confidenceStyle: "strong_resonance",
      recordsBySlug: context.validRecordsBySlug,
      language,
    });
    if (!normalized || seen.has(normalized.slug)) {
      continue;
    }
    seen.add(normalized.slug);
    secondary.push(normalized);
    if (secondary.length >= 2) {
      break;
    }
  }

  return { primary, secondary };
}

function pickSecondaryCandidates(
  primarySlug: string,
  candidates: Array<{ slug: string; resonanceAxes: string[]; reason: string }>,
  recordsBySlug: Map<string, FigureRecord>
): Array<{ slug: string; resonanceAxes: string[]; reason: string }> {
  const selected: Array<{ slug: string; resonanceAxes: string[]; reason: string }> = [];
  const skipped: Array<{ slug: string; resonanceAxes: string[]; reason: string }> = [];
  const primary = recordsBySlug.get(primarySlug);
  if (!primary) {
    return selected;
  }

  for (const candidate of candidates) {
    const matchedRecord = recordsBySlug.get(candidate.slug);
    if (!matchedRecord || matchedRecord.slug === primarySlug) {
      continue;
    }

    const tooCloseToPrimary = candidateSimilarity(primary, matchedRecord) >= 0.45;
    const tooCloseToSelected = selected.some((item) => {
      const selectedRecord = recordsBySlug.get(item.slug);
      return selectedRecord ? candidateSimilarity(selectedRecord, matchedRecord) >= 0.45 : false;
    });

    if (tooCloseToPrimary || tooCloseToSelected) {
      skipped.push(candidate);
      continue;
    }

    selected.push(candidate);
    if (selected.length >= 2) {
      return selected;
    }
  }

  for (const candidate of skipped) {
    if (selected.some((item) => item.slug === candidate.slug)) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= 2) {
      break;
    }
  }

  return selected;
}

function heuristicMatch(
  signalText: string,
  options: { mode: "long_term" | "recent_state"; language: string; context: PoolContext }
): FigureResonancePayload["long_term"] | FigureResonanceCard {
  const candidates = heuristicCandidates(signalText, options.language, options.context.validRecords);
  const chosenPayload = candidates[0];
  const chosenRecord =
    options.context.validRecordsBySlug.get(chosenPayload?.slug ?? "") ?? options.context.validRecords[0];
  if (!chosenRecord) {
    throw new Error(`Figure pool has no valid records: ${options.context.pool.name}`);
  }

  const primaryCard = buildCardPayload(chosenRecord, {
    reason: chosenPayload?.reason ?? defaultReason(chosenRecord, options.mode, options.language),
    resonanceAxes: chosenPayload?.resonanceAxes ?? [],
    confidenceStyle: options.mode === "long_term" ? "strong_resonance" : "phase_resonance",
    language: options.language,
  });

  if (options.mode !== "long_term") {
    return primaryCard;
  }

  const secondary = pickSecondaryCandidates(
    primaryCard.slug,
    candidates.slice(1),
    options.context.validRecordsBySlug
  ).flatMap((candidate) => {
    const matchedRecord = options.context.validRecordsBySlug.get(candidate.slug);
    return matchedRecord
      ? [
          buildCardPayload(matchedRecord, {
            reason: defaultReason(matchedRecord, "long_term", options.language),
            resonanceAxes: candidate.resonanceAxes,
            confidenceStyle: "strong_resonance",
            language: options.language,
          }),
        ]
      : [];
  });

  return {
    primary: primaryCard,
    secondary: secondary.slice(0, 2),
  };
}

function enrichLongTermWithSecondary(
  longTerm: FigureResonancePayload["long_term"] | null,
  signalText: string,
  language: string,
  context: PoolContext
): FigureResonancePayload["long_term"] {
  if (!longTerm) {
    return heuristicMatch(signalText, {
      mode: "long_term",
      language,
      context,
    }) as FigureResonancePayload["long_term"];
  }

  if (longTerm.secondary.length >= 2) {
    return { primary: longTerm.primary, secondary: longTerm.secondary.slice(0, 2) };
  }

  const candidates = heuristicCandidates(signalText, language, context.validRecords);
  const extra = pickSecondaryCandidates(longTerm.primary.slug, candidates, context.validRecordsBySlug)
    .flatMap((candidate) => {
      const matchedRecord = context.validRecordsBySlug.get(candidate.slug);
      if (!matchedRecord || longTerm.secondary.some((item) => item.slug === matchedRecord.slug)) {
        return [];
      }
      return [
        buildCardPayload(matchedRecord, {
          reason: defaultReason(matchedRecord, "long_term", language),
          resonanceAxes: candidate.resonanceAxes,
          confidenceStyle: "strong_resonance",
          language,
        }),
      ];
    })
    .slice(0, 2 - longTerm.secondary.length);

  return {
    primary: longTerm.primary,
    secondary: [...longTerm.secondary, ...extra].slice(0, 2),
  };
}

function collectSignalText(profileMarkdown: string, recentMessages: string[]): string {
  const chunks = [profileMarkdown.trim()].filter(Boolean);
  if (recentMessages.length > 0) {
    chunks.push(recentMessages.slice(-8).map((item) => `- ${item}`).join("\n"));
  }
  return chunks.join("\n\n").trim();
}

function diagnoseResonancePayload(
  parsed: Record<string, unknown>,
  longTerm: FigureResonancePayload["long_term"],
  recentState: FigureResonanceCard | null,
  allowRecentState: boolean
): Record<string, unknown> {
  const longTermPayload =
    parsed.long_term && typeof parsed.long_term === "object"
      ? (parsed.long_term as Record<string, unknown>)
      : null;
  const primaryPayload =
    longTermPayload?.primary && typeof longTermPayload.primary === "object"
      ? (longTermPayload.primary as Record<string, unknown>)
      : null;
  const secondaryPayload = Array.isArray(longTermPayload?.secondary)
    ? longTermPayload.secondary
    : [];

  return {
    hasLongTermPrimary:
      typeof primaryPayload?.slug === "string" && primaryPayload.slug.trim().length > 0,
    secondaryCount: secondaryPayload.length,
    allowRecentState,
    hasRecentStatePayload: parsed.recent_state != null,
    usedLongTermHeuristicFill:
      secondaryPayload.length < longTerm.secondary.length ||
      !(
        typeof primaryPayload?.slug === "string" &&
        primaryPayload.slug.trim().length > 0
      ),
    usedRecentStateFallback:
      allowRecentState && parsed.recent_state != null && recentState != null
        ? !(typeof (parsed.recent_state as Record<string, unknown>).slug === "string")
        : false,
  };
}

function buildFigurePrompt(
  profileMarkdown: string,
  recentMessages: string[],
  language: string,
  context: PoolContext
) {
  const recentAllowed = recentMessages.length >= RECENT_MIN_MESSAGES;
  const figurePoolPayload = context.validRecords.map((item) => ({
    slug: item.slug,
    name: item.name,
    core_traits: localizedCoreTraits(item, language),
    thinking_style: localizedThinkingStyle(item, language),
    temperament_tags: localizedTemperamentTags(item, language),
    temperament_summary: localizedTemperamentSummary(item, language),
  }));

  if (normalizeLanguage(language) === "zh") {
    return {
      system: [
        "你正在为 CoPA Profile 页面生成 Thought Echoes 结果。",
        `任务是根据思维方式、人格气质与学习表达偏好，从固定人物库中找出最强共振镜像。当前候选池：${context.pool.name}。`,
        "规则：",
        "1. 优先依据思维方式判断；",
        "2. 人格气质只用于确认或区分相近候选；",
        "3. 长期主原型需要给出 1 个 primary 和 2 个 secondary；",
        "4. secondary 要尽量和 primary、彼此之间拉开气质差异；",
        "5. 输出严格 JSON；",
        "6. 所有 slug 只能从给定 figure_pool 中选择。",
      ].join("\n"),
      user: [
        "请根据以下已选中的 CoPA Profile 与最近用户消息，生成 Thought Echoes。",
        `<profile>\n${profileMarkdown || "(empty)"}\n</profile>`,
        `<recent_messages>\n${JSON.stringify(recentMessages, null, 2)}\n</recent_messages>`,
        `<allow_recent_state>\n${JSON.stringify(recentAllowed)}\n</allow_recent_state>`,
        `<figure_pool>\n${JSON.stringify(figurePoolPayload, null, 2)}\n</figure_pool>`,
        "返回 JSON，格式必须为：",
        '{"long_term":{"primary":{"slug":"...","reason":"...","resonance_axes":["..."]},"secondary":[{"slug":"...","reason":"...","resonance_axes":["..."]},{"slug":"...","reason":"...","resonance_axes":["..."]}]},"recent_state":{"slug":"...","reason":"...","resonance_axes":["..."]} | null}',
        "要求：long_term.primary 必须存在；recent_state 只有在 allow_recent_state 为 true 时才能返回对象；reason 用中文 1-2 句；resonance_axes 保留 2-4 个短标签；只返回 JSON。",
      ].join("\n\n"),
    };
  }

  return {
    system: [
      "Generate Thought Echoes for an existing CoPA Profile.",
      `Choose from the fixed figure pool named ${context.pool.name} based on thinking style first, temperament second.`,
      "Return strict JSON only.",
    ].join("\n"),
    user: [
      `Profile:\n${profileMarkdown || "(empty)"}`,
      `Recent messages:\n${JSON.stringify(recentMessages, null, 2)}`,
      `Allow recent state: ${JSON.stringify(recentAllowed)}`,
      `Figure pool:\n${JSON.stringify(figurePoolPayload, null, 2)}`,
      "Return JSON with long_term { primary, secondary } and recent_state.",
    ].join("\n\n"),
  };
}

async function requestFigureResonanceFromLlm(
  profileMarkdown: string,
  recentMessages: string[],
  _config: CopaModelConfig,
  language: string,
  context: PoolContext
): Promise<FigureResonancePayload> {
  const prompt = buildFigurePrompt(profileMarkdown, recentMessages, language, context);
  await persistLlmDebugLog({
    category: "resonance",
    stage: "request",
    payload: {
      language,
      responseFormat: FIGURE_RESONANCE_RESPONSE_FORMAT.type,
      recentMessageCount: recentMessages.length,
      figurePoolId: context.pool.id,
      figurePoolName: context.pool.name,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
    },
  });
  let response: LlmProxyResponse | null = null;
  for (const responseFormat of [FIGURE_RESONANCE_RESPONSE_FORMAT, FIGURE_RESONANCE_JSON_OBJECT_RESPONSE_FORMAT]) {
    try {
      response = await requestLlmChatCompletion({
        purpose: "resonance",
        responseFormat,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      });
    } catch (error) {
      await persistLlmDebugLog({
        category: "resonance",
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
      category: "resonance",
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
        category: "resonance",
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
      category: "resonance",
      stage: "http_error",
      level: "warn",
      payload: {
        status: response.status,
        statusText: response.statusText,
        detail,
        responseFormat: responseFormat.type,
      },
    });
    throw new Error(detail || `Figure resonance generation failed (${response.status})`);
  }

  if (!response) {
    throw new Error("Figure resonance generation failed before receiving a response.");
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
      category: "resonance",
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
    ? content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("\n")
    : typeof content === "string"
      ? content
      : "";
  await persistLlmDebugLog({
    category: "resonance",
    stage: "response",
    payload: { rawContent },
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripFence(rawContent)) as Record<string, unknown>;
  } catch (error) {
    await persistLlmDebugLog({
      category: "resonance",
      stage: "parse_error",
      level: "warn",
      payload: {
        rawContent,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
  const allowRecent = recentMessages.length >= RECENT_MIN_MESSAGES;
  const longTerm = enrichLongTermWithSecondary(
    normalizeLongTermPayload(parsed.long_term, context, language),
    collectSignalText(profileMarkdown, recentMessages),
    language,
    context
  );
  const recentState = allowRecent
    ? normalizeCardPayload(parsed.recent_state, {
        confidenceStyle: "phase_resonance",
        recordsBySlug: context.validRecordsBySlug,
        language,
      }) ??
      (heuristicMatch(recentMessages.join("\n"), {
        mode: "recent_state",
        language,
        context,
      }) as FigureResonanceCard)
    : null;

  await persistLlmDebugLog({
    category: "resonance",
    stage: "diagnosis",
    payload: diagnoseResonancePayload(parsed, longTerm, recentState, allowRecent),
  });

  return { long_term: longTerm, recent_state: recentState };
}

async function loadStoreResults(): Promise<FigureResonanceResult[]> {
  const store = await storageAdapter.load(STORE_NAME, {
    defaults: { [RESULTS_KEY]: [] },
    autoSave: true,
  });
  const storedResults = (await store.get<FigureResonanceResult[]>(RESULTS_KEY)) ?? [];
  if (storedResults.length > 0) {
    return storedResults;
  }

  const legacyStore = await storageAdapter.load(LEGACY_STORE_NAME, {
    defaults: { [RESULTS_KEY]: [] },
    autoSave: true,
  });
  const legacyResults = (await legacyStore.get<FigureResonanceResult[]>(RESULTS_KEY)) ?? [];
  if (legacyResults.length === 0) {
    return storedResults;
  }

  await store.set(RESULTS_KEY, legacyResults);
  await store.save();
  return legacyResults;
}

async function saveStoreResults(results: FigureResonanceResult[]): Promise<void> {
  const store = await storageAdapter.load(STORE_NAME, { autoSave: true });
  await store.set(RESULTS_KEY, results);
  await store.save();
}

function isMissingLocalApiKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Configure the ") && message.includes(" API key");
}

export function buildFigureResonanceCacheKey(input: {
  scopeKey: string;
  profileId: string;
  language: string;
  poolId: string;
}): string {
  return `${input.scopeKey}:${input.profileId}:${normalizeLanguage(input.language)}:${input.poolId}`;
}

export function getRecentFigureSignals(messages: string[]): string[] {
  return messages.map((item) => item.trim()).filter(Boolean).slice(-RECENT_WINDOW);
}

export async function loadFigureResonanceResult(input: {
  scopeKey: string;
  profileId: string;
  language: string;
  poolId: string;
}): Promise<FigureResonanceResult | null> {
  const results = await loadStoreResults();
  const cacheKey = buildFigureResonanceCacheKey(input);
  const matched = results.find((item) => item.cache_key === cacheKey) ?? null;
  if (!matched) {
    return null;
  }

  const pool = await loadFigurePool(input.poolId);
  const context = pool ? buildPoolContext(pool) : null;

  return rehydrateStoredResult(matched, context);
}

export async function loadFigureResonanceHistory(input: {
  scopeKey: string;
  profileId: string;
  language: string;
}): Promise<FigureResonanceResult[]> {
  const results = await loadStoreResults();
  const normalizedLanguage = normalizeLanguage(input.language);
  const scoped = results.filter(
    (item) =>
      item.scope_key === input.scopeKey &&
      item.profile_id === input.profileId &&
      item.language === normalizedLanguage
  );

  let fallbackContexts: PoolContext[] | null = null;
  const loadFallbackContexts = async (): Promise<PoolContext[]> => {
    if (!fallbackContexts) {
      fallbackContexts = (await loadFigurePools()).map(buildPoolContext);
    }
    return fallbackContexts;
  };

  const rehydrated = await Promise.all(
    scoped.map(async (item) => {
      const pool =
        typeof item.pool_id === "string" && item.pool_id.trim().length > 0
          ? await loadFigurePool(item.pool_id)
          : null;
      const context =
        pool
          ? buildPoolContext(pool)
          : (await loadFallbackContexts()).find((candidate) => contextMatchesResult(candidate, item)) ?? null;
      return rehydrateStoredResult(item, context);
    })
  );

  return rehydrated.sort((left, right) => right.generated_at.localeCompare(left.generated_at));
}

export async function saveFigureResonanceResult(
  result: FigureResonanceResult
): Promise<FigureResonanceResult> {
  const results = await loadStoreResults();
  const nextResults = [result, ...results.filter((item) => item.cache_key !== result.cache_key)].slice(0, 100);
  await saveStoreResults(nextResults);
  return result;
}

export async function deleteFigureResonanceResultsForProfile(
  profileId: string
): Promise<FigureResonanceResult[]> {
  const results = await loadStoreResults();
  const nextResults = results.filter((item) => item.profile_id !== profileId);
  await saveStoreResults(nextResults);
  return nextResults;
}

export async function generateFigureResonance(input: {
  scopeKey: string;
  poolId: string;
  profileSnapshot: CopaSnapshot;
  recentMessages: string[];
  config: CopaModelConfig;
  language: string;
}): Promise<FigureResonanceResult> {
  const context = await loadPoolContext(input.poolId);
  const profileMarkdown = input.profileSnapshot.markdown.trim();
  const recentSignals = getRecentFigureSignals(input.recentMessages);
  const signalText = collectSignalText(profileMarkdown, recentSignals);

  let payload: FigureResonancePayload;
  let source: FigureResonanceResult["source"] = "llm";

  try {
    payload = await requestFigureResonanceFromLlm(
      profileMarkdown,
      recentSignals,
      input.config,
      input.language,
      context
    );
  } catch (error) {
    if (isMissingLocalApiKeyError(error)) {
      throw error;
    }

    await persistLlmDebugLog({
      category: "resonance",
      stage: "diagnosis",
      level: "warn",
      payload: {
        source: "heuristic",
        reason: "llm_request_failed",
        error: error instanceof Error ? error.message : String(error),
      },
    });
    source = "heuristic";
    payload = {
      long_term: heuristicMatch(signalText, {
        mode: "long_term",
        language: input.language,
        context,
      }) as FigureResonancePayload["long_term"],
      recent_state:
        recentSignals.length >= RECENT_MIN_MESSAGES
          ? (heuristicMatch(recentSignals.join("\n"), {
              mode: "recent_state",
              language: input.language,
              context,
            }) as FigureResonanceCard)
          : null,
    };
  }

  const result: FigureResonanceResult = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `figure-resonance-${Date.now()}`,
    cache_key: buildFigureResonanceCacheKey({
      scopeKey: input.scopeKey,
      profileId: input.profileSnapshot.id,
      language: input.language,
      poolId: input.poolId,
    }),
    scope_key: input.scopeKey,
    profile_id: input.profileSnapshot.id,
    pool_id: context.pool.id,
    pool_name_snapshot: context.pool.name,
    pool_updated_at_snapshot: context.pool.updatedAt,
    generated_at: new Date().toISOString(),
    language: normalizeLanguage(input.language),
    source,
    long_term: payload.long_term,
    recent_state: payload.recent_state,
  };

  await saveFigureResonanceResult(result);
  return result;
}

export async function getFigurePoolCount(poolId: string): Promise<number> {
  const context = await loadPoolContext(poolId);
  return context.validRecords.length;
}
