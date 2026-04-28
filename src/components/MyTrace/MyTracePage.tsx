import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Camera,
  Cloud,
  Fingerprint,
  Hash,
  Loader2,
  MessageSquareText,
  Search,
} from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { toast } from "sonner";

import { ScreenshotPreviewModal } from "@/components/MessageViewer/components/ScreenshotPreviewModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import type { ClaudeMessage, ClaudeProject, ClaudeSession } from "@/types";
import { cn } from "@/lib/utils";
import { formatDateDivider, formatTimeShort } from "@/utils/time";
import { useCapturePreview } from "@/hooks/useCapturePreview";
import {
  buildUserTraceItems,
  computeWordFrequency,
  tokenizeTraceText,
  type UserTraceItem,
} from "./myTraceUtils";

type TraceScope = "global" | "project" | "session";

interface TraceItemWithSession extends UserTraceItem {
  session?: ClaudeSession;
}

interface TraceStats {
  messageCount: number;
  wordCount: number;
  uniqueTerms: number;
  activeDays: number;
}

const MAX_RENDERED_TRACE_ITEMS = 300;

async function loadSessionsForProject(project: ClaudeProject, excludeSidechain: boolean) {
  const provider = project.provider ?? "claude";
  return provider !== "claude"
    ? api<ClaudeSession[]>("load_provider_sessions", {
        provider,
        projectPath: project.path,
        excludeSidechain,
      })
    : api<ClaudeSession[]>("load_project_sessions", {
        projectPath: project.path,
        excludeSidechain,
      });
}

async function loadMessagesForSession(session: ClaudeSession, excludeSidechain: boolean) {
  return api<ClaudeMessage[]>("load_provider_messages", {
    provider: session.provider ?? "claude",
    sessionPath: session.file_path,
    excludeSidechain,
  });
}

