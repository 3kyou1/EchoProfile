export type CopaFactorCode = "CT" | "SA" | "SC" | "CLM" | "MS" | "AMR";

export type CopaScopeType = "session" | "project" | "global";

export interface CopaFactor {
  code: CopaFactorCode;
  title: string;
  description: string;
  user_profile_description: string;
  response_strategy: string[];
}

export interface CopaFactors {
  CT: CopaFactor;
  SA: CopaFactor;
  SC: CopaFactor;
  CLM: CopaFactor;
  MS: CopaFactor;
  AMR: CopaFactor;
}

export interface CopaSourceStats {
  projectCount: number;
  sessionCount: number;
  rawUserMessages: number;
  dedupedUserMessages: number;
  truncatedMessages: number;
}

export interface CopaModelConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
}

export interface CopaScopeRef {
  type: CopaScopeType;
  ref: string;
  label: string;
  key: string;
}

export interface CopaSnapshot {
  id: string;
  createdAt: string;
  scope: CopaScopeRef;
  providerScope: string[];
  sourceStats: CopaSourceStats;
  modelConfig: Omit<CopaModelConfig, "apiKey">;
  promptSummary: string;
  factors: CopaFactors;
  markdown: string;
}

export interface CopaStoredState {
  snapshots: CopaSnapshot[];
  config: CopaModelConfig;
}

export interface CopaNormalizedResponse {
  factors: CopaFactors;
  promptSummary: string;
}

export interface ExtractedSignalResult {
  messages: string[];
  stats: {
    userMessages: number;
    dedupedMessages: number;
    truncatedMessages: number;
  };
}
