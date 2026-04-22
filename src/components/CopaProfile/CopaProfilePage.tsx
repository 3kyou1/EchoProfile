import { useEffect, useMemo, useState } from "react";
import { Brain, Download, Loader2, Sparkles } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { api } from "@/services/api";
import { saveFileDialog } from "@/utils/fileDialog";
import { useAppStore } from "@/store/useAppStore";
import type { ClaudeMessage, ClaudeProject, ClaudeSession } from "@/types";
import { CopaFactorCard } from "./CopaFactorCard";
import {
  DEFAULT_COPA_MODEL_CONFIG,
  buildScopeKey,
  createSnapshot,
  extractUserSignals,
  loadCopaConfig,
  loadCopaSnapshots,
  requestCopaProfile,
  saveCopaConfig,
  saveCopaSnapshot,
} from "@/services/copaProfileService";
import type { CopaModelConfig, CopaSnapshot, CopaScopeType } from "@/types/copaProfile";

const MAX_PROMPT_SIGNALS = 300;

function dedupeProviders(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function providerLabel(t: TFunction, provider: string): string {
  return t(`common.provider.${provider}`, { defaultValue: provider });
}

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

async function loadMessagesForSession(session: ClaudeSession) {
  return api<ClaudeMessage[]>("load_provider_messages", {
    provider: session.provider ?? "claude",
    sessionPath: session.file_path,
  });
}

export function CopaProfilePage() {
  const { t } = useTranslation();
  const { projects, selectedProject, selectedSession, activeProviders, excludeSidechain } = useAppStore();

  const providerOptions = useMemo(
    () => dedupeProviders(projects.map((project) => project.provider ?? "claude")),
    [projects]
  );

  const [scopeType, setScopeType] = useState<CopaScopeType>("global");
  const [projectPath, setProjectPath] = useState("");
  const [sessionPath, setSessionPath] = useState("");
  const [sessionsForScope, setSessionsForScope] = useState<ClaudeSession[]>([]);
  const [providerScope, setProviderScope] = useState<string[]>([]);
  const [config, setConfig] = useState<CopaModelConfig>(DEFAULT_COPA_MODEL_CONFIG);
  const [snapshots, setSnapshots] = useState<CopaSnapshot[]>([]);
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string>("");
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setProjectPath((current) => current || selectedProject?.path || projects[0]?.path || "");
    setSessionPath((current) => current || selectedSession?.file_path || "");
    setProviderScope((current) =>
      current.length > 0 ? current : activeProviders.length > 0 ? [...activeProviders] : providerOptions
    );
  }, [activeProviders, projects, providerOptions, selectedProject?.path, selectedSession?.file_path]);

  useEffect(() => {
    void loadCopaConfig().then(setConfig);
    void loadCopaSnapshots().then(setSnapshots);
  }, []);

  const selectedProjectForScope = useMemo(
    () => projects.find((project) => project.path === projectPath) ?? null,
    [projectPath, projects]
  );

  useEffect(() => {
    if (scopeType !== "session" || !selectedProjectForScope) {
      if (scopeType !== "session") {
        setSessionsForScope([]);
      }
      return;
    }

    let cancelled = false;
    setIsLoadingSessions(true);
    setError("");

    void loadSessionsForProject(selectedProjectForScope, excludeSidechain)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setSessionsForScope(result);
        if (!result.some((session) => session.file_path === sessionPath)) {
          setSessionPath(result[0]?.file_path ?? "");
        }
      })
      .catch((sessionError) => {
        if (!cancelled) {
          setError(sessionError instanceof Error ? sessionError.message : String(sessionError));
          setSessionsForScope([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSessions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [excludeSidechain, scopeType, selectedProjectForScope, sessionPath]);

  const currentScopeKey = useMemo(() => {
    if (scopeType === "project" && projectPath) {
      return buildScopeKey({ type: "project", ref: projectPath });
    }
    if (scopeType === "session" && sessionPath) {
      return buildScopeKey({ type: "session", ref: sessionPath });
    }
    return buildScopeKey({
      type: "global",
      ref: "global",
      providerScope,
    });
  }, [projectPath, providerScope, scopeType, sessionPath]);

  const visibleSnapshots = useMemo(
    () => snapshots.filter((snapshot) => snapshot.scope.key === currentScopeKey),
    [currentScopeKey, snapshots]
  );

  useEffect(() => {
    if (visibleSnapshots.length === 0) {
      setCurrentSnapshotId("");
      return;
    }

    const firstVisibleSnapshot = visibleSnapshots[0];
    if (firstVisibleSnapshot && !visibleSnapshots.some((snapshot) => snapshot.id === currentSnapshotId)) {
      setCurrentSnapshotId(firstVisibleSnapshot.id);
    }
  }, [currentSnapshotId, visibleSnapshots]);

  const currentSnapshot = useMemo(
    () => visibleSnapshots.find((snapshot) => snapshot.id === currentSnapshotId) ?? visibleSnapshots[0] ?? null,
    [currentSnapshotId, visibleSnapshots]
  );

  const selectedSessionForScope = useMemo(
    () => sessionsForScope.find((session) => session.file_path === sessionPath) ?? null,
    [sessionPath, sessionsForScope]
  );

  const handleConfigChange = <K extends keyof CopaModelConfig>(key: K, value: CopaModelConfig[K]) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    void saveCopaConfig(next);
  };

  const toggleProvider = (provider: string) => {
    setProviderScope((current) => {
      const next = current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider];
      return next.length > 0 ? dedupeProviders(next) : providerOptions;
    });
  };

  const buildScopeLabel = () => {
    if (scopeType === "project" && selectedProjectForScope) {
      return selectedProjectForScope.name;
    }
    if (scopeType === "session" && selectedSessionForScope) {
      return selectedSessionForScope.summary || selectedSessionForScope.actual_session_id;
    }
    if (scopeType === "global") {
      return providerScope.length > 0
        ? t("common.copa.scope.globalFiltered", "Global history (filtered)")
        : t("common.copa.scope.global", "Global history");
    }
    return t("common.unknown");
  };

  const collectScopeMessages = async () => {
    const allMessages: ClaudeMessage[] = [];

    if (scopeType === "session") {
      if (!selectedSessionForScope) {
        throw new Error(t("common.copa.error.selectSession", "Select a session first."));
      }

      allMessages.push(...(await loadMessagesForSession(selectedSessionForScope)));
      return {
        scopeRef: selectedSessionForScope.file_path,
        scopeLabel: buildScopeLabel(),
        providerScope: dedupeProviders([selectedSessionForScope.provider ?? "claude"]),
        projectCount: 1,
        sessionCount: 1,
        messages: allMessages.sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
      };
    }

    if (scopeType === "project") {
      if (!selectedProjectForScope) {
        throw new Error(t("common.copa.error.selectProject", "Select a project first."));
      }

      const sessions = await loadSessionsForProject(selectedProjectForScope, excludeSidechain);
      const messageGroups = await Promise.all(sessions.map((session) => loadMessagesForSession(session)));
      messageGroups.forEach((group) => allMessages.push(...group));

      return {
        scopeRef: selectedProjectForScope.path,
        scopeLabel: buildScopeLabel(),
        providerScope: dedupeProviders([selectedProjectForScope.provider ?? "claude"]),
        projectCount: 1,
        sessionCount: sessions.length,
        messages: allMessages.sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
      };
    }

    const filteredProjects =
      providerScope.length > 0
        ? projects.filter((project) => providerScope.includes(project.provider ?? "claude"))
        : projects;

    const sessionGroups = await Promise.all(
      filteredProjects.map((project) => loadSessionsForProject(project, excludeSidechain))
    );
    const flatSessions = sessionGroups.flat();
    const messageGroups = await Promise.all(flatSessions.map((session) => loadMessagesForSession(session)));
    messageGroups.forEach((group) => allMessages.push(...group));

    return {
      scopeRef: "global",
      scopeLabel: buildScopeLabel(),
      providerScope:
        providerScope.length > 0
          ? dedupeProviders(providerScope)
          : dedupeProviders(filteredProjects.map((project) => project.provider ?? "claude")),
      projectCount: filteredProjects.length,
      sessionCount: flatSessions.length,
      messages: allMessages.sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
    };
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError("");

    try {
      const collected = await collectScopeMessages();
      const extracted = extractUserSignals(collected.messages);
      const limitedSignals =
        extracted.messages.length > MAX_PROMPT_SIGNALS
          ? extracted.messages.slice(-MAX_PROMPT_SIGNALS)
          : extracted.messages;
      const overflowCount = Math.max(0, extracted.messages.length - limitedSignals.length);

      if (limitedSignals.length === 0) {
        throw new Error(t("common.copa.error.noSignals", "No user messages were found in the selected scope."));
      }

      await saveCopaConfig(config);
      const result = await requestCopaProfile(limitedSignals, config);
      const snapshot = createSnapshot({
        scope: {
          type: scopeType,
          ref: collected.scopeRef,
          label: collected.scopeLabel,
          key: buildScopeKey({
            type: scopeType,
            ref: collected.scopeRef,
            providerScope: collected.providerScope,
          }),
        },
        providerScope: collected.providerScope,
        sourceStats: {
          projectCount: collected.projectCount,
          sessionCount: collected.sessionCount,
          rawUserMessages: extracted.stats.userMessages,
          dedupedUserMessages: extracted.stats.dedupedMessages,
          truncatedMessages: extracted.stats.truncatedMessages + overflowCount,
        },
        modelConfig: {
          baseUrl: config.baseUrl,
          model: config.model,
          temperature: config.temperature,
        },
        promptSummary: result.promptSummary,
        factors: result.factors,
      });

      const stored = await saveCopaSnapshot(snapshot);
      setSnapshots(stored);
      setCurrentSnapshotId(snapshot.id);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportJson = async () => {
    if (!currentSnapshot) {
      return;
    }

    await saveFileDialog(JSON.stringify(currentSnapshot, null, 2), {
      defaultPath: `copa-profile-${currentSnapshot.id}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
      mimeType: "application/json",
    });
  };

  const handleExportMarkdown = async () => {
    if (!currentSnapshot) {
      return;
    }

    await saveFileDialog(currentSnapshot.markdown, {
      defaultPath: `copa-profile-${currentSnapshot.id}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
      mimeType: "text/markdown",
    });
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6">
        <section className="rounded-3xl border border-border/60 bg-[linear-gradient(135deg,rgba(22,163,74,0.12),rgba(255,255,255,0.92))] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                <Brain className="h-3.5 w-3.5" />
                {t("common.copa.badge", "User-only inference")}
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                {t("common.copa.title", "CoPA Profile")}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                {t(
                  "common.copa.description",
                  "Generate a factor-based CoPA profile from historical user messages across a session, a project, or your full history."
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportMarkdown()}
                disabled={!currentSnapshot}
                className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {t("common.copa.exportMarkdown", "Export Markdown")}
              </button>
              <button
                type="button"
                onClick={() => void handleExportJson()}
                disabled={!currentSnapshot}
                className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {t("common.copa.exportJson", "Export JSON")}
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating || projects.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {t("common.copa.generate", "Generate Profile")}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-border/60 bg-card/85 p-5 shadow-sm">
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("common.copa.scope.label", "Scope")}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(["session", "project", "global"] as CopaScopeType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setScopeType(type)}
                        className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                          scopeType === type
                            ? "border-foreground bg-foreground text-background"
                            : "border-border/70 bg-background text-foreground"
                        }`}
                      >
                        {t(`common.copa.scope.${type}`, type)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {(scopeType === "project" || scopeType === "session") && (
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t("common.copa.project", "Project")}
                      </span>
                      <select
                        value={projectPath}
                        onChange={(event) => setProjectPath(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground"
                      >
                        {projects.map((project) => (
                          <option key={project.path} value={project.path}>
                            {project.name} · {providerLabel(t, project.provider ?? "claude")}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {scopeType === "session" && (
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t("common.copa.session", "Session")}
                      </span>
                      <select
                        value={sessionPath}
                        onChange={(event) => setSessionPath(event.target.value)}
                        disabled={isLoadingSessions || sessionsForScope.length === 0}
                        className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {sessionsForScope.map((session) => (
                          <option key={session.file_path} value={session.file_path}>
                            {session.summary || session.actual_session_id}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {scopeType === "global" && (
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t("common.copa.providers", "Providers")}
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {providerOptions.map((provider) => {
                          const active = providerScope.includes(provider);
                          return (
                            <button
                              key={provider}
                              type="button"
                              onClick={() => toggleProvider(provider)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                active
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border/70 bg-background text-foreground"
                              }`}
                            >
                              {providerLabel(t, provider)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("common.copa.baseUrl", "Base URL")}
                  </span>
                  <input
                    value={config.baseUrl}
                    onChange={(event) => handleConfigChange("baseUrl", event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("common.copa.model", "Model")}
                  </span>
                  <input
                    value={config.model}
                    onChange={(event) => handleConfigChange("model", event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("common.copa.apiKey", "API key")}
                  </span>
                  <input
                    type="password"
                    value={config.apiKey ?? ""}
                    onChange={(event) => handleConfigChange("apiKey", event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground"
                  />
                </label>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {currentSnapshot ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-border/60 bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t("common.copa.summary.scope", "Scope")}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{currentSnapshot.scope.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{currentSnapshot.createdAt}</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t("common.copa.summary.sessions", "Sessions")}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{currentSnapshot.sourceStats.sessionCount}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {currentSnapshot.sourceStats.rawUserMessages} {t("common.copa.summary.userMessages", "user messages")}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t("common.copa.summary.providers", "Providers")}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {currentSnapshot.providerScope.map((provider) => providerLabel(t, provider)).join(", ")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{currentSnapshot.modelConfig.model}</p>
                  </div>
                </div>

                <section className="rounded-3xl border border-border/60 bg-card/90 p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("common.copa.promptSummary", "Prompt summary")}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-foreground">{currentSnapshot.promptSummary}</p>
                </section>

                <section className="grid gap-4 xl:grid-cols-2">
                  {Object.values(currentSnapshot.factors).map((factor) => (
                    <CopaFactorCard key={factor.code} factor={factor} />
                  ))}
                </section>
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/70 bg-card/60 p-8 text-center">
                <Brain className="mx-auto h-10 w-10 text-muted-foreground/60" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {t("common.copa.empty.title", "No CoPA Profile yet")}
                </h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
                  {t(
                    "common.copa.empty.description",
                    "Choose a scope, confirm the model settings, and generate a CoPA Profile from user-only history."
                  )}
                </p>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-border/60 bg-card/90 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground">
                {t("common.copa.history", "Profile history")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t(
                  "common.copa.historyDescription",
                  "Every generation is stored as a new Profile version for the current scope."
                )}
              </p>

              <div className="mt-4 space-y-2">
                {visibleSnapshots.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                    {t("common.copa.historyEmpty", "No Profiles for this scope yet.")}
                  </p>
                ) : (
                  visibleSnapshots.map((snapshot) => (
                    <button
                      key={snapshot.id}
                      type="button"
                      onClick={() => setCurrentSnapshotId(snapshot.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                        currentSnapshot?.id === snapshot.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/70 bg-background text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">{snapshot.scope.label}</span>
                        <span className="text-[11px] opacity-80">{snapshot.createdAt.slice(0, 16).replace("T", " ")}</span>
                      </div>
                      <p className={`mt-2 text-xs leading-5 ${currentSnapshot?.id === snapshot.id ? "text-background/80" : "text-muted-foreground"}`}>
                        {snapshot.promptSummary}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}
