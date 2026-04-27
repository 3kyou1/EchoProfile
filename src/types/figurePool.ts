export interface FigureRecordInput {
  slug: string;
  name: string;
  localized_names?: Partial<Record<string, string>>;
  portrait_url: string;
  quote_en: string;
  quote_zh: string;
  core_traits: string;
  core_traits_en?: string;
  thinking_style: string;
  thinking_style_en?: string;
  temperament_tags: string;
  temperament_summary: string;
  temperament_tags_en?: string;
  temperament_summary_en?: string;
  loading_copy_zh: string;
  loading_copy_en: string;
  bio_zh: string;
  bio_en: string;
  achievements_zh: string[];
  achievements_en: string[];
}

export interface FigureRecordValidationIssue {
  field: keyof FigureRecordInput | "record";
  message: string;
}

export type FigureRecordStatus = "valid" | "invalid";

export interface FigurePoolRecord extends FigureRecordInput {
  status: FigureRecordStatus;
  errors: FigureRecordValidationIssue[];
  updatedAt: string;
}

export interface FigurePoolValidationSummary {
  validCount: number;
  invalidCount: number;
  errorCount: number;
}

export interface FigurePool {
  id: string;
  name: string;
  description?: string;
  origin: "builtin" | "imported";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  validationSummary: FigurePoolValidationSummary;
  records: FigurePoolRecord[];
}

export interface FigurePoolImportPayload {
  name: string;
  description?: string;
  records: FigureRecordInput[];
}

export interface FigurePoolZipInspection {
  payload: FigurePoolImportPayload;
  hasNameConflict: boolean;
  conflictingPoolId?: string;
  conflictingPoolName?: string;
}

export interface FigurePoolZipImportOptions {
  name?: string;
}
