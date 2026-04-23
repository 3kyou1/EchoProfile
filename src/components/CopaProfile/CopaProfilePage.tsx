import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Download, LibraryBig, Loader2, RefreshCw, Settings2, Sparkles, Trash2, X } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { api } from "@/services/api";
import { openBinaryFileDialog, saveBinaryFileDialog, saveFileDialog } from "@/utils/fileDialog";
import { useAppStore } from "@/store/useAppStore";
import type { ClaudeMessage, ClaudeProject, ClaudeSession } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CopaFactorCard } from "./CopaFactorCard";
import { FigurePoolManager } from "./FigurePoolManager";
import { FigureResonanceCard } from "./FigureResonanceCard";
import {
  DEFAULT_COPA_LLM_CONFIG,
  buildScopeKey,
  createSnapshot,
  extractUserSignals,
  loadCopaConfig,
  loadCopaSnapshots,
  requestCopaProfile,
  resolveCopaModelConfig,
  resolveResonanceModelConfig,
  saveCopaConfig,
  saveCopaSnapshot,
  deleteCopaSnapshot,
} from "@/services/copaProfileService";
import type { CopaLlmConfigState, CopaModelConfig, CopaSnapshot, CopaScopeType } from "@/types/copaProfile";
import type { FigureResonanceResult } from "@/types/figureResonance";
import {
  deleteFigureResonanceResultsForProfile,
  generateFigureResonance,
  loadFigureResonanceHistory,
} from "@/services/figureResonanceService";
import type { FigurePool, FigureRecordInput } from "@/types/figurePool";
import {
  createFigureRecord,
  deleteFigurePool,
  deleteFigureRecord,
  exportFigurePoolToZip,
  importFigurePoolFromZip,
  inspectFigurePoolZip,
  loadFigurePools,
  renameFigurePool,
  setDefaultFigurePool,
  updateFigureRecord,
} from "@/services/figurePoolService";
import type { FigurePoolZipInspection } from "@/types/figurePool";

const MAX_PROMPT_SIGNALS = 300;
type CopaSubview = "profile" | "resonance" | "pools";

