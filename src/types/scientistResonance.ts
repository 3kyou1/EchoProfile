export interface ScientistRecord {
  slug: string;
  name: string;
  localized_names?: Partial<Record<"zh", string>>;
  portrait_url: string;
  quote_en: string;
  quote_zh: string;
  core_traits: string;
  thinking_style: string;
  temperament_tags: string;
  temperament_summary: string;
  loading_copy_zh: string;
  loading_copy_en: string;
  bio_zh: string;
  bio_en: string;
  achievements_zh: string[];
  achievements_en: string[];
}

export type ScientistConfidenceStyle = "strong_resonance" | "phase_resonance";

export interface ScientistResonanceCard {
  name: string;
  localized_names?: Partial<Record<"zh", string>>;
  slug: string;
  portrait_url: string;
  hook: string;
  quote_zh: string;
  quote_en: string;
  reason: string;
  resonance_axes: string[];
  confidence_style: ScientistConfidenceStyle;
  loading_copy_zh: string;
  loading_copy_en: string;
  bio_zh: string;
  bio_en: string;
  achievements_zh: string[];
  achievements_en: string[];
}

export interface ScientistResonanceLongTerm {
  primary: ScientistResonanceCard;
  secondary: ScientistResonanceCard[];
}

export interface ScientistResonancePayload {
  long_term: ScientistResonanceLongTerm;
  recent_state: ScientistResonanceCard | null;
}

export interface ScientistResonanceResult extends ScientistResonancePayload {
  id: string;
  cache_key: string;
  scope_key: string;
  profile_id: string;
  generated_at: string;
  language: string;
  source: "llm" | "heuristic";
}
