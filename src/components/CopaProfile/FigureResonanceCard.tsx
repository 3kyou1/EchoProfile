import { useTranslation } from "react-i18next";

import type { FigureResonanceCard as FigureResonanceCardType } from "@/types/figureResonance";

interface FigureResonanceCardProps {
  card: FigureResonanceCardType;
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

function normalizeNameLanguage(language: string): "zh" | "en" {
  const normalized = language.toLowerCase();
  if (normalized.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

function buildWikipediaUrl(language: "zh" | "en", title: string): string {
  const host = language === "en" ? "en.wikipedia.org" : `${language}.wikipedia.org`;
  return `https://${host}/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
}

function splitBiography(value: string): string[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  const parts = normalized
    .split(/(?<=[。！？.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [normalized];
}

export function FigureResonanceCard({ card, label, compact = false }: FigureResonanceCardProps) {
  const { t, i18n } = useTranslation();
  const activeLanguage = normalizeNameLanguage(i18n.resolvedLanguage || i18n.language || "en");
  const englishName = card.name;
  const localizedName =
    activeLanguage === "en" ? englishName : card.localized_names?.[activeLanguage] || englishName;
  const secondaryName = localizedName !== englishName ? englishName : "";
  const activeBiography = activeLanguage === "zh" ? card.bio_zh || card.bio_en : card.bio_en || card.bio_zh;
  const activeAchievements =
    activeLanguage === "zh"
      ? card.achievements_zh.length > 0
        ? card.achievements_zh
        : card.achievements_en
      : card.achievements_en.length > 0
        ? card.achievements_en
        : card.achievements_zh;
  const activeQuote =
    activeLanguage === "zh" ? normalizeDisplayQuote(card.quote_zh || card.quote_en) : normalizeDisplayQuote(card.quote_en || card.quote_zh);
  const biography = splitBiography(activeBiography);
  const wikipediaTitle =
    activeLanguage === "en" ? englishName : card.localized_names?.[activeLanguage] || englishName;
  const wikipediaUrl = buildWikipediaUrl(activeLanguage, wikipediaTitle);

  return (
    <article className="overflow-hidden rounded-2xl border border-border/60 bg-card/90 shadow-sm">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start">
        <div className={`${compact ? "md:w-24" : "md:w-28"} shrink-0`}>
          <div className="aspect-[4/5] overflow-hidden rounded-xl bg-muted/50">
            {card.portrait_url ? (
              <img
                src={card.portrait_url}
                alt={card.name}
                className="h-full w-full object-cover"
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
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-foreground">{localizedName}</h3>
              {secondaryName ? (
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">{secondaryName}</p>
              ) : null}
            </div>
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
            <p className="text-sm leading-6 text-foreground">{activeQuote}</p>
          </div>

          {compact ? (
            <a
              href={wikipediaUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex w-fit items-center rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              {t("common.copa.resonance.wikipedia", "Wikipedia")}
            </a>
          ) : null}

          {!compact ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className="flex h-full flex-col rounded-xl border border-border/50 bg-background/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("common.copa.resonance.biography", "Biography")}
                </p>
                <div className="mt-2 flex-1 space-y-2">
                  {biography.map((paragraph, index) => (
                    <p key={`${card.slug}-bio-${index}`} className="text-sm leading-6 text-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
                <a
                  href={wikipediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex w-fit items-center rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  {t("common.copa.resonance.wikipedia", "Wikipedia")}
                </a>
              </section>
              <section className="flex h-full flex-col rounded-xl border border-border/50 bg-background/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("common.copa.resonance.achievements", "Key achievements")}
                </p>
                <ul className="mt-2 grid flex-1 content-start gap-2 text-sm leading-6 text-foreground sm:grid-cols-2">
                  {activeAchievements.map((item) => (
                    <li key={item} className="rounded-lg border border-border/40 bg-background/70 px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
