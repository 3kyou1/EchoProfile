import type { FigureRecordInput } from "@/types/figurePool";

export type FigureRecord = FigureRecordInput;

export type FigureConfidenceStyle = "strong_resonance" | "phase_resonance";

export interface FigureResonanceCard {
  name: string;
  localized_names?: Partial<Record<"zh", string>>;
  slug: string;
  portrait_url: string;
  hook: string;
  quote_zh: string;
  quote_en: string;
  reason: string;
  resonance_axes: string[];
  confidence_style: FigureConfidenceStyle;
  loading_copy_zh: string;
  loading_copy_en: string;
  bio_zh: string;
  bio_en: string;
  achievements_zh: string[];
  achievements_en: string[];
}

export interface FigureResonanceLongTerm {
  primary: FigureResonanceCard;
  secondary: FigureResonanceCard[];
}

export interface FigureResonancePayload {
  long_term: FigureResonanceLongTerm;
  recent_state: FigureResonanceCard | null;
}

export interface FigureResonanceResult extends FigureResonancePayload {
  id: string;
  cache_key: string;
  scope_key: string;
  profile_id: string;
  pool_id: string;
  pool_name_snapshot: string;
  pool_updated_at_snapshot: string;
  pool_deleted?: boolean;
  pool_updated?: boolean;
  generated_at: string;
  language: string;
  source: "llm" | "heuristic";
}
