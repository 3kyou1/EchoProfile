import scientistPoolData from "@/data/scientistPool.json";
import { storageAdapter } from "@/services/storage";
import type { CopaModelConfig, CopaSnapshot } from "@/types/copaProfile";
import type {
  ScientistConfidenceStyle,
  ScientistRecord,
  ScientistResonanceCard,
  ScientistResonancePayload,
  ScientistResonanceResult,
} from "@/types/scientistResonance";

const STORE_NAME = "scientist-resonance.json";
const RESULTS_KEY = "results";
const RECENT_WINDOW = 12;
const RECENT_MIN_MESSAGES = 4;
const MAX_POOL_AXES = 4;

const SCIENTIST_POOL = scientistPoolData as ScientistRecord[];
const SCIENTIST_POOL_BY_SLUG = new Map(SCIENTIST_POOL.map((item) => [item.slug, item]));

function stripFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const lines = trimmed.split("\n");
  const body = lines.slice(1, lines[lines.length - 1]?.trim() === "```" ? -1 : undefined);
  return body.join("\n").trim();
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

function scientistSignature(scientist: ScientistRecord): Set<string> {
  const parts = `${scientist.core_traits} ${scientist.temperament_tags}`.split(/[、,，;/｜|\s]+/);
  return new Set(parts.map((part) => part.trim().toLowerCase()).filter(Boolean));
}

