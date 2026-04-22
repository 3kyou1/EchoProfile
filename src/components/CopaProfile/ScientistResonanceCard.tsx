import { useTranslation } from "react-i18next";

import type { ScientistResonanceCard as ScientistResonanceCardType } from "@/types/scientistResonance";

interface ScientistResonanceCardProps {
  card: ScientistResonanceCardType;
  label: string;
  compact?: boolean;
}

function normalizeDisplayQuote(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
    ["「", "」"],
    ["『", "』"],
  ];

  for (const [left, right] of pairs) {
    if (trimmed.startsWith(left) && trimmed.endsWith(right) && trimmed.length > left.length + right.length) {
      return trimmed.slice(left.length, trimmed.length - right.length).trim();
    }
  }

  return trimmed.replace(/^["'“”‘’「『]+/, "").replace(/["'“”‘’」』]+$/, "").trim();
}

export function ScientistResonanceCard({ card, label, compact = false }: ScientistResonanceCardProps) {
  const { t } = useTranslation();
  const displayQuote = normalizeDisplayQuote(card.quote_zh || card.quote_en);

  return (
    <article className="overflow-hidden rounded-2xl border border-border/60 bg-card/90 shadow-sm">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start">
        <div className={`${compact ? "md:w-24" : "md:w-28"} shrink-0`}>
          <div className="aspect-[4/5] overflow-hidden rounded-xl bg-muted/50">
            {card.portrait_url ? (
              <img
                src={card.portrait_url}
                alt={card.name}
                className="h-full w-full object-cover grayscale"
                loading="lazy"
              />
            ) : null}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {label}
            </span>
            <h3 className="text-lg font-semibold text-foreground">{card.name}</h3>
          </div>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.hook}</p>
          <p className="mt-3 text-sm leading-6 text-foreground">{card.reason}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {card.resonance_axes.map((axis) => (
              <span
                key={axis}
                className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {axis}
              </span>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-muted/35 p-3">
            <p className="text-sm leading-6 text-foreground">{displayQuote}</p>
          </div>

          {!compact ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("common.copa.resonance.biography", "Biography")}
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground">{card.bio_zh || card.bio_en}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("common.copa.resonance.achievements", "Key achievements")}
                </p>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-foreground">
                  {(card.achievements_zh.length > 0 ? card.achievements_zh : card.achievements_en).map((item) => (
                    <li key={item} className="rounded-lg border border-border/40 bg-background/70 px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
