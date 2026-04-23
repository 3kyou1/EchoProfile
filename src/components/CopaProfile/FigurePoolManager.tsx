import { useMemo, useState } from "react";
import { Download, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FigurePool, FigureRecordInput, FigurePoolRecord } from "@/types/figurePool";
import { FigurePoolEditorDrawer } from "./FigurePoolEditorDrawer";
import { FigurePoolImportSummary } from "./FigurePoolImportSummary";

function buildEmptyRecord(): FigureRecordInput {
  return {
    slug: "",
    name: "",
    localized_names: { zh: "" },
    portrait_url: "",
    quote_en: "",
    quote_zh: "",
    core_traits: "",
    thinking_style: "",
    temperament_tags: "",
    temperament_summary: "",
    loading_copy_zh: "",
    loading_copy_en: "",
    bio_zh: "",
    bio_en: "",
    achievements_zh: [],
    achievements_en: [],
  };
}

const BIO_FALLBACK_LIMIT = {
  en: 96,
  zh: 48,
} as const;

function clipText(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit).trimEnd()}...`;
}

function summarizeBiography(value: string, language: "en" | "zh"): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const sentenceMatch =
    language === "zh"
      ? trimmed.match(/^.*?[。！？]/)
      : trimmed.match(/^.*?[.!?](?=\s|$)/);

  if (sentenceMatch?.[0]) {
    return sentenceMatch[0].trim();
  }

  return clipText(trimmed, BIO_FALLBACK_LIMIT[language]);
}

interface FigurePoolManagerProps {
  pools: FigurePool[];
  selectedPoolId: string;
  importSummaryPool: FigurePool | null;
  onSelectPool: (poolId: string) => void;
  onImport: () => Promise<void> | void;
  onExport: (poolId: string) => Promise<void> | void;
  onRenamePool: (poolId: string, name: string) => Promise<void> | void;
  onSetDefault: (poolId: string) => Promise<void> | void;
  onDeletePool: (poolId: string) => Promise<void> | void;
  onCreateRecord: (poolId: string, record: FigureRecordInput) => Promise<void> | void;
  onUpdateRecord: (poolId: string, slug: string, record: FigureRecordInput) => Promise<void> | void;
  onDeleteRecord: (poolId: string, slug: string) => Promise<void> | void;
}

export function FigurePoolManager({
  pools,
  selectedPoolId,
  importSummaryPool,
  onSelectPool,
  onImport,
  onExport,
  onRenamePool,
  onSetDefault,
  onDeletePool,
  onCreateRecord,
  onUpdateRecord,
  onDeleteRecord,
}: FigurePoolManagerProps) {
  const { t, i18n } = useTranslation();
  const [showInvalidOnly, setShowInvalidOnly] = useState(false);
  const [draftPoolName, setDraftPoolName] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FigurePoolRecord | null>(null);

  const selectedPool = useMemo(
    () => pools.find((pool) => pool.id === selectedPoolId) ?? pools[0] ?? null,
    [pools, selectedPoolId]
  );

  const visibleRecords = useMemo(() => {
    if (!selectedPool) {
      return [];
    }
    return showInvalidOnly
      ? selectedPool.records.filter((record) => record.status === "invalid")
      : selectedPool.records;
  }, [selectedPool, showInvalidOnly]);

  const handleSaveRecord = async (record: FigureRecordInput) => {
    if (!selectedPool) {
      return;
    }

    if (editingRecord) {
      await onUpdateRecord(selectedPool.id, editingRecord.slug, record);
      return;
    }

    await onCreateRecord(selectedPool.id, record);
  };

  const activeLanguage = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded-3xl border border-border/60 bg-card/90 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t("common.copa.resonance.pool.list", "Figure pools")}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void onImport()}>
            <Upload className="h-4 w-4" />
            {t("common.copa.resonance.pool.import", "Import")}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {pools.map((pool) => (
            <button
              key={pool.id}
              type="button"
              onClick={() => {
                onSelectPool(pool.id);
                setDraftPoolName(pool.name);
              }}
              className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                pool.id === selectedPool?.id
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-border/60 bg-background/70 hover:bg-background"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{pool.name}</p>
                {pool.isDefault ? (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    {t("common.default", "Default")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("common.copa.resonance.pool.availability", "{{valid}} usable / {{invalid}} invalid", {
                  valid: pool.validationSummary.validCount,
                  invalid: pool.validationSummary.invalidCount,
                  defaultValue: `${pool.validationSummary.validCount} usable / ${pool.validationSummary.invalidCount} invalid`,
                })}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-border/60 bg-card/90 p-5 shadow-sm">
        {selectedPool ? (
          <>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1 space-y-3">
                <Input
                  value={draftPoolName || selectedPool.name}
                  onChange={(event) => setDraftPoolName(event.target.value)}
                  placeholder={t("common.copa.resonance.pool.name", "Pool name")}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void onRenamePool(selectedPool.id, draftPoolName || selectedPool.name)}>
                    <Pencil className="h-4 w-4" />
                    {t("common.rename", "Rename")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void onSetDefault(selectedPool.id)}>
                    {t("common.copa.resonance.pool.setDefault", "Set default")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void onExport(selectedPool.id)}>
                    <Download className="h-4 w-4" />
                    {t("common.export", "Export")}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void onDeletePool(selectedPool.id)}>
                    <Trash2 className="h-4 w-4" />
                    {t("common.delete", "Delete")}
                  </Button>
                </div>
              </div>
              <FigurePoolImportSummary pool={importSummaryPool} />
            </div>

            {selectedPool.validationSummary.invalidCount > 0 ? (
              <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {t("common.copa.resonance.pool.invalidBanner", "{{count}} invalid records are excluded from matching.", {
                        count: selectedPool.validationSummary.invalidCount,
                        defaultValue: `${selectedPool.validationSummary.invalidCount} invalid records are excluded from matching.`,
                      })}
                    </p>
                    <p className="mt-1 text-amber-900/80">
                      {t("common.copa.resonance.pool.invalidHint", "Fix them here to make them usable again.")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowInvalidOnly((current) => !current)}>
                    <RefreshCw className="h-4 w-4" />
                    {showInvalidOnly
                      ? t("common.copa.resonance.pool.showAll", "Show all")
                      : t("common.copa.resonance.pool.showInvalidOnly", "Show invalid only")}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("common.copa.resonance.pool.records", "Records")}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingRecord(null);
                  setEditorOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {t("common.copa.resonance.pool.addRecord", "Add record")}
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {visibleRecords.map((record) => {
                const localizedName = activeLanguage === "zh" ? record.localized_names?.zh?.trim() || record.name : record.name;
                const biographySource =
                  activeLanguage === "zh" ? record.bio_zh.trim() || record.bio_en.trim() : record.bio_en.trim() || record.bio_zh.trim();
                const biography = summarizeBiography(biographySource, activeLanguage);
                const statusLabel =
                  record.status === "valid"
                    ? t("common.copa.resonance.pool.status.valid", "Valid")
                    : t("common.copa.resonance.pool.status.invalid", "Invalid");

                return (
                  <div
                    key={record.slug}
                    data-testid={`figure-record-card-${record.slug}`}
                    className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/70 p-3 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{localizedName}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                            record.status === "valid"
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-amber-500/10 text-amber-800"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{biography}</p>
                    </div>
                    <div data-testid={`figure-record-actions-${record.slug}`} className="flex flex-wrap gap-2 md:self-start md:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingRecord(record);
                          setEditorOpen(true);
                        }}
                      >
                        {t("common.edit", "Edit")}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void onDeleteRecord(selectedPool.id, record.slug)}>
                        {t("common.delete", "Delete")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <FigurePoolEditorDrawer
              open={editorOpen}
              onOpenChange={setEditorOpen}
              title={
                editingRecord
                  ? t("common.copa.resonance.pool.editRecord", "Edit record")
                  : t("common.copa.resonance.pool.addRecord", "Add record")
              }
              initialRecord={editingRecord ?? buildEmptyRecord()}
              onSave={handleSaveRecord}
              errors={editingRecord?.errors}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}