function candidateSimilarity(left: ScientistRecord, right: ScientistRecord): number {
  const leftSig = scientistSignature(left);
  const rightSig = scientistSignature(right);
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

function defaultReason(scientist: ScientistRecord, mode: "long_term" | "recent_state", language: string): string {
  if (normalizeLanguage(language) === "zh") {
    const prefix = mode === "long_term" ? "你长期更像" : "你最近这段时间更像";
    return `${prefix}${scientist.name}式研究者：${scientist.thinking_style}`;
  }

  const prefix = mode === "long_term" ? "Your long-term archetype feels closest to" : "Your recent state feels closest to";
  return `${prefix} ${scientist.name}: ${scientist.thinking_style}`;
}

function scoreScientist(signalText: string, scientist: ScientistRecord): { score: number; resonanceAxes: string[] } {
  const signal = signalText.toLowerCase();
  const fields = [scientist.core_traits, scientist.temperament_tags];
  let score = 0;
  const matchedAxes: string[] = [];

  for (const field of fields) {
    for (const raw of field.split("、")) {
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

function heuristicCandidates(signalText: string, language: string): Array<{
  slug: string;
  score: number;
  reason: string;
  resonanceAxes: string[];
}> {
  return [...SCIENTIST_POOL]
    .map((scientist) => {
      const scored = scoreScientist(signalText, scientist);
      return {
        slug: scientist.slug,
        score: scored.score,
        reason: defaultReason(scientist, "long_term", language),
        resonanceAxes:
          scored.resonanceAxes.length > 0
            ? scored.resonanceAxes
            : uniqueAxes(scientist.core_traits.split("、").slice(0, 2)),
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
  scientist: ScientistRecord,
  options: {
    reason: string;
    resonanceAxes: unknown[];
    confidenceStyle: ScientistConfidenceStyle;
  }
): ScientistResonanceCard {
  const normalizedAxes = uniqueAxes(options.resonanceAxes).slice(0, MAX_POOL_AXES);
  const fallbackAxes = uniqueAxes([
    ...scientist.core_traits.split("、").slice(0, 2),
    ...scientist.temperament_tags.split("、").slice(0, 1),
  ]).slice(0, MAX_POOL_AXES);

  return {
    name: scientist.name,
    localized_names: scientist.localized_names,
    slug: scientist.slug,
    portrait_url: scientist.portrait_url,
    hook: scientist.temperament_summary,
    quote_zh: scientist.quote_zh,
    quote_en: scientist.quote_en,
    reason: options.reason.trim() || scientist.thinking_style,
    resonance_axes: normalizedAxes.length > 0 ? normalizedAxes : fallbackAxes,
    confidence_style: options.confidenceStyle,
    loading_copy_zh: scientist.loading_copy_zh,
    loading_copy_en: scientist.loading_copy_en,
    bio_zh: scientist.bio_zh,
    bio_en: scientist.bio_en,
    achievements_zh: scientist.achievements_zh,
    achievements_en: scientist.achievements_en,
  };
}

function normalizeCardPayload(
  payload: unknown,
  options: { confidenceStyle: ScientistConfidenceStyle }
): ScientistResonanceCard | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const slug = typeof record.slug === "string" ? record.slug.trim() : "";
  const scientist = SCIENTIST_POOL_BY_SLUG.get(slug);
  if (!scientist) {
    return null;
  }

  const axes = Array.isArray(record.resonance_axes) ? record.resonance_axes : [];
  return buildCardPayload(scientist, {
    reason: typeof record.reason === "string" ? record.reason : scientist.thinking_style,
    resonanceAxes: axes,
    confidenceStyle: options.confidenceStyle,
  });
}

function rehydrateStoredCard(
  card: ScientistResonanceCard,
  confidenceStyle: ScientistConfidenceStyle
): ScientistResonanceCard {
  const scientist = SCIENTIST_POOL_BY_SLUG.get(card.slug);
  if (!scientist) {
    return card;
  }

  return buildCardPayload(scientist, {
    reason: card.reason,
    resonanceAxes: card.resonance_axes,
    confidenceStyle,
  });
}

function rehydrateStoredResult(result: ScientistResonanceResult): ScientistResonanceResult {
  return {
    ...result,
    long_term: {
      primary: rehydrateStoredCard(result.long_term.primary, "strong_resonance"),
      secondary: result.long_term.secondary.map((card) =>
        rehydrateStoredCard(card, "strong_resonance")
      ),
    },
    recent_state: result.recent_state
      ? rehydrateStoredCard(result.recent_state, "phase_resonance")
      : null,
  };
}

function normalizeLongTermPayload(payload: unknown): ScientistResonancePayload["long_term"] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const primaryPayload = record.primary && typeof record.primary === "object" ? record.primary : payload;
  const primary = normalizeCardPayload(primaryPayload, { confidenceStyle: "strong_resonance" });
  if (!primary) {
    return null;
  }

  const secondaryPayloads = Array.isArray(record.secondary) ? record.secondary : [];
  const secondary: ScientistResonanceCard[] = [];
  const seen = new Set([primary.slug]);
  for (const item of secondaryPayloads) {
    const normalized = normalizeCardPayload(item, { confidenceStyle: "strong_resonance" });
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
  candidates: Array<{ slug: string; resonanceAxes: string[]; reason: string }>
): Array<{ slug: string; resonanceAxes: string[]; reason: string }> {
  const selected: Array<{ slug: string; resonanceAxes: string[]; reason: string }> = [];
  const skipped: Array<{ slug: string; resonanceAxes: string[]; reason: string }> = [];
  const primary = SCIENTIST_POOL_BY_SLUG.get(primarySlug);
  if (!primary) {
    return selected;
  }

  for (const candidate of candidates) {
    const scientist = SCIENTIST_POOL_BY_SLUG.get(candidate.slug);
    if (!scientist || scientist.slug === primarySlug) {
      continue;
    }

    const tooCloseToPrimary = candidateSimilarity(primary, scientist) >= 0.45;
    const tooCloseToSelected = selected.some((item) => {
      const selectedScientist = SCIENTIST_POOL_BY_SLUG.get(item.slug);
      return selectedScientist ? candidateSimilarity(selectedScientist, scientist) >= 0.45 : false;
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
  options: { mode: "long_term" | "recent_state"; language: string }
): ScientistResonancePayload["long_term"] | ScientistResonanceCard {
  const candidates = heuristicCandidates(signalText, options.language);
  const chosenPayload = candidates[0];
  const chosenScientist = SCIENTIST_POOL_BY_SLUG.get(chosenPayload?.slug ?? "") ?? SCIENTIST_POOL[0];
  if (!chosenScientist) {
    throw new Error("Scientist pool is empty");
  }

  const primaryCard = buildCardPayload(chosenScientist, {
    reason: chosenPayload?.reason ?? defaultReason(chosenScientist, options.mode, options.language),
    resonanceAxes: chosenPayload?.resonanceAxes ?? [],
    confidenceStyle: options.mode === "long_term" ? "strong_resonance" : "phase_resonance",
  });

  if (options.mode !== "long_term") {
    return primaryCard;
  }

  const secondary = pickSecondaryCandidates(primaryCard.slug, candidates.slice(1)).flatMap((candidate) => {
    const scientist = SCIENTIST_POOL_BY_SLUG.get(candidate.slug);
    return scientist
      ? [
          buildCardPayload(scientist, {
            reason: defaultReason(scientist, "long_term", options.language),
            resonanceAxes: candidate.resonanceAxes,
            confidenceStyle: "strong_resonance",
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
  longTerm: ScientistResonancePayload["long_term"] | null,
  signalText: string,
  language: string
): ScientistResonancePayload["long_term"] {
  if (!longTerm) {
    return heuristicMatch(signalText, { mode: "long_term", language }) as ScientistResonancePayload["long_term"];
  }

  if (longTerm.secondary.length >= 2) {
    return { primary: longTerm.primary, secondary: longTerm.secondary.slice(0, 2) };
  }

  const candidates = heuristicCandidates(signalText, language);
  const extra = pickSecondaryCandidates(longTerm.primary.slug, candidates)
    .flatMap((candidate) => {
      const scientist = SCIENTIST_POOL_BY_SLUG.get(candidate.slug);
      if (!scientist || longTerm.secondary.some((item) => item.slug === scientist.slug)) {
        return [];
      }
      return [
        buildCardPayload(scientist, {
          reason: defaultReason(scientist, "long_term", language),
          resonanceAxes: candidate.resonanceAxes,
          confidenceStyle: "strong_resonance",
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

function buildScientistPrompt(profileMarkdown: string, recentMessages: string[], language: string) {
  const recentAllowed = recentMessages.length >= RECENT_MIN_MESSAGES;
  const scientistPool = SCIENTIST_POOL.map((item) => ({
    slug: item.slug,
    name: item.name,
    core_traits: item.core_traits,
    thinking_style: item.thinking_style,
    temperament_tags: item.temperament_tags,
    temperament_summary: item.temperament_summary,
  }));

  if (normalizeLanguage(language) === "zh") {
    return {
      system: [
        "你正在为 CoPA Profile 页面生成 Thought Echoes 结果。",
        "任务不是判断用户像不像名人，而是根据思维方式、人格气质与学习表达偏好，从固定科学家库中找出最强共振人物镜像。",
        "规则：",
        "1. 优先依据思维方式判断；",
        "2. 人格气质只用于确认或区分相近候选；",
        "3. 长期主原型需要给出 1 个 primary 和 2 个 secondary；",
        "4. secondary 要尽量和 primary、彼此之间拉开气质差异；",
        "5. 输出严格 JSON；",
        "6. 所有 slug 只能从给定 scientist_pool 中选择。",
      ].join("\n"),
      user: [
        "请根据以下已选中的 CoPA Profile 与最近用户消息，生成 Thought Echoes。",
        `<profile>\n${profileMarkdown || "(empty)"}\n</profile>`,
        `<recent_messages>\n${JSON.stringify(recentMessages, null, 2)}\n</recent_messages>`,
        `<allow_recent_state>\n${JSON.stringify(recentAllowed)}\n</allow_recent_state>`,
        `<scientist_pool>\n${JSON.stringify(scientistPool, null, 2)}\n</scientist_pool>`,
        "返回 JSON，格式必须为：",
        '{"long_term":{"primary":{"slug":"...","reason":"...","resonance_axes":["..."]},"secondary":[{"slug":"...","reason":"...","resonance_axes":["..."]},{"slug":"...","reason":"...","resonance_axes":["..."]}]},"recent_state":{"slug":"...","reason":"...","resonance_axes":["..."]} | null}',
        "要求：long_term.primary 必须存在；recent_state 只有在 allow_recent_state 为 true 时才能返回对象；reason 用中文 1-2 句；resonance_axes 保留 2-4 个短标签；只返回 JSON。",
      ].join("\n\n"),
    };
  }

  return {
    system: [
      "Generate Thought Echoes for an existing CoPA Profile.",
      "Choose from the fixed scientist pool based on thinking style first, temperament second.",
      "Return strict JSON only.",
    ].join("\n"),
    user: [
      `Profile:\n${profileMarkdown || "(empty)"}`,
      `Recent messages:\n${JSON.stringify(recentMessages, null, 2)}`,
      `Allow recent state: ${JSON.stringify(recentAllowed)}`,
      `Scientist pool:\n${JSON.stringify(scientistPool, null, 2)}`,
      "Return JSON with long_term { primary, secondary } and recent_state.",
    ].join("\n\n"),
  };
}

async function requestScientistResonanceFromLlm(
  profileMarkdown: string,
  recentMessages: string[],
  config: CopaModelConfig,
  language: string
): Promise<ScientistResonancePayload> {
  if (!config.apiKey?.trim()) {
    throw new Error("Missing API key");
  }
  if (!config.model.trim()) {
    throw new Error("Missing model name");
  }

  const prompt = buildScientistPrompt(profileMarkdown, recentMessages, language);
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Scientist resonance generation failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string; type?: string }> } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const rawContent = Array.isArray(content)
    ? content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("\n")
    : typeof content === "string"
      ? content
      : "";

  const parsed = JSON.parse(stripFence(rawContent)) as Record<string, unknown>;
  const allowRecent = recentMessages.length >= RECENT_MIN_MESSAGES;
  const longTerm = enrichLongTermWithSecondary(normalizeLongTermPayload(parsed.long_term), collectSignalText(profileMarkdown, recentMessages), language);
  const recentState = allowRecent
    ? normalizeCardPayload(parsed.recent_state, { confidenceStyle: "phase_resonance" }) ??
      (heuristicMatch(recentMessages.join("\n"), { mode: "recent_state", language }) as ScientistResonanceCard)
    : null;

  return { long_term: longTerm, recent_state: recentState };
}

async function loadStoreResults(): Promise<ScientistResonanceResult[]> {
  const store = await storageAdapter.load(STORE_NAME, {
    defaults: { [RESULTS_KEY]: [] },
    autoSave: true,
  });
  return (await store.get<ScientistResonanceResult[]>(RESULTS_KEY)) ?? [];
}

async function saveStoreResults(results: ScientistResonanceResult[]): Promise<void> {
  const store = await storageAdapter.load(STORE_NAME, { autoSave: true });
  await store.set(RESULTS_KEY, results);
  await store.save();
}

export function buildScientistResonanceCacheKey(input: {
  scopeKey: string;
  profileId: string;
  language: string;
}): string {
  return `${input.scopeKey}:${input.profileId}:${normalizeLanguage(input.language)}`;
}

export function getRecentScientistSignals(messages: string[]): string[] {
  return messages.map((item) => item.trim()).filter(Boolean).slice(-RECENT_WINDOW);
}

export async function loadScientistResonanceResult(input: {
  scopeKey: string;
  profileId: string;
  language: string;
}): Promise<ScientistResonanceResult | null> {
  const results = await loadStoreResults();
  const cacheKey = buildScientistResonanceCacheKey(input);
  const matched = results.find((item) => item.cache_key === cacheKey) ?? null;
  return matched ? rehydrateStoredResult(matched) : null;
}

export async function saveScientistResonanceResult(
  result: ScientistResonanceResult
): Promise<ScientistResonanceResult> {
  const results = await loadStoreResults();
  const nextResults = [result, ...results.filter((item) => item.cache_key !== result.cache_key)].slice(0, 100);
  await saveStoreResults(nextResults);
  return result;
}

export async function deleteScientistResonanceResultsForProfile(
  profileId: string
): Promise<ScientistResonanceResult[]> {
  const results = await loadStoreResults();
  const nextResults = results.filter((item) => item.profile_id !== profileId);
  await saveStoreResults(nextResults);
  return nextResults;
}

export async function generateScientistResonance(input: {
  scopeKey: string;
  profileSnapshot: CopaSnapshot;
  recentMessages: string[];
  config: CopaModelConfig;
  language: string;
}): Promise<ScientistResonanceResult> {
  const profileMarkdown = input.profileSnapshot.markdown.trim();
  const recentSignals = getRecentScientistSignals(input.recentMessages);
  const signalText = collectSignalText(profileMarkdown, recentSignals);

  let payload: ScientistResonancePayload;
  let source: ScientistResonanceResult["source"] = "llm";

  try {
    payload = await requestScientistResonanceFromLlm(
      profileMarkdown,
      recentSignals,
      input.config,
      input.language
    );
  } catch {
    source = "heuristic";
    payload = {
      long_term: heuristicMatch(signalText, {
        mode: "long_term",
        language: input.language,
      }) as ScientistResonancePayload["long_term"],
      recent_state:
        recentSignals.length >= RECENT_MIN_MESSAGES
          ? (heuristicMatch(recentSignals.join("\n"), {
              mode: "recent_state",
              language: input.language,
            }) as ScientistResonanceCard)
          : null,
    };
  }

  const result: ScientistResonanceResult = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `scientist-resonance-${Date.now()}`,
    cache_key: buildScientistResonanceCacheKey({
      scopeKey: input.scopeKey,
      profileId: input.profileSnapshot.id,
      language: input.language,
    }),
    scope_key: input.scopeKey,
    profile_id: input.profileSnapshot.id,
    generated_at: new Date().toISOString(),
    language: normalizeLanguage(input.language),
    source,
    long_term: payload.long_term,
    recent_state: payload.recent_state,
  };

  await saveScientistResonanceResult(result);
  return result;
}

export function getScientistPoolCount(): number {
  return SCIENTIST_POOL.length;
}
