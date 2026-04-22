import type { CopaFactor } from "@/types/copaProfile";

interface CopaFactorCardProps {
  factor: CopaFactor;
}

export function CopaFactorCard({ factor }: CopaFactorCardProps) {
  return (
    <article className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{factor.title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{factor.description}</p>
        </div>
        <span className="rounded-full border border-border/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {factor.code}
        </span>
      </div>

      <div className="mt-4 rounded-xl bg-muted/35 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          User profile
        </p>
        <p className="mt-2 text-sm leading-6 text-foreground">{factor.user_profile_description}</p>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Response strategy
        </p>
        <ul className="mt-2 space-y-2 text-sm leading-6 text-foreground">
          {factor.response_strategy.map((item) => (
            <li key={item} className="rounded-lg border border-border/40 bg-background/70 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
