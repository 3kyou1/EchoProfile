import { useTranslation } from "react-i18next";

import type { FigurePool } from "@/types/figurePool";

interface FigurePoolImportSummaryProps {
  pool: FigurePool | null;
}

export function FigurePoolImportSummary({ pool }: FigurePoolImportSummaryProps) {
  const { t } = useTranslation();

  if (!pool) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {t("common.copa.resonance.pool.importSummary", "Import summary")}
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">{pool.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("common.copa.resonance.pool.availability", "{{valid}} usable / {{invalid}} invalid", {
          valid: pool.validationSummary.validCount,
          invalid: pool.validationSummary.invalidCount,
          defaultValue: `${pool.validationSummary.validCount} usable / ${pool.validationSummary.invalidCount} invalid`,
        })}
      </p>
    </div>
  );
}
