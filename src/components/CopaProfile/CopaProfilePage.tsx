import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, ChevronDown, Download, LibraryBig, Loader2, RefreshCw, Settings2, Sparkles, Trash2, X } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "@/services/api";
import { openBinaryFileDialog, saveBinaryFileDialog, saveFileDialog } from "@/utils/fileDialog";
import { useAppStore } from "@/store/useAppStore";
import type { ClaudeMessage, ClaudeProject, ClaudeSession } from "@/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
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
  normalizeCopaLanguage,
  requestCopaProfile,
  resolveCopaModelConfig,
  resolveResonanceModelConfig,
  saveCopaConfig,
  saveCopaSnapshot,
  deleteCopaSnapshot,
} from "@/services/copaProfileService";
import type { CopaLlmConfigState, CopaModelConfig, CopaProfileMode, CopaSnapshot, CopaScopeType } from "@/types/copaProfile";
import type { FigureResonanceResult } from "@/types/figureResonance";
import {
  deleteFigureResonanceResultsForProfile,
  generateFigureResonance,
  loadFigureResonanceHistory,
} from "@/services/figureResonanceService";
import { saveLlmApiKey, type LlmRuntimeConfig } from "@/services/llmProxyService";
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
const MAX_SIGNAL_THRESHOLD = 1200;
const FIGURE_POOL_IMPORT_MAX_BYTES = 100 * 1024 * 1024;
type CopaSubview = "profile" | "resonance" | "pools";

interface PendingFigurePoolImport {
  archive: Uint8Array;
  inspection: FigurePoolZipInspection;
}

interface LoadingFigureCopy {
  slug: string;
  name: string;
  copy: string;
}