export function MyTracePage() {
  const { t } = useTranslation();
  const {
    projects,
    selectedProject,
    selectedSession,
    excludeSidechain,
    selectSession,
    setAnalyticsCurrentView,
  } = useAppStore();
  const [scope, setScope] = useState<TraceScope>(selectedProject ? "project" : "global");
  const [items, setItems] = useState<TraceItemWithSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const captureRef = useRef<HTMLDivElement>(null);
  const {
    previewDataUrl,
    previewWidth,
    previewHeight,
    captureAndPreview,
    savePreview,
    discardPreview,
  } = useCapturePreview();

  const loadTrace = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      let scopeSessions: ClaudeSession[] = [];
      if (scope === "session") {
        scopeSessions = selectedSession ? [selectedSession] : [];
      } else if (scope === "project") {
        scopeSessions = selectedProject
          ? await loadSessionsForProject(selectedProject, excludeSidechain)
          : [];
      } else {
        const groups = await Promise.all(
          projects.map((project) => loadSessionsForProject(project, excludeSidechain)),
        );
        scopeSessions = groups.flat();
      }

      const messageGroups = await Promise.all(
        scopeSessions.map(async (session) => ({
          session,
          messages: await loadMessagesForSession(session, true),
        })),
      );

      const nextItems = messageGroups.flatMap(({ session, messages }) =>
        buildUserTraceItems(messages, session).map((item) => ({
          ...item,
          session,
        })),
      );

      setItems(nextItems.sort((left, right) => right.timestamp.localeCompare(left.timestamp)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [excludeSidechain, projects, scope, selectedProject, selectedSession]);

  useEffect(() => {
    void loadTrace();
  }, [loadTrace]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return items;
    }

    return items.filter((item) => item.text.toLowerCase().includes(needle));
  }, [items, query]);

  const wordFrequency = useMemo(
    () => computeWordFrequency(filteredItems, 60),
    [filteredItems],
  );

  const stats = useMemo<TraceStats>(() => {
    const activeDays = new Set(
      filteredItems.map((item) => item.timestamp.slice(0, 10)).filter(Boolean),
    ).size;
    const wordCount = filteredItems.reduce(
      (total, item) => total + tokenizeTraceText(item.text).length,
      0,
    );

    return {
      messageCount: filteredItems.length,
      wordCount,
      uniqueTerms: wordFrequency.length,
      activeDays,
    };
  }, [filteredItems, wordFrequency.length]);

  const visibleItems = filteredItems.slice(0, MAX_RENDERED_TRACE_ITEMS);

  const handleOpenSession = async (item: TraceItemWithSession) => {
    if (!item.session) return;
    await selectSession(item.session);
    setAnalyticsCurrentView("messages");
  };

  const handleCapture = async () => {
    const target = captureRef.current;
    if (!target) return;
    const result = await captureAndPreview(target, "my-trace");
    if (!result.success && result.message) {
      toast.error(result.message);
    }
  };

  return (
    <div className="h-full bg-background">
      <OverlayScrollbarsComponent
        className="h-full"
        options={{
          scrollbars: {
            theme: "os-theme-custom",
            autoHide: "leave",
          },
        }}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4 p-3 md:p-6">
          <section className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
            <div className="relative p-5 md:p-7">
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,hsl(var(--accent)/0.18),transparent_34%),linear-gradient(135deg,hsl(var(--muted)/0.36),transparent_42%)]" />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                    <Fingerprint className="h-3.5 w-3.5" />
                    {t("common.myTrace.badge", "User-only trace")}
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                      {t("common.myTrace.title", "My Trace")}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      {t(
                        "common.myTrace.description",
                        "Review your own prompts, questions, and thinking traces across AI conversations.",
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex rounded-xl border border-border/70 bg-background/70 p-1">
                    {(["global", "project", "session"] as const).map((candidate) => {
                      const disabled =
                        (candidate === "project" && !selectedProject) ||
                        (candidate === "session" && !selectedSession);
                      return (
                        <button
                          key={candidate}
                          type="button"
                          disabled={disabled}
                          onClick={() => setScope(candidate)}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                            scope === candidate
                              ? "bg-accent text-accent-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            disabled && "cursor-not-allowed opacity-40",
                          )}
                        >
                          {t(`common.myTrace.scope.${candidate}`, candidate)}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCapture}
                    disabled={filteredItems.length === 0}
                  >
                    <Camera className="h-4 w-4" />
                    {t("common.myTrace.capture", "Capture analysis")}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <div ref={captureRef} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <main className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("common.myTrace.search", "Search your prompts...")}
                    className="pl-9"
                  />
                </div>
              </div>

              {isLoading ? (
                <TraceState
                  icon={<Loader2 className="h-6 w-6 animate-spin text-accent" />}
                  title={t("common.myTrace.loading", "Loading your trace")}
                  description={t("common.myTrace.loadingDescription", "Collecting user messages from local history.")}
                />
              ) : error ? (
                <TraceState
                  icon={<Fingerprint className="h-6 w-6 text-destructive" />}
                  title={t("common.myTrace.error", "Could not load My Trace")}
                  description={error}
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadTrace()}>
                      {t("common.retry", "Retry")}
                    </Button>
                  }
                />
              ) : visibleItems.length === 0 ? (
                <TraceState
                  icon={<MessageSquareText className="h-6 w-6 text-muted-foreground" />}
                  title={t("common.myTrace.empty", "No user messages found")}
                  description={t("common.myTrace.emptyDescription", "Try another scope or clear the search filter.")}
                />
              ) : (
                <TraceList items={visibleItems} totalCount={filteredItems.length} onOpenSession={handleOpenSession} />
              )}
            </main>

            <aside className="space-y-4">
              <StatsGrid stats={stats} />
              <WordCloud words={wordFrequency.slice(0, 36)} />
              <TopWords words={wordFrequency.slice(0, 12)} />
            </aside>
          </div>
        </div>
      </OverlayScrollbarsComponent>

      {previewDataUrl && (
        <ScreenshotPreviewModal
          dataUrl={previewDataUrl}
          width={previewWidth}
          height={previewHeight}
          onSave={() => void savePreview()}
          onClose={discardPreview}
        />
      )}
    </div>
  );
}

