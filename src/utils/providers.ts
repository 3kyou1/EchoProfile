import type { ProviderId } from "../types";

export const PROVIDER_IDS: ProviderId[] = ["aider", "claude", "cline", "codex", "cursor", "gemini", "opencode"];
export const DEFAULT_PROVIDER_ID: ProviderId = "claude";

const PROVIDER_TRANSLATIONS: Record<
  ProviderId,
  { key: string; fallback: string }
> = {
  aider: { key: "common.provider.aider", fallback: "Aider" },
  claude: { key: "common.provider.claude", fallback: "Claude Code" },
  cline: { key: "common.provider.cline", fallback: "Cline" },
  codex: { key: "common.provider.codex", fallback: "Codex CLI" },
  cursor: { key: "common.provider.cursor", fallback: "Cursor" },
  gemini: { key: "common.provider.gemini", fallback: "Gemini CLI" },
  opencode: { key: "common.provider.opencode", fallback: "OpenCode" },
};

type TranslateFn = (key: string, defaultValue: string) => string;

interface ProviderAnalyticsCapability {
  supportsConversationBreakdown: boolean;
}

const PROVIDER_ANALYTICS_CAPABILITIES: Record<
  ProviderId,
  ProviderAnalyticsCapability
> = {
  aider: { supportsConversationBreakdown: false },
  claude: { supportsConversationBreakdown: true },
  cline: { supportsConversationBreakdown: false },
  codex: { supportsConversationBreakdown: false },
  cursor: { supportsConversationBreakdown: false },
  gemini: { supportsConversationBreakdown: false },
  opencode: { supportsConversationBreakdown: false },
};

export interface ProviderTokenStatsLike {
  provider_id: string;
  tokens: number;
}

export interface ConversationBreakdownCoverage {
  totalTokens: number;
  coveredTokens: number;
  coveragePercent: number;
  hasLimitedProviders: boolean;
}

export function getProviderId(provider?: ProviderId | string): ProviderId {
  switch (provider) {
    case "aider":
    case "cline":
    case "codex":
    case "cursor":
    case "gemini":
    case "opencode":
    case "claude":
      return provider;
    default:
      return DEFAULT_PROVIDER_ID;
  }
}

export function normalizeProviderIds(ids: readonly ProviderId[]): ProviderId[] {
  return PROVIDER_IDS.filter((id) => ids.includes(id));
}

export function hasNonDefaultProvider(
  ids: readonly ProviderId[]
): boolean {
  return ids.some((id) => id !== DEFAULT_PROVIDER_ID);
}

export function getProviderLabel(
  translate: TranslateFn,
  provider?: ProviderId | string
): string {
  const id = getProviderId(provider);
  const config = PROVIDER_TRANSLATIONS[id];
  return translate(config.key, config.fallback);
}

export function supportsConversationBreakdown(
  provider?: ProviderId | string
): boolean {
  if (provider == null || !PROVIDER_IDS.includes(provider as ProviderId)) {
    return false;
  }
  return PROVIDER_ANALYTICS_CAPABILITIES[provider as ProviderId]
    .supportsConversationBreakdown;
}

export function hasAnyConversationBreakdownProvider(
  providers?: readonly (ProviderId | string)[]
): boolean {
  if (!providers || providers.length === 0) {
    return false;
  }
  return providers.some((provider) =>
    supportsConversationBreakdown(provider)
  );
}

export function calculateConversationBreakdownCoverage(
  providers: readonly ProviderTokenStatsLike[]
): ConversationBreakdownCoverage {
  let totalTokens = 0;
  let coveredTokens = 0;
  let hasLimitedProviders = false;

  for (const provider of providers) {
    const tokens = Math.max(0, provider.tokens);
    totalTokens += tokens;

    if (supportsConversationBreakdown(provider.provider_id)) {
      coveredTokens += tokens;
    } else if (tokens > 0) {
      hasLimitedProviders = true;
    }
  }

  const coveragePercent =
    totalTokens > 0 ? (coveredTokens / totalTokens) * 100 : 0;

  return {
    totalTokens,
    coveredTokens,
    coveragePercent,
    hasLimitedProviders,
  };
}