function sanitizeEnglishLoadingCopy(value: string): string {
  return value
    .replace(/[\u3400-\u9fff]+/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function dedupeProviders(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function providerLabel(t: TFunction, provider: string): string {
  return t(`common.provider.${provider}`, { defaultValue: provider });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function localizeCopaErrorMessage(t: TFunction, error: unknown): string {
  const message = getErrorMessage(error);

  if (message === "CoPA model returned invalid JSON.") {
    return t(
      "common.copa.error.invalidJson",
      "CoPA model returned invalid JSON."
    );
  }

  return message;
}

function clampSignalThreshold(value: string, fallback: number, minimum: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(MAX_SIGNAL_THRESHOLD, Math.max(minimum, parsed));
}

function getProfileModeLabel(t: TFunction, mode?: CopaProfileMode) {
  return mode === "fun"
    ? t("common.copa.profileMode.fun", "Fun version")
    : t("common.copa.profileMode.serious", "Serious version");
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
  const [profileMode, setProfileMode] = useState<CopaProfileMode>("serious");
  const [projectPath, setProjectPath] = useState("");
  const [sessionPath, setSessionPath] = useState("");
  const [sessionsForScope, setSessionsForScope] = useState<ClaudeSession[]>([]);
  const [providerScope, setProviderScope] = useState<string[]>([]);
  const [activeSubview, setActiveSubview] = useState<CopaSubview>("profile");
  const [activeLlmConfigSection, setActiveLlmConfigSection] = useState<"copa" | "resonance">("copa");
  const [isLlmConfigOpen, setIsLlmConfigOpen] = useState(false);
  const [config, setConfig] = useState<CopaLlmConfigState>(DEFAULT_COPA_LLM_CONFIG);
  const [draftConfig, setDraftConfig] = useState<CopaLlmConfigState>(DEFAULT_COPA_LLM_CONFIG);
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
  const [preferGeneratingView, setPreferGeneratingView] = useState(false);
  const [importSummaryPool, setImportSummaryPool] = useState<FigurePool | null>(null);
  const [pendingFigurePoolImport, setPendingFigurePoolImport] = useState<PendingFigurePoolImport | null>(null);
  const [pendingFigurePoolImportName, setPendingFigurePoolImportName] = useState("");
  const [figurePoolImportError, setFigurePoolImportError] = useState("");
  const [loadingFigureIndex, setLoadingFigureIndex] = useState(0);
  const [discardSignalLengthInput, setDiscardSignalLengthInput] = useState(
    String(DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50)
  );
  const [pasteLikeSignalLengthInput, setPasteLikeSignalLengthInput] = useState(
    String(DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40)
  );
  const [draftCopaApiKey, setDraftCopaApiKey] = useState("");
  const [draftResonanceApiKey, setDraftResonanceApiKey] = useState("");
  const llmConfigPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setProjectPath((current) => current || selectedProject?.path || projects[0]?.path || "");
    setSessionPath((current) => current || selectedSession?.file_path || "");
    setProviderScope((current) =>
      current.length > 0 ? current : activeProviders.length > 0 ? [...activeProviders] : providerOptions
    );
  }, [activeProviders, projects, providerOptions, selectedProject?.path, selectedSession?.file_path]);

  useEffect(() => {
    void loadCopaConfig().then((storedConfig) => {
      setConfig(storedConfig);
      setDraftConfig(storedConfig);
    });
    void loadCopaSnapshots().then(setSnapshots);
    void loadFigurePools().then((pools) => {
      setFigurePools(pools);
      const defaultPool = pools.find((pool) => pool.isDefault) ?? pools[0] ?? null;
      setSelectedPoolId(defaultPool?.id ?? "");
    });
  }, []);

  useEffect(() => {
    setDiscardSignalLengthInput(
      String(config.discardSignalLength ?? DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50)
    );
    setPasteLikeSignalLengthInput(
      String(config.pasteLikeSignalLength ?? DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40)
    );
  }, [config.discardSignalLength, config.pasteLikeSignalLength]);

  useEffect(() => {
    if (!isLlmConfigOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (llmConfigPanelRef.current?.contains(event.target as Node)) {
        return;
      }
      setDraftConfig(config);
      setDiscardSignalLengthInput(
        String(config.discardSignalLength ?? DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50)
      );
      setPasteLikeSignalLengthInput(
        String(config.pasteLikeSignalLength ?? DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40)
      );
      setIsLlmConfigOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraftConfig(config);
        setDiscardSignalLengthInput(
          String(config.discardSignalLength ?? DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50)
        );
        setPasteLikeSignalLengthInput(
          String(config.pasteLikeSignalLength ?? DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40)
        );
        setIsLlmConfigOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [config, isLlmConfigOpen]);

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
  const isProfileGenerationView = isGenerating && activeSubview === "profile" && preferGeneratingView;
  const interactiveSnapshot = isProfileGenerationView ? null : currentSnapshot;

  const selectedFigurePool = useMemo(
    () => figurePools.find((pool) => pool.id === selectedPoolId) ?? null,
    [figurePools, selectedPoolId]
  );

  const loadingFigureCopies = useMemo<LoadingFigureCopy[]>(() => {
    if (!selectedFigurePool) {
      return [];
    }

    const language = normalizeCopaLanguage(i18n.resolvedLanguage || i18n.language || "en");
    return selectedFigurePool.records
      .filter((record) => record.status === "valid")
      .map((record) => {
        const rawCopy = language === "zh" ? record.loading_copy_zh.trim() : record.loading_copy_en.trim();
        const copy = language === "zh" ? rawCopy : sanitizeEnglishLoadingCopy(rawCopy);
        const localizedZh = record.localized_names?.zh?.trim();
        const name = language === "zh" ? localizedZh || record.name : record.name;
        return {
          slug: record.slug,
          name,
          copy,
        };
      })
      .filter((record) => record.copy.length > 0);
  }, [i18n.language, i18n.resolvedLanguage, selectedFigurePool]);

  const activeLoadingFigure =
    loadingFigureCopies.length > 0 ? loadingFigureCopies[loadingFigureIndex % loadingFigureCopies.length] : null;

  useEffect(() => {
    setLoadingFigureIndex(0);
  }, [selectedPoolId, i18n.language, i18n.resolvedLanguage]);

  useEffect(() => {
    if (!isGenerating || loadingFigureCopies.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingFigureIndex((current) => (current + 1) % loadingFigureCopies.length);
    }, 2400);

    return () => window.clearInterval(timer);
  }, [isGenerating, loadingFigureCopies]);

  const renderLoadingFigureCard = () => {
    if (!activeLoadingFigure) {
      return null;
    }

    return (
      <div className="rounded-3xl border border-emerald-500/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.08),rgba(255,255,255,0.96))] px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          {t("common.copa.history.loadingFigure", "Figure loading copy")}
        </p>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0 w-full">
            <p className="text-xl font-semibold text-foreground">{activeLoadingFigure.name}</p>
            <p className="mt-2 max-w-3xl text-base leading-8 text-muted-foreground">{activeLoadingFigure.copy}</p>
          </div>
          {loadingFigureCopies.length > 1 ? (
            <span className="rounded-full border border-emerald-500/20 bg-background/80 px-3 py-1 text-xs text-muted-foreground">
              {loadingFigureIndex % loadingFigureCopies.length + 1}/{loadingFigureCopies.length}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const isInheritedResonanceConfig = activeLlmConfigSection === "resonance" && !draftConfig.resonance.enabled;
  const activeLlmModelConfig =
    activeLlmConfigSection === "copa"
      ? draftConfig.copa
      : draftConfig.resonance.enabled
        ? draftConfig.resonance.config
        : resolveCopaModelConfig(draftConfig);
  const activeApiKeyDraft =
    activeLlmConfigSection === "copa" ? draftCopaApiKey : draftResonanceApiKey;
  const activeHasApiKey =
    activeLlmConfigSection === "copa"
      ? config.copa.hasApiKey === true
      : resolveResonanceModelConfig(config).hasApiKey === true;
  const hasDraftConfigChanges =
    JSON.stringify(draftConfig) !== JSON.stringify(config) ||
    draftCopaApiKey.trim().length > 0 ||
    draftResonanceApiKey.trim().length > 0 ||
    discardSignalLengthInput !==
      String(config.discardSignalLength ?? DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50) ||
    pasteLikeSignalLengthInput !==
      String(config.pasteLikeSignalLength ?? DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40);

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

  const applyRuntimeApiKeyStatus = (next: CopaLlmConfigState, runtime: LlmRuntimeConfig): CopaLlmConfigState => ({
    ...next,
    copa: {
      ...next.copa,
      hasApiKey: runtime.copa.hasApiKey,
    },
    resonance: {
      ...next.resonance,
      config: {
        ...next.resonance.config,
        hasApiKey: runtime.resonance.hasApiKey,
      },
    },
  });

  const persistConfig = (next: CopaLlmConfigState) => {
    setConfig(next);
    setDraftConfig(next);
    void saveCopaConfig(next);
  };

  const handleCopaConfigChange = <K extends keyof CopaModelConfig>(key: K, value: CopaModelConfig[K]) => {
    setDraftConfig((current) => ({
      ...current,
      copa: {
        ...current.copa,
        [key]: value,
      },
    }));
  };

  const handleResonanceConfigToggle = (enabled: boolean) => {
    setDraftConfig((current) => ({
      ...current,
      resonance: {
        enabled,
        config: enabled && !current.resonance.enabled ? { ...resolveCopaModelConfig(current) } : current.resonance.config,
      },
    }));
  };

  const handleResonanceConfigChange = <K extends keyof CopaModelConfig>(
    key: K,
    value: CopaModelConfig[K]
  ) => {
    setDraftConfig((current) => ({
      ...current,
      resonance: {
        ...current.resonance,
        config: {
          ...current.resonance.config,
          [key]: value,
        },
      },
    }));
  };

  const handleDiscardSignalLengthCommit = (value: string) => {
    const fallback = draftConfig.discardSignalLength ?? DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50;
    const clampedValue = clampSignalThreshold(value, fallback, 2);
    setDiscardSignalLengthInput(String(clampedValue));

    setDraftConfig((current) => ({
      ...current,
      discardSignalLength: clampedValue,
      pasteLikeSignalLength: Math.min(
        current.pasteLikeSignalLength ?? DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40,
        clampedValue - 1
      ),
    }));
    setPasteLikeSignalLengthInput((current) =>
      String(Math.min(clampSignalThreshold(current, DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40, 1), clampedValue - 1))
    );
  };

  const handlePasteLikeSignalLengthCommit = (value: string) => {
    const discardThreshold = draftConfig.discardSignalLength ?? DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50;
    const fallback = draftConfig.pasteLikeSignalLength ?? DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40;
    const clampedValue = Math.min(clampSignalThreshold(value, fallback, 1), discardThreshold - 1);
    setPasteLikeSignalLengthInput(String(clampedValue));

    setDraftConfig((current) => ({
      ...current,
      pasteLikeSignalLength: clampedValue,
    }));
  };

  const openLlmConfigPanel = () => {
    setDraftConfig(config);
    setDraftCopaApiKey("");
    setDraftResonanceApiKey("");
    setDiscardSignalLengthInput(
      String(config.discardSignalLength ?? DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50)
    );
    setPasteLikeSignalLengthInput(
      String(config.pasteLikeSignalLength ?? DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40)
    );
    setIsLlmConfigOpen(true);
  };

  const closeLlmConfigPanel = () => {
    setDraftConfig(config);
    setDraftCopaApiKey("");
    setDraftResonanceApiKey("");
    setDiscardSignalLengthInput(
      String(config.discardSignalLength ?? DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50)
    );
    setPasteLikeSignalLengthInput(
      String(config.pasteLikeSignalLength ?? DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40)
    );
    setIsLlmConfigOpen(false);
  };

  const confirmLlmConfigPanel = async () => {
    const discardSignalLength = clampSignalThreshold(
      discardSignalLengthInput,
      config.discardSignalLength ?? DEFAULT_COPA_LLM_CONFIG.discardSignalLength ?? 50,
      2
    );
    const nextConfig = {
      ...draftConfig,
      discardSignalLength,
      pasteLikeSignalLength: Math.min(
        clampSignalThreshold(
          pasteLikeSignalLengthInput,
          config.pasteLikeSignalLength ?? DEFAULT_COPA_LLM_CONFIG.pasteLikeSignalLength ?? 40,
          1
        ),
        discardSignalLength - 1
      ),
    };

    try {
      let runtimeConfig: LlmRuntimeConfig | null = null;
      if (draftCopaApiKey.trim().length > 0) {
        runtimeConfig = await saveLlmApiKey({
          purpose: "copa",
          apiKey: draftCopaApiKey,
        });
      }
      if (draftResonanceApiKey.trim().length > 0) {
        runtimeConfig = await saveLlmApiKey({
          purpose: "resonance",
          apiKey: draftResonanceApiKey,
        });
      }

      persistConfig(runtimeConfig ? applyRuntimeApiKeyStatus(nextConfig, runtimeConfig) : nextConfig);
      setDraftCopaApiKey("");
      setDraftResonanceApiKey("");
      setIsLlmConfigOpen(false);
    } catch (saveError) {
      toast.error(getErrorMessage(saveError));
    }
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
    setPreferGeneratingView(true);
    setError("");

    try {
      const generationLanguage = normalizeCopaLanguage(i18n.resolvedLanguage || i18n.language || "en");
      const collected = await collectScopeMessages();
      const extracted = extractUserSignals(collected.messages, {
        discardSignalLength: config.discardSignalLength,
        pasteLikeSignalLength: config.pasteLikeSignalLength,
      });
      const limitedSignals =
        extracted.messages.length > MAX_PROMPT_SIGNALS
          ? extracted.messages.slice(-MAX_PROMPT_SIGNALS)
          : extracted.messages;
      const overflowCount = Math.max(0, extracted.messages.length - limitedSignals.length);

      if (limitedSignals.length === 0) {
        throw new Error(t("common.copa.error.noSignals", "No user messages were found in the selected scope."));
      }

      await saveCopaConfig(config);
      const result = await requestCopaProfile(
        limitedSignals,
        resolveCopaModelConfig(config),
        generationLanguage,
        profileMode
      );
      const snapshot = createSnapshot({
        language: generationLanguage,
        profileMode,
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
        funProfileText: result.funProfileText,
      });

      const stored = await saveCopaSnapshot(snapshot);
      setSnapshots(stored);
      setCurrentSnapshotId(snapshot.id);
      setPreferGeneratingView(false);
    } catch (generationError) {
      const message = localizeCopaErrorMessage(t, generationError);
      toast.error(message);
      setError(message);
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
        recentMessages: extractUserSignals(collected.messages, {
          discardSignalLength: config.discardSignalLength,
          pasteLikeSignalLength: config.pasteLikeSignalLength,
        }).messages,
        config: resolveResonanceModelConfig(config),
        language: i18n.resolvedLanguage || i18n.language || "zh",
      });
      setResonanceResult(result);
      setResonanceHistory((current) => [
        result,
        ...current.filter((item) => item.cache_key !== result.cache_key),
      ]);
      if (result.source === "heuristic") {
        const message = t(
          "common.copa.resonance.error.heuristicFallback",
          "Thought Echoes LLM generation failed. Showing a heuristic fallback result."
        );
        toast.error(message);
        setResonanceError(message);
      }
    } catch (generationError) {
      const message = getErrorMessage(generationError);
      toast.error(message);
      setResonanceError(message);
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

  const presentFigurePoolImportError = (message: string) => {
    setFigurePoolImportError(message);
    toast.error(message);
  };

  const completeFigurePoolImport = async (archive: Uint8Array, name?: string) => {
    const imported = await importFigurePoolFromZip(archive, name ? { name } : undefined);
    await refreshFigurePools();
    setImportSummaryPool(imported);
    setSelectedPoolId(imported.id);
    resetFigurePoolImportDialog();
  };

  const handleImportFigurePool = async () => {
    setFigurePoolImportError("");

    try {
      const selectedArchive = await openBinaryFileDialog({
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });

      if (!selectedArchive) {
        return;
      }

      if (selectedArchive.size > FIGURE_POOL_IMPORT_MAX_BYTES) {
        presentFigurePoolImportError(
          t(
            "common.copa.resonance.pool.importTooLarge",
            "Cannot import files larger than 100 MB."
          )
        );
        return;
      }

      const archive = selectedArchive.data;

      const inspection = await inspectFigurePoolZip(archive);
      if (inspection.hasNameConflict) {
        setPendingFigurePoolImport({ archive, inspection });
        setPendingFigurePoolImportName(inspection.payload.name);
        setFigurePoolImportError("");
        return;
      }

      await completeFigurePoolImport(archive);
    } catch (figurePoolError) {
      presentFigurePoolImportError(
        figurePoolError instanceof Error ? figurePoolError.message : String(figurePoolError)
      );
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
      presentFigurePoolImportError(
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

  const handleSelectSnapshot = (snapshotId: string) => {
    setCurrentSnapshotId(snapshotId);
    if (activeSubview === "profile" && isGenerating) {
      setPreferGeneratingView(false);
    }
  };

  const handleSelectResonanceHistory = (resultId: string) => {
    const selectedResult = resonanceHistory.find((item) => item.id === resultId);
    if (selectedResult) {
      setResonanceResult(selectedResult);
    }
  };

  const formatSnapshotPreview = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
  };

  const formatResonanceHistoryPreview = (result: FigureResonanceResult) => {
    const primaryName = result.long_term.primary.name;
    const recentStateLabel = result.recent_state
      ? t("common.copa.resonance.recentState", "Recent state")
      : null;
    const composed = [primaryName, recentStateLabel].filter(Boolean).join(" · ");
    return composed.length > 72 ? `${composed.slice(0, 69)}...` : composed;
  };

  const formatScopeOptionLabel = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 56 ? `${normalized.slice(0, 53)}...` : normalized;
  };

  const formatFigurePoolOptionLabel = (pool: FigurePool) =>
    formatScopeOptionLabel(
      t("common.copa.resonance.pool.selectionStateValue", {
        name: pool.name,
        valid: pool.validationSummary.validCount,
        invalid: pool.validationSummary.invalidCount,
        defaultValue: `${pool.name} (${pool.validationSummary.validCount} usable / ${pool.validationSummary.invalidCount} invalid)`,
      })
    );

  const selectedProjectOptionLabel = selectedProjectForScope
    ? formatScopeOptionLabel(
        `${selectedProjectForScope.name} · ${providerLabel(t, selectedProjectForScope.provider ?? "claude")}`
      )
    : t("common.copa.projectPlaceholder", "Select project");

  const selectedSessionOptionLabel = selectedSessionForScope
    ? formatScopeOptionLabel(selectedSessionForScope.summary || selectedSessionForScope.actual_session_id)
    : isLoadingSessions
      ? t("common.copa.sessionLoading", "Loading sessions...")
      : t("common.copa.sessionPlaceholder", "Select session");

  const currentSnapshotOrdinal = currentSnapshot
    ? visibleSnapshots.findIndex((snapshot) => snapshot.id === currentSnapshot.id)
    : -1;
  const currentSnapshotBadge = currentSnapshotOrdinal >= 0 ? `#${visibleSnapshots.length - currentSnapshotOrdinal}` : "--";
  const currentResonanceOrdinal = resonanceResult
    ? resonanceHistory.findIndex((item) => item.id === resonanceResult.id)
    : -1;
  const currentResonanceBadge =
    currentResonanceOrdinal >= 0 ? `#${resonanceHistory.length - currentResonanceOrdinal}` : "--";

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6">
        <section className="rounded-3xl border border-slate-300/70 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.14),transparent_34%),radial-gradient(circle_at_60%_35%,rgba(148,163,184,0.12),transparent_40%),linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.92))] p-6 shadow-[0_20px_50px_rgba(148,163,184,0.18)] backdrop-blur-sm">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-8">
            <div className="max-w-3xl xl:min-w-0 xl:flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-slate-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-700 shadow-[0_8px_20px_rgba(148,163,184,0.12)]">
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
                        : "bg-white/80 text-foreground hover:bg-slate-50"
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
                        : "bg-white/80 text-foreground hover:bg-slate-50"
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
                        : "bg-white/80 text-foreground hover:bg-slate-50"
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
                    onClick={() => (isLlmConfigOpen ? closeLlmConfigPanel() : openLlmConfigPanel())}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-white/80 text-foreground shadow-sm transition-colors hover:bg-slate-50"
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
                          onClick={closeLlmConfigPanel}
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
                              checked={draftConfig.resonance.enabled}
                              onChange={(event) => handleResonanceConfigToggle(event.target.checked)}
                              className="h-4 w-4 rounded border-border/70"
                            />
                            {t("common.copa.llmConfig.resonance.toggle", "Use separate Thought Echoes config")}
                          </label>
                          {!draftConfig.resonance.enabled ? (
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
                            {activeLlmConfigSection === "copa"
                              ? t("common.copa.apiKey.copa", "CoPA API Key")
                              : t("common.copa.apiKey.resonance", "Thought Echoes API Key")}
                          </span>
                          <input
                            type="password"
                            aria-label={
                              activeLlmConfigSection === "copa"
                                ? t("common.copa.apiKey.copa", "CoPA API Key")
                                : t("common.copa.apiKey.resonance", "Thought Echoes API Key")
                            }
                            value={activeApiKeyDraft}
                            onChange={(event) =>
                              activeLlmConfigSection === "copa"
                                ? setDraftCopaApiKey(event.target.value)
                                : setDraftResonanceApiKey(event.target.value)
                            }
                            placeholder={
                              activeHasApiKey
                                ? t("common.copa.apiKey.savedPlaceholder", "Saved locally; leave blank to keep")
                                : t("common.copa.apiKey.placeholder", "Paste API key")
                            }
                            disabled={isInheritedResonanceConfig}
                            autoComplete="off"
                            className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70"
                          />
                        </label>
                        <p className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                          {t(
                            "common.copa.llmConfig.apiKeyEnvHint",
                            "API keys are saved by the local backend in ~/.echo-profile/llm-config.json. They are not stored in the frontend config or bundled app assets."
                          )}
                        </p>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <label htmlFor="copa-discard-signal-length" className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {t("common.copa.signalFilter.discardLength", "Discard threshold")}
                          </span>
                          <input
                            id="copa-discard-signal-length"
                            aria-label={t("common.copa.signalFilter.discardLength", "Discard threshold")}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={discardSignalLengthInput}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (/^\d*$/.test(nextValue)) {
                                setDiscardSignalLengthInput(nextValue);
                              }
                            }}
                            onBlur={(event) => handleDiscardSignalLengthCommit(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                handleDiscardSignalLengthCommit(event.currentTarget.value);
                              }
                            }}
                            className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground"
                          />
                          <p className="mt-2 text-sm text-muted-foreground">
                            {t(
                              "common.copa.signalFilter.discardDescription",
                              "Messages longer than this value are discarded directly."
                            )}
                          </p>
                        </label>
                        <label htmlFor="copa-paste-like-signal-length" className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {t("common.copa.signalFilter.length", "Filter threshold")}
                          </span>
                          <input
                            id="copa-paste-like-signal-length"
                            aria-label={t("common.copa.signalFilter.length", "Filter threshold")}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={pasteLikeSignalLengthInput}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (/^\d*$/.test(nextValue)) {
                                setPasteLikeSignalLengthInput(nextValue);
                              }
                            }}
                            onBlur={(event) => handlePasteLikeSignalLengthCommit(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                handlePasteLikeSignalLengthCommit(event.currentTarget.value);
                              }
                            }}
                            className="mt-2 w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground"
                          />
                          <p className="mt-2 text-sm text-muted-foreground">
                            {t(
                              "common.copa.signalFilter.description",
                              "Must be smaller than the discard threshold. Remaining longer messages are checked as possible pasted logs, code, JSON, HTML, or URL lists."
                            )}
                          </p>
                        </label>
                      </div>
                      <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/60 pt-4">
                        <button
                          type="button"
                          onClick={closeLlmConfigPanel}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-border/70 bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
                        >
                          {t("common.cancel", "Cancel")}
                        </button>
                        <button
                          type="button"
                          aria-label={t("common.copa.llmConfig.confirmAria", "Confirm LLM settings")}
                          onClick={() => void confirmLlmConfigPanel()}
                          disabled={!hasDraftConfigChanges}
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {t("common.confirm", "Confirm")}
                        </button>
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
              importHint={(i18n.resolvedLanguage || i18n.language || "en").toLowerCase().startsWith("zh")
                ? "ZIP 导入上限：100 MB。"
                : "ZIP import limit: 100 MB."}
              importError={figurePoolImportError}
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
                      <Select
                        value={projectPath}
                        onValueChange={setProjectPath}
                      >
                        <SelectTrigger
                          aria-label={t("common.copa.project", "Project")}
                          className="[&>svg]:hidden mt-2 h-auto min-h-[50px] rounded-xl border-border/70 bg-white px-3 py-2.5 shadow-sm"
                        >
                          <div className="flex w-full items-center gap-3 text-left">
                            <div className="min-w-0 flex-1">
                              <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-foreground">
                                {selectedProjectOptionLabel}
                              </p>
                            </div>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
                              <ChevronDown className="h-4 w-4" />
                            </div>
                          </div>
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="max-h-[300px] w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] rounded-[18px] border border-border/70 bg-white p-1.5 text-foreground shadow-[0_16px_42px_rgba(15,23,42,0.12)]"
                        >
                          {projects.map((project) => (
                            <SelectItem
                              key={project.path}
                              value={project.path}
                              className="rounded-[14px] px-3 py-2.5 pr-9 focus:bg-muted/60 focus:text-foreground data-[state=checked]:bg-muted/50"
                            >
                              <div className="min-w-0 w-full">
                                <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-foreground">
                                  {formatScopeOptionLabel(
                                    `${project.name} · ${providerLabel(t, project.provider ?? "claude")}`
                                  )}
                                </p>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  )}

                  {scopeType === "session" && (
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t("common.copa.session", "Session")}
                      </span>
                      <Select
                        value={sessionPath}
                        onValueChange={setSessionPath}
                        disabled={isLoadingSessions || sessionsForScope.length === 0}
                      >
                        <SelectTrigger
                          aria-label={t("common.copa.session", "Session")}
                          className="[&>svg]:hidden mt-2 h-auto min-h-[50px] rounded-xl border-border/70 bg-white px-3 py-2.5 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="flex w-full items-center gap-3 text-left">
                            <div className="min-w-0 flex-1">
                              <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-foreground">
                                {selectedSessionOptionLabel}
                              </p>
                            </div>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
                              <ChevronDown className="h-4 w-4" />
                            </div>
                          </div>
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="max-h-[300px] w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] rounded-[18px] border border-border/70 bg-white p-1.5 text-foreground shadow-[0_16px_42px_rgba(15,23,42,0.12)]"
                        >
                          {sessionsForScope.map((session) => (
                            <SelectItem
                              key={session.file_path}
                              value={session.file_path}
                              className="rounded-[14px] px-3 py-2.5 pr-9 focus:bg-muted/60 focus:text-foreground data-[state=checked]:bg-muted/50"
                            >
                              <div className="min-w-0 w-full">
                                <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-foreground">
                                  {formatScopeOptionLabel(session.summary || session.actual_session_id)}
                                </p>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    <div
                      className="inline-flex items-center rounded-xl border border-border/70 bg-background/80 p-1 shadow-sm"
                      aria-label={t("common.copa.profileMode.label", "Profile version")}
                    >
                      {(["serious", "fun"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setProfileMode(mode)}
                          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                            profileMode === mode
                              ? "bg-foreground text-background"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          }`}
                        >
                          {getProfileModeLabel(t, mode)}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleExportMarkdown()}
                      disabled={!interactiveSnapshot}
                      className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      {t("common.copa.exportMarkdown", "Export Markdown")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportJson()}
                      disabled={!interactiveSnapshot}
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
                  {isGenerating
                    ? t("common.copa.history.generatingBadge", "NEW")
                    : `${visibleSnapshots.length} ${t("common.copa.historyCount", "Profiles")}`}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {isGenerating ? (
                  <>
                    <div className="rounded-2xl border border-foreground/20 bg-foreground/5">
                      <div className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
                              {t("common.copa.history.generatingBadge", "NEW")}
                            </span>
                            <span className="text-sm font-semibold text-foreground">
                              {t("common.copa.history.generatingTitle", "Generating new Profile")}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {t(
                              "common.copa.history.generatingDescription",
                              "This run will be saved as a new Profile version for the current scope."
                            )}
                          </p>
                        </div>
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                      </div>
                    </div>

                    {renderLoadingFigureCard()}
                  </>
                ) : null}

                {visibleSnapshots.length === 0 && !isGenerating ? (
                  <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                    {t("common.copa.historyEmpty", "No Profiles for this scope yet.")}
                  </p>
                ) : (
                  <>
                    <div className="rounded-[28px] border border-border/60 bg-white/95 p-4 shadow-sm">
                      <label
                        htmlFor="copa-profile-history-select"
                        className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
                      >
                        {t("common.copa.history.select", "Choose profile")}
                      </label>
                      <Select
                        value={currentSnapshot?.id ?? ""}
                        onValueChange={handleSelectSnapshot}
                      >
                        <SelectTrigger
                          id="copa-profile-history-select"
                          aria-label={t("common.copa.history.select", "Choose profile")}
                          className="[&>svg]:hidden mt-3 h-auto min-h-[76px] rounded-[24px] border border-slate-800 bg-slate-900/92 px-4 py-3 text-background shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition-colors hover:bg-slate-900 focus:border-slate-700 focus:ring-0"
                        >
                          <div className="flex min-h-[50px] w-full items-center gap-3 text-left">
                            <div className="flex h-11 min-w-11 items-center justify-center rounded-full bg-white/92 px-3 text-xs font-semibold text-slate-900">
                              {currentSnapshotBadge}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/65">
                                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 font-semibold normal-case tracking-normal text-white/90">
                                  {currentSnapshot?.scope.label ?? t("common.copa.history.current", "Currently selected")}
                                </span>
                                {currentSnapshot ? (
                                  <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 font-semibold normal-case tracking-normal text-white/90">
                                    {getProfileModeLabel(t, currentSnapshot.profileMode)}
                                  </span>
                                ) : null}
                                {currentSnapshot ? <span>{formatSnapshotTime(currentSnapshot.createdAt)}</span> : null}
                              </div>
                              <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap pr-4 text-sm font-medium text-white">
                                {currentSnapshot
                                  ? formatSnapshotPreview(currentSnapshot.promptSummary)
                                  : t("common.copa.history.current", "Currently selected")}
                              </p>
                              {currentSnapshot ? (
                                <p className="mt-1 text-xs text-white/65">
                                  {currentSnapshot.sourceStats.rawUserMessages}{" "}
                                  {t("common.copa.summary.userMessages", "user messages")} ·{" "}
                                  {currentSnapshot.modelConfig.model}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/85">
                              <ChevronDown className="h-4 w-4" />
                            </div>
                          </div>
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="max-h-[360px] w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] rounded-[20px] border border-border/70 bg-white p-1.5 text-foreground shadow-[0_20px_60px_rgba(15,23,42,0.14)]"
                        >
                          {visibleSnapshots.map((snapshot, index) => (
                            <SelectItem
                              key={snapshot.id}
                              value={snapshot.id}
                              className="rounded-[16px] px-3 py-2.5 pr-9 focus:bg-muted/60 focus:text-foreground data-[state=checked]:bg-muted/50"
                            >
                              <div className="min-w-0 w-full">
                                <div className="flex min-w-0 max-w-full items-center gap-2 text-[12px] font-semibold text-foreground">
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                    #{visibleSnapshots.length - index}
                                  </span>
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                    {getProfileModeLabel(t, snapshot.profileMode)}
                                  </span>
                                  <span className="shrink-0">{formatSnapshotTime(snapshot.createdAt)}</span>
                                  <span className="min-w-0 truncate text-muted-foreground">
                                    {snapshot.sourceStats.rawUserMessages}{" "}
                                    {t("common.copa.summary.userMessages", "user messages")}
                                  </span>
                                </div>
                                <p className="mt-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-foreground/88">
                                  {formatSnapshotPreview(snapshot.promptSummary)}
                                </p>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isProfileGenerationView ? (
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          {t(
                            "common.copa.history.generatingHint",
                            "You can switch to an older Profile from the dropdown while this generation continues."
                          )}
                        </p>
                      ) : currentSnapshot && activeSubview === "profile" ? (
                        <div className="mt-3 rounded-[22px] border border-border/60 bg-white/90 px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  {t("common.copa.history.current", "Currently selected")}
                                </p>
                                <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
                                  {currentSnapshotBadge}
                                </span>
                                <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  {currentSnapshot.scope.label}
                                </span>
                                <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  {getProfileModeLabel(t, currentSnapshot.profileMode)}
                                </span>
                                <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {currentSnapshot.sourceStats.rawUserMessages} {t("common.copa.summary.userMessages", "user messages")}
                                </span>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-foreground">{currentSnapshot.promptSummary}</p>
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                {formatSnapshotTime(currentSnapshot.createdAt)} · {currentSnapshot.modelConfig.model}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSnapshot(currentSnapshot.id)}
                              className="inline-flex h-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 text-rose-600 transition-colors hover:bg-rose-100"
                              aria-label={t("common.copa.deleteProfile", "Delete Profile")}
                              title={t("common.copa.deleteProfile", "Delete Profile")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </section>

            {activeSubview === "resonance" && resonanceHistory.length > 0 ? (
              <section className="rounded-3xl border border-border/60 bg-card/90 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("common.copa.resonance.history", "Thought echoes history")}
                </p>
                <div className="mt-3 rounded-[24px] border border-border/60 bg-white/95 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                  <label
                    htmlFor="copa-resonance-history-select"
                    className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    {t("common.copa.resonance.history.select", "Choose history result")}
                  </label>
                  <Select
                    value={resonanceResult?.id ?? resonanceHistory[0]?.id ?? ""}
                    onValueChange={handleSelectResonanceHistory}
                  >
                    <SelectTrigger
                      id="copa-resonance-history-select"
                      aria-label={t("common.copa.resonance.history.select", "Choose history result")}
                      className="[&>svg]:hidden mt-3 h-auto min-h-[72px] rounded-[20px] border border-border/70 bg-white px-4 py-3 text-left shadow-none transition-colors focus:border-foreground/20 focus:ring-0"
                    >
                      <div className="flex min-h-[48px] w-full items-center gap-3 text-left">
                        <div className="flex h-10 min-w-10 items-center justify-center rounded-full bg-muted px-3 text-xs font-semibold text-foreground">
                          {currentResonanceBadge}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            <span className="rounded-full bg-muted px-2 py-1 font-semibold normal-case tracking-normal text-foreground">
                              {resonanceResult?.pool_name_snapshot ??
                                t("common.copa.resonance.history.current", "Currently selected")}
                            </span>
                            {resonanceResult ? <span>{formatSnapshotTime(resonanceResult.generated_at)}</span> : null}
                          </div>
                          <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap pr-4 text-sm font-medium text-foreground">
                            {resonanceResult
                              ? formatResonanceHistoryPreview(resonanceResult)
                              : t("common.copa.resonance.history.current", "Currently selected")}
                          </p>
                        </div>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/80 text-foreground">
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </div>
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      className="max-h-[320px] w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] rounded-[20px] border border-border/70 bg-white p-1.5 text-foreground shadow-[0_20px_60px_rgba(15,23,42,0.14)]"
                    >
                      {resonanceHistory.map((item, index) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          className="rounded-[16px] px-3 py-2.5 pr-9 focus:bg-muted/60 focus:text-foreground data-[state=checked]:bg-muted/50"
                        >
                          <div className="min-w-0 w-full">
                            <div className="flex min-w-0 max-w-full items-center gap-2 text-[12px] font-semibold text-foreground">
                              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                #{resonanceHistory.length - index}
                              </span>
                              <span className="min-w-0 truncate">{item.pool_name_snapshot}</span>
                              <span className="shrink-0 text-muted-foreground">
                                {formatSnapshotTime(item.generated_at)}
                              </span>
                            </div>
                            <p className="mt-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-foreground/88">
                              {formatResonanceHistoryPreview(item)}
                            </p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>
            ) : null}

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

            {interactiveSnapshot || isProfileGenerationView ? (
              <>
                {activeSubview === "profile" ? (
                  <>
                    {!isProfileGenerationView && interactiveSnapshot ? (
                      interactiveSnapshot.profileMode === "fun" && interactiveSnapshot.funProfileText ? (
                        <section className="rounded-3xl border border-slate-300/70 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-6 shadow-sm">
                          <div className="mb-4 inline-flex rounded-full border border-amber-300/50 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                            {getProfileModeLabel(t, "fun")}
                          </div>
                          <p className="whitespace-pre-wrap text-base leading-8 text-foreground">
                            {interactiveSnapshot.funProfileText}
                          </p>
                        </section>
                      ) : (
                        <section className="grid gap-4 xl:grid-cols-2">
                          {Object.values(interactiveSnapshot.factors).map((factor) => (
                            <CopaFactorCard key={factor.code} factor={factor} />
                          ))}
                        </section>
                      )
                    ) : null}

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
                          <Select
                            value={selectedPoolId}
                            onValueChange={setSelectedPoolId}
                          >
                            <SelectTrigger
                              aria-label={t("common.copa.resonance.pool.select", "Figure pool")}
                              className="[&>svg]:hidden mt-2 h-auto min-h-[50px] rounded-xl border-border/70 bg-white px-3 py-2.5 shadow-sm"
                            >
                              <div className="flex w-full items-center gap-3 text-left">
                                <div className="min-w-0 flex-1">
                                  <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-foreground">
                                    {selectedFigurePool
                                      ? formatFigurePoolOptionLabel(selectedFigurePool)
                                      : t("common.copa.resonance.pool.select", "Figure pool")}
                                  </p>
                                </div>
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
                                  <ChevronDown className="h-4 w-4" />
                                </div>
                              </div>
                            </SelectTrigger>
                            <SelectContent
                              position="popper"
                              className="max-h-[300px] w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] rounded-[18px] border border-border/70 bg-white p-1.5 text-foreground shadow-[0_16px_42px_rgba(15,23,42,0.12)]"
                            >
                              {figurePools.map((pool) => (
                                <SelectItem
                                  key={pool.id}
                                  value={pool.id}
                                  className="rounded-[14px] px-3 py-2.5 pr-9 focus:bg-muted/60 focus:text-foreground data-[state=checked]:bg-muted/50"
                                >
                                  <div className="min-w-0 w-full">
                                    <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-foreground">
                                      {formatFigurePoolOptionLabel(pool)}
                                    </p>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