interface PendingFigurePoolImport {
  archive: Uint8Array;
  inspection: FigurePoolZipInspection;
}

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
  const { t, i18n } = useTranslation();
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
  const [activeSubview, setActiveSubview] = useState<CopaSubview>("profile");
  const [activeLlmConfigSection, setActiveLlmConfigSection] = useState<"copa" | "resonance">("copa");
  const [isLlmConfigOpen, setIsLlmConfigOpen] = useState(false);
  const [config, setConfig] = useState<CopaLlmConfigState>(DEFAULT_COPA_LLM_CONFIG);
  const [snapshots, setSnapshots] = useState<CopaSnapshot[]>([]);
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string>("");
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingResonance, setIsGeneratingResonance] = useState(false);
  const [error, setError] = useState("");
  const [resonanceError, setResonanceError] = useState("");
  const [resonanceResult, setResonanceResult] = useState<FigureResonanceResult | null>(null);
  const [resonanceHistory, setResonanceHistory] = useState<FigureResonanceResult[]>([]);
  const [figurePools, setFigurePools] = useState<FigurePool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [importSummaryPool, setImportSummaryPool] = useState<FigurePool | null>(null);
  const [pendingFigurePoolImport, setPendingFigurePoolImport] = useState<PendingFigurePoolImport | null>(null);
  const [pendingFigurePoolImportName, setPendingFigurePoolImportName] = useState("");
  const [figurePoolImportError, setFigurePoolImportError] = useState("");
  const llmConfigPanelRef = useRef<HTMLDivElement | null>(null);

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
    void loadFigurePools().then((pools) => {
      setFigurePools(pools);
      const defaultPool = pools.find((pool) => pool.isDefault) ?? pools[0] ?? null;
      setSelectedPoolId(defaultPool?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (!isLlmConfigOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (llmConfigPanelRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsLlmConfigOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLlmConfigOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLlmConfigOpen]);

  useEffect(() => {
    if (figurePools.length === 0) {
      setSelectedPoolId("");
      return;
    }

    if (!figurePools.some((pool) => pool.id === selectedPoolId)) {
      const defaultPool = figurePools.find((pool) => pool.isDefault) ?? figurePools[0] ?? null;
      setSelectedPoolId(defaultPool?.id ?? "");
    }
  }, [figurePools, selectedPoolId]);

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

  const selectedFigurePool = useMemo(
    () => figurePools.find((pool) => pool.id === selectedPoolId) ?? null,
    [figurePools, selectedPoolId]
  );

  const isInheritedResonanceConfig = activeLlmConfigSection === "resonance" && !config.resonance.enabled;
  const activeLlmModelConfig =
    activeLlmConfigSection === "copa"
      ? config.copa
      : config.resonance.enabled
        ? config.resonance.config
        : resolveCopaModelConfig(config);

  useEffect(() => {
    if (!currentSnapshot) {
      setResonanceResult(null);
      setResonanceHistory([]);
      setResonanceError("");
      return;
    }

    let cancelled = false;
    setResonanceError("");
    void loadFigureResonanceHistory({
      scopeKey: currentScopeKey,
      profileId: currentSnapshot.id,
      language: i18n.resolvedLanguage || i18n.language || "zh",
    }).then((results) => {
      if (!cancelled) {
        setResonanceHistory(results);
        const selectedResult =
          results.find((item) => item.pool_id === selectedPoolId) ?? results[0] ?? null;
        setResonanceResult(selectedResult);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentScopeKey, currentSnapshot, i18n.language, i18n.resolvedLanguage, selectedPoolId]);

  const selectedSessionForScope = useMemo(
    () => sessionsForScope.find((session) => session.file_path === sessionPath) ?? null,
    [sessionPath, sessionsForScope]
  );

  const persistConfig = (next: CopaLlmConfigState) => {
    setConfig(next);
    void saveCopaConfig(next);
  };

  const handleCopaConfigChange = <K extends keyof CopaModelConfig>(key: K, value: CopaModelConfig[K]) => {
    persistConfig({
      ...config,
      copa: {
        ...config.copa,
        [key]: value,
      },
    });
  };

  const handleResonanceConfigToggle = (enabled: boolean) => {
    persistConfig({
      ...config,
      resonance: {
        enabled,
        config: enabled && !config.resonance.enabled ? { ...resolveCopaModelConfig(config) } : config.resonance.config,
      },
    });
  };

  const handleResonanceConfigChange = <K extends keyof CopaModelConfig>(
    key: K,
    value: CopaModelConfig[K]
  ) => {
    persistConfig({
      ...config,
      resonance: {
        ...config.resonance,
        config: {
          ...config.resonance.config,
          [key]: value,
        },
      },
    });
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
      const result = await requestCopaProfile(limitedSignals, resolveCopaModelConfig(config));
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
          baseUrl: resolveCopaModelConfig(config).baseUrl,
          model: resolveCopaModelConfig(config).model,
          temperature: resolveCopaModelConfig(config).temperature,
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

  const handleGenerateResonance = async () => {
    if (!currentSnapshot) {
      setResonanceError(
        t("common.copa.resonance.error.noProfile", "Select or generate a CoPA Profile first.")
      );
      return;
    }
    if (!selectedFigurePool) {
      setResonanceError(
        t("common.copa.resonance.pool.error.noPool", "Select a figure pool before generating thought echoes.")
      );
      return;
    }

    setIsGeneratingResonance(true);
    setResonanceError("");

    try {
      const collected = await collectScopeMessages();
      const result = await generateFigureResonance({
        scopeKey: currentScopeKey,
        poolId: selectedFigurePool.id,
        profileSnapshot: currentSnapshot,
        recentMessages: extractUserSignals(collected.messages).messages,
        config: resolveResonanceModelConfig(config),
        language: i18n.resolvedLanguage || i18n.language || "zh",
      });
      setResonanceResult(result);
      setResonanceHistory((current) => [
        result,
        ...current.filter((item) => item.cache_key !== result.cache_key),
      ]);
    } catch (generationError) {
      setResonanceError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setIsGeneratingResonance(false);
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

  const handleDeleteSnapshot = async (snapshotId: string) => {
    const nextSnapshots = await deleteCopaSnapshot(snapshotId);
    await deleteFigureResonanceResultsForProfile(snapshotId);
    setSnapshots(nextSnapshots);
    if (currentSnapshotId === snapshotId) {
      const nextVisible = nextSnapshots.filter((snapshot) => snapshot.scope.key === currentScopeKey);
      setCurrentSnapshotId(nextVisible[0]?.id ?? "");
    }
  };

  const refreshFigurePools = async () => {
    const pools = await loadFigurePools();
    setFigurePools(pools);
    return pools;
  };

  const resetFigurePoolImportDialog = () => {
    setPendingFigurePoolImport(null);
    setPendingFigurePoolImportName("");
    setFigurePoolImportError("");
  };

  const completeFigurePoolImport = async (archive: Uint8Array, name?: string) => {
    const imported = await importFigurePoolFromZip(archive, name ? { name } : undefined);
    await refreshFigurePools();
    setImportSummaryPool(imported);
    setSelectedPoolId(imported.id);
    resetFigurePoolImportDialog();
  };

  const handleImportFigurePool = async () => {
    try {
      const archive = await openBinaryFileDialog({
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });

      if (!archive) {
        return;
      }

      const inspection = await inspectFigurePoolZip(archive);
      if (inspection.hasNameConflict) {
        setPendingFigurePoolImport({ archive, inspection });
        setPendingFigurePoolImportName(inspection.payload.name);
        setFigurePoolImportError("");
        return;
      }

      await completeFigurePoolImport(archive);
    } catch (figurePoolError) {
      setError(figurePoolError instanceof Error ? figurePoolError.message : String(figurePoolError));
    }
  };

  const handleExportFigurePool = async (poolId: string) => {
    const archive = await exportFigurePoolToZip(poolId);
    const poolName = figurePools.find((pool) => pool.id === poolId)?.name || "figure-pool";

    await saveBinaryFileDialog(archive, {
      defaultPath: `${poolName}.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
      mimeType: "application/zip",
    });
  };

  const handleConfirmFigurePoolImport = async () => {
    if (!pendingFigurePoolImport) {
      return;
    }

    try {
      await completeFigurePoolImport(
        pendingFigurePoolImport.archive,
        pendingFigurePoolImportName.trim()
      );
    } catch (figurePoolError) {
      setFigurePoolImportError(
        figurePoolError instanceof Error ? figurePoolError.message : String(figurePoolError)
      );
    }
  };

  const handleRenameFigurePool = async (poolId: string, name: string) => {
    await renameFigurePool(poolId, name);
    await refreshFigurePools();
  };

  const handleSetDefaultFigurePool = async (poolId: string) => {
    const pools = await setDefaultFigurePool(poolId);
    setFigurePools(pools);
    setSelectedPoolId(poolId);
  };

  const handleDeleteFigurePool = async (poolId: string) => {
    const pools = await deleteFigurePool(poolId);
    setFigurePools(pools);
    if (selectedPoolId === poolId) {
      setSelectedPoolId(pools.find((pool) => pool.isDefault)?.id ?? pools[0]?.id ?? "");
    }
  };

  const handleCreateFigureRecord = async (poolId: string, record: FigureRecordInput) => {
    await createFigureRecord(poolId, record);
    await refreshFigurePools();
  };

  const handleUpdateFigureRecord = async (
    poolId: string,
    slug: string,
    record: FigureRecordInput
  ) => {
    await updateFigureRecord(poolId, slug, record);
    await refreshFigurePools();
  };

  const handleDeleteFigureRecord = async (poolId: string, slug: string) => {
    await deleteFigureRecord(poolId, slug);
    await refreshFigurePools();
  };

  const formatSnapshotTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString(i18n.resolvedLanguage || i18n.language || "zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6">
        <section className="rounded-3xl border border-border/60 bg-[linear-gradient(135deg,rgba(22,163,74,0.12),rgba(255,255,255,0.92))] p-6 shadow-sm">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-8">
            <div className="max-w-3xl xl:min-w-0 xl:flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                <Brain className="h-3.5 w-3.5" />
                {t("common.copa.badge", "User-only inference")}
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                {t("common.copa.title", "CoPA Profile")}
              </h2>
              <p className="mt-3 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-6 text-muted-foreground">
                {activeSubview === "profile"
                  ? t(
                      "common.copa.description",
                      "Generate a factor-based CoPA profile from historical user messages across a session, a project, or your full history."
                    )
                  : activeSubview === "pools"
                    ? t(
                        "common.copa.resonance.pool.description",
                        "Manage reusable figure pools for Thought Echoes, including import, export, and record validation."
                      )
                  : t(
                      "common.copa.resonance.description",
                      "Map the currently selected CoPA Profile to long-term and recent-state figure mirrors."
                    )}
              </p>
            </div>

            <div className="w-full shrink-0 xl:ml-auto xl:w-auto xl:max-w-none">
              <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSubview("profile")}
                    className={`inline-flex items-center gap-2 rounded-2xl border border-border/60 px-4 py-1.5 text-sm font-medium shadow-sm transition-colors ${
                      activeSubview === "profile"
                        ? "bg-foreground text-background"
                        : "bg-background/80 text-foreground hover:bg-background"
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                    {t("common.copa.title", "CoPA Profile")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubview("resonance")}
                    className={`inline-flex items-center gap-2 rounded-2xl border border-border/60 px-4 py-1.5 text-sm font-medium shadow-sm transition-colors ${
                      activeSubview === "resonance"
                        ? "bg-foreground text-background"
                        : "bg-background/80 text-foreground hover:bg-background"
                    }`}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("common.copa.resonance.title", "Thought Echoes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubview("pools")}
                    className={`inline-flex items-center gap-2 rounded-2xl border border-border/60 px-4 py-1.5 text-sm font-medium shadow-sm transition-colors ${
                      activeSubview === "pools"
                        ? "bg-foreground text-background"
                        : "bg-background/80 text-foreground hover:bg-background"
                    }`}
                  >
                    <LibraryBig className="h-4 w-4" />
                    {t("common.copa.resonance.pool.title", "Figure Pools")}
                  </button>
                </div>

                <div ref={llmConfigPanelRef} className="relative shrink-0">
                  <button
                    type="button"
                    aria-label={
                      isLlmConfigOpen
                        ? t("common.copa.llmConfig.closeAria", "Close LLM settings")
                        : t("common.copa.llmConfig.openAria", "Open LLM settings")
                    }
                    aria-expanded={isLlmConfigOpen}
                    aria-controls="copa-llm-config-panel"
                    onClick={() => setIsLlmConfigOpen((current) => !current)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background"
                  >
                    {isLlmConfigOpen ? <X className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
                  </button>

                  {isLlmConfigOpen ? (
                    <div
                      id="copa-llm-config-panel"
                      role="dialog"
                      aria-label={t("common.copa.llmConfig.title", "LLM config")}
                      className="absolute right-0 top-full z-30 mt-3 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-popover/95 p-4 text-popover-foreground shadow-2xl backdrop-blur"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {t("common.copa.llmConfig.title", "LLM config")}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t(
                              "common.copa.llmConfig.description",
                              "Centralize CoPA and Thought Echoes model settings here."
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={t("common.copa.llmConfig.closeAria", "Close LLM settings")}
                          onClick={() => setIsLlmConfigOpen(false)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-foreground transition-colors hover:bg-background"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 p-1">
                        <button
                          type="button"
                          onClick={() => setActiveLlmConfigSection("copa")}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            activeLlmConfigSection === "copa"
                              ? "bg-foreground text-background"
                              : "text-foreground hover:bg-background"
                          }`}
                        >
                          {t("common.copa.llmConfig.copa", "CoPA config")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveLlmConfigSection("resonance")}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            activeLlmConfigSection === "resonance"
                              ? "bg-foreground text-background"
                              : "text-foreground hover:bg-background"
                          }`}
                        >
                          {t("common.copa.llmConfig.resonance", "Thought Echoes config")}
                        </button>
                      </div>

                      {activeLlmConfigSection === "resonance" ? (
                        <div className="mt-4">
                          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <input
                              type="checkbox"
                              checked={config.resonance.enabled}
                              onChange={(event) => handleResonanceConfigToggle(event.target.checked)}
                              className="h-4 w-4 rounded border-border/70"
                            />
                            {t("common.copa.llmConfig.resonance.toggle", "Use separate Thought Echoes config")}
                          </label>
                          {!config.resonance.enabled ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {t(
                                "common.copa.llmConfig.resonance.inherit",
                                "Thought Echoes will use the CoPA configuration until you enable a separate override."
                              )}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className={`mt-4 grid gap-3 ${isInheritedResonanceConfig ? "opacity-60" : ""}`}>
                        <label className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {t("common.copa.baseUrl", "Base URL")}
                          </span>
                          <input
                            value={activeLlmModelConfig.baseUrl}
                            onChange={(event) =>
                              activeLlmConfigSection === "copa"
                                ? handleCopaConfigChange("baseUrl", event.target.value)
                                : handleResonanceConfigChange("baseUrl", event.target.value)
                            }
                            disabled={isInheritedResonanceConfig}
                            className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {t("common.copa.model", "Model")}
                          </span>
                          <input
                            value={activeLlmModelConfig.model}
                            onChange={(event) =>
                              activeLlmConfigSection === "copa"
                                ? handleCopaConfigChange("model", event.target.value)
                                : handleResonanceConfigChange("model", event.target.value)
                            }
                            disabled={isInheritedResonanceConfig}
                            className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {t("common.copa.apiKey", "API key")}
                          </span>
                          <input
                            type="password"
                            value={activeLlmModelConfig.apiKey ?? ""}
                            onChange={(event) =>
                              activeLlmConfigSection === "copa"
                                ? handleCopaConfigChange("apiKey", event.target.value)
                                : handleResonanceConfigChange("apiKey", event.target.value)
                            }
                            disabled={isInheritedResonanceConfig}
                            className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        {activeSubview === "pools" ? (
          <section className="space-y-6">
            <FigurePoolManager
              pools={figurePools}
              selectedPoolId={selectedPoolId}
              importSummaryPool={importSummaryPool}
              onSelectPool={setSelectedPoolId}
              onImport={handleImportFigurePool}
              onExport={handleExportFigurePool}
              onRenamePool={handleRenameFigurePool}
              onSetDefault={handleSetDefaultFigurePool}
              onDeletePool={handleDeleteFigurePool}
              onCreateRecord={handleCreateFigureRecord}
              onUpdateRecord={handleUpdateFigureRecord}
              onDeleteRecord={handleDeleteFigureRecord}
            />
          </section>
        ) : (
          <section className="space-y-6">
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

              {activeSubview === "profile" ? (
                <div className="mt-6 rounded-2xl border border-border/60 bg-background/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t("common.copa.actions", "Actions")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {t(
                        "common.copa.actionsDescription",
                        "Export the selected CoPA Profile or regenerate it for the current scope."
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
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {t("common.copa.generateLong", "Generate CoPA Profile")}
                    </button>
                  </div>
                </div>
                </div>
              ) : null}
            </div>

            <section className="rounded-3xl border border-border/60 bg-card/90 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("common.copa.history", "Profile history")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t(
                      "common.copa.historyDescription",
                      "Every generation is stored as a new Profile version for the current scope."
                    )}
                  </p>
                </div>
                <div className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {visibleSnapshots.length}{" "}
                  {t("common.copa.historyCount", "Profiles")}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {visibleSnapshots.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                    {t("common.copa.historyEmpty", "No Profiles for this scope yet.")}
                  </p>
                ) : (
                  visibleSnapshots.map((snapshot, index) => (
                    <div
                      key={snapshot.id}
                      className={`rounded-2xl border transition-colors ${
                        currentSnapshot?.id === snapshot.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/70 bg-background text-foreground"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setCurrentSnapshotId(snapshot.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                currentSnapshot?.id === snapshot.id
                                  ? "bg-background/15 text-background"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              #{visibleSnapshots.length - index}
                            </span>
                            <span className="text-sm font-semibold">{snapshot.scope.label}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                currentSnapshot?.id === snapshot.id
                                  ? "bg-background/15 text-background/80"
                                  : "bg-background/80 text-muted-foreground"
                              }`}
                            >
                              {snapshot.sourceStats.rawUserMessages}{" "}
                              {t("common.copa.summary.userMessages", "user messages")}
                            </span>
                          </div>
                          <p
                            className={`mt-2 text-xs leading-5 ${
                              currentSnapshot?.id === snapshot.id ? "text-background/80" : "text-muted-foreground"
                            }`}
                          >
                            {snapshot.promptSummary}
                          </p>
                          <p
                            className={`mt-2 text-[11px] ${
                              currentSnapshot?.id === snapshot.id ? "text-background/70" : "text-muted-foreground"
                            }`}
                          >
                            {formatSnapshotTime(snapshot.createdAt)} · {snapshot.modelConfig.model}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDeleteSnapshot(snapshot.id)}
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                            currentSnapshot?.id === snapshot.id
                              ? "border-background/15 bg-background/10 text-background hover:bg-background/15"
                              : "border-border/70 bg-background/80 text-muted-foreground hover:bg-background"
                          }`}
                          aria-label={t("common.copa.deleteProfile", "Delete Profile")}
                          title={t("common.copa.deleteProfile", "Delete Profile")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {activeSubview === "profile" && error && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {activeSubview === "resonance" && resonanceError && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {resonanceError}
              </div>
            )}

            {currentSnapshot ? (
              <>
                {activeSubview === "profile" ? (
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
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {currentSnapshot.sourceStats.sessionCount}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {currentSnapshot.sourceStats.rawUserMessages}{" "}
                          {t("common.copa.summary.userMessages", "user messages")}
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
                  <section className="rounded-3xl border border-border/60 bg-card/90 p-4 shadow-sm">
                    <div className="max-w-2xl">
                      <h3 className="text-xl font-semibold text-foreground">
                        {t("common.copa.resonance.title", "Thought Echoes")}
                      </h3>
                    </div>

                    <div className="mt-3 rounded-2xl border border-border/60 bg-background/50 p-3">
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {t("common.copa.resonance.pool.select", "Figure pool")}
                          </p>
                          <select
                            value={selectedPoolId}
                            onChange={(event) => setSelectedPoolId(event.target.value)}
                            className="mt-2 h-12 w-full rounded-2xl border border-border/70 bg-background px-3 text-sm text-foreground"
                          >
                            {figurePools.map((pool) => (
                              <option key={pool.id} value={pool.id}>
                                {`${pool.name} (${pool.validationSummary.validCount} 可用 / ${pool.validationSummary.invalidCount} 无效)`}
                              </option>
                            ))}
                          </select>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {selectedFigurePool
                              ? t(
                                  "common.copa.resonance.pool.selectedHint",
                                  "{{name}} will be used for the next generation; invalid records are skipped automatically.",
                                  {
                                    name: selectedFigurePool.name,
                                    defaultValue: `${selectedFigurePool.name} will be used for the next generation; invalid records are skipped automatically.`,
                                  }
                                )
                              : null}
                          </p>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void handleGenerateResonance()}
                            disabled={!currentSnapshot || isGeneratingResonance || !selectedFigurePool}
                            className="inline-flex h-12 min-w-40 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isGeneratingResonance ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              t("common.copa.resonance.regenerateShort", "重新生成")
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {resonanceResult ? (
                      <div className="mt-3 rounded-2xl border border-border/60 bg-background/50 p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {t("common.copa.resonance.viewingState", "Currently viewing")}
                        </p>
                        <p className="mt-1.5 text-sm font-medium text-foreground">
                          {t("common.copa.resonance.viewingStateValue", "{{name}} history result", {
                            name: resonanceResult.pool_name_snapshot,
                            defaultValue: `${resonanceResult.pool_name_snapshot} history result`,
                          })}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatSnapshotTime(resonanceResult.generated_at)}
                          {resonanceResult.pool_deleted
                            ? ` · ${t("common.copa.resonance.pool.deleted", "Original pool deleted")}`
                            : resonanceResult.pool_updated
                              ? ` · ${t("common.copa.resonance.pool.updated", "Pool has changed since generation")}`
                              : ""}
                        </p>
                      </div>
                    ) : null}

                    {resonanceResult ? (
                      <div className="mt-4 space-y-5">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {t("common.copa.resonance.longTerm", "Long-term resonance")}
                          </p>
                          <div className="mt-3">
                            <FigureResonanceCard
                              card={resonanceResult.long_term.primary}
                              label={t("common.copa.resonance.primary", "Primary")}
                            />
                          </div>
                        </div>

                        {resonanceResult.long_term.secondary.length > 0 ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {t("common.copa.resonance.secondary", "Secondary resonance")}
                            </p>
                            <div className="mt-3 grid gap-4 xl:grid-cols-2">
                              {resonanceResult.long_term.secondary.map((card) => (
                                <FigureResonanceCard
                                  key={card.slug}
                                  card={card}
                                  label={t("common.copa.resonance.secondaryShort", "Secondary")}
                                  compact
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {resonanceResult.recent_state ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {t("common.copa.resonance.recentState", "Recent state")}
                            </p>
                            <div className="mt-3">
                              <FigureResonanceCard
                                card={resonanceResult.recent_state}
                                label={t("common.copa.resonance.recentStateShort", "Recent")}
                                compact
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                            {t(
                              "common.copa.resonance.recentStateEmpty",
                              "Not enough recent user messages in this scope to infer a recent-state resonance."
                            )}
                          </div>
                        )}

                        {resonanceHistory.length > 0 ? (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {t("common.copa.resonance.history", "Thought echoes history")}
                            </p>
                            <div className="mt-3 space-y-2">
                              {resonanceHistory.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setResonanceResult(item)}
                                  className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                                    resonanceResult.id === item.id
                                      ? "border-emerald-500/40 bg-emerald-500/10"
                                      : "border-border/60 bg-background/60 hover:bg-background"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-foreground">
                                      {item.pool_name_snapshot}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatSnapshotTime(item.generated_at)}
                                    </p>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {item.long_term.primary.name}
                                    {item.recent_state
                                      ? ` · ${t("common.copa.resonance.recentState", "Recent state")}`
                                      : ""}
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                        {t(
                          "common.copa.resonance.empty.description",
                          "Use the selected CoPA Profile as the long-term signal, then generate matching thought echoes."
                        )}
                      </div>
                    )}

                  </section>
                )}
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/70 bg-card/60 p-8 text-center">
                <Brain className="mx-auto h-10 w-10 text-muted-foreground/60" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {activeSubview === "profile"
                    ? t("common.copa.empty.title", "No CoPA Profile yet")
                    : t("common.copa.resonance.empty.noProfile", "Select or generate a CoPA Profile first.")}
                </h3>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
                  {activeSubview === "profile"
                    ? t(
                        "common.copa.empty.description",
                        "Choose a scope, confirm the model settings, and generate a CoPA Profile from user-only history."
                      )
                    : t(
                        "common.copa.resonance.empty.noProfile",
                        "Select or generate a CoPA Profile first, then you can generate thought echoes from it."
                      )}
                </p>
                {activeSubview === "profile" ? (
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => void handleGenerate()}
                      disabled={isGenerating || projects.length === 0}
                      className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {t("common.copa.generateLong", "Generate CoPA Profile")}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          </section>
        )}
      </div>

      <Dialog
        open={pendingFigurePoolImport != null}
        onOpenChange={(open) => {
          if (!open) {
            resetFigurePoolImportDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("common.copa.resonance.pool.importConflictTitle", "Rename imported pool")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "common.copa.resonance.pool.importConflictDescription",
                'A pool named "{{name}}" already exists. Choose a new name before importing this ZIP.',
                {
                  name:
                    pendingFigurePoolImport?.inspection.conflictingPoolName ??
                    pendingFigurePoolImport?.inspection.payload.name ??
                    "",
                }
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("common.copa.resonance.pool.name", "Pool name")}
              </span>
              <Input
                value={pendingFigurePoolImportName}
                onChange={(event) => setPendingFigurePoolImportName(event.target.value)}
                placeholder={t("common.copa.resonance.pool.name", "Pool name")}
                className="mt-2"
              />
            </label>

            {figurePoolImportError ? (
              <p className="text-sm text-destructive">{figurePoolImportError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetFigurePoolImportDialog}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={() => void handleConfirmFigurePoolImport()}
              disabled={!pendingFigurePoolImportName.trim()}
            >
              {t("common.copa.resonance.pool.import", "Import")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