function TraceList({
  items,
  totalCount,
  onOpenSession,
}: {
  items: TraceItemWithSession[];
  totalCount: number;
  onOpenSession: (item: TraceItemWithSession) => void;
}) {
  const { t } = useTranslation();
  const grouped = useMemo(() => {
    return items.reduce<Array<{ date: string; items: TraceItemWithSession[] }>>((groups, item) => {
      const date = item.timestamp.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last?.date === date) {
        last.items.push(item);
      } else {
        groups.push({ date, items: [item] });
      }
      return groups;
    }, []);
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {t("common.myTrace.showing", "Showing {{shown}} of {{total}} prompts", {
            shown: items.length,
            total: totalCount,
          })}
        </span>
      </div>
      {grouped.map((group) => (
        <section key={group.date} className="space-y-3">
          <div className="sticky top-0 z-10 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDateDivider(group.items[0]?.timestamp ?? group.date)}
          </div>
          <div className="space-y-3">
            {group.items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-colors hover:border-accent/35"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatTimeShort(item.timestamp)}</span>
                  {item.sessionTitle && <span className="truncate">/ {item.sessionTitle}</span>}
                  {item.provider && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium uppercase tracking-wide">
                      {item.provider}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{item.text}</p>
                {item.session && (
                  <button
                    type="button"
                    onClick={() => onOpenSession(item)}
                    className="mt-3 text-xs font-medium text-accent hover:underline"
                  >
                    {t("common.myTrace.openSession", "Open original session")}
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function StatsGrid({ stats }: { stats: TraceStats }) {
  const { t } = useTranslation();
  const cards = [
    { label: t("common.myTrace.stats.prompts", "Prompts"), value: stats.messageCount, icon: MessageSquareText },
    { label: t("common.myTrace.stats.words", "Words"), value: stats.wordCount, icon: Hash },
    { label: t("common.myTrace.stats.terms", "Terms"), value: stats.uniqueTerms, icon: Cloud },
    { label: t("common.myTrace.stats.days", "Days"), value: stats.activeDays, icon: CalendarDays },
  ];

  return (
    <section className="grid grid-cols-2 gap-3">
      {cards.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <Icon className="mb-3 h-4 w-4 text-accent" />
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {value.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      ))}
    </section>
  );
}

function WordCloud({ words }: { words: Array<{ term: string; count: number }> }) {
  const { t } = useTranslation();
  const max = Math.max(...words.map((word) => word.count), 1);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Cloud className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">
          {t("common.myTrace.wordCloud", "Word cloud")}
        </h2>
      </div>
      <div className="flex min-h-44 flex-wrap items-center justify-center gap-x-4 gap-y-3 rounded-xl bg-muted/35 p-4">
        {words.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("common.myTrace.noWords", "No terms yet")}
          </p>
        ) : (
          words.map((word, index) => {
            const scale = word.count / max;
            const size = 12 + Math.round(scale * 22);
            return (
              <span
                key={word.term}
                className={cn(
                  "font-semibold leading-none",
                  index % 3 === 0 ? "text-accent" : index % 3 === 1 ? "text-foreground" : "text-muted-foreground",
                )}
                style={{ fontSize: `${size}px` }}
                title={`${word.term}: ${word.count}`}
              >
                {word.term}
              </span>
            );
          })
        )}
      </div>
    </section>
  );
}

function TopWords({ words }: { words: Array<{ term: string; count: number }> }) {
  const { t } = useTranslation();
  const max = Math.max(...words.map((word) => word.count), 1);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Hash className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">
          {t("common.myTrace.topWords", "Top words")}
        </h2>
      </div>
      <div className="space-y-3">
        {words.map((word) => (
          <div key={word.term} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium text-foreground">{word.term}</span>
              <span className="tabular-nums text-muted-foreground">{word.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(8, (word.count / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TraceState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
        {icon}
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
