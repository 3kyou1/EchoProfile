import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { CopaProfilePage } from "@/components/CopaProfile/CopaProfilePage";

const mockUseTranslation = vi.fn();
const mockUseAppStore = vi.fn();
const mockLoadCopaConfig = vi.fn();
const mockLoadCopaSnapshots = vi.fn();
const mockLoadFigurePools = vi.fn();
const mockLoadFigureResonanceHistory = vi.fn();
const mockRequestCopaProfile = vi.fn();
const mockCreateSnapshot = vi.fn();
const mockExtractUserSignals = vi.fn();
const mockSaveCopaSnapshot = vi.fn();
const mockApi = vi.fn();
const mockSaveCopaConfig = vi.fn();
const mockOpenBinaryFileDialog = vi.fn();
const mockSaveBinaryFileDialog = vi.fn();
const mockExportFigurePoolToZip = vi.fn();
const mockImportFigurePoolFromZip = vi.fn();
const mockInspectFigurePoolZip = vi.fn();
const mockToastError = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => mockUseTranslation(),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: () => mockUseAppStore(),
}));

vi.mock("@/services/api", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/utils/fileDialog", () => ({
  openBinaryFileDialog: (...args: unknown[]) => mockOpenBinaryFileDialog(...args),
  openFileDialog: vi.fn(),
  saveBinaryFileDialog: (...args: unknown[]) => mockSaveBinaryFileDialog(...args),
  saveFileDialog: vi.fn(),
}));

vi.mock("@/services/copaProfileService", () => ({
  DEFAULT_COPA_MODEL_CONFIG: {
    baseUrl: "http://example.com/v1",
    model: "test-model",
    apiKey: "test-key",
    temperature: 0.2,
  },
  DEFAULT_COPA_LLM_CONFIG: {
    copa: {
      baseUrl: "http://example.com/v1",
      model: "test-model",
      apiKey: "test-key",
      temperature: 0.2,
    },
    resonance: {
      enabled: false,
      config: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
        temperature: 0.2,
      },
    },
    discardSignalLength: 50,
    pasteLikeSignalLength: 40,
  },
  buildScopeKey: ({ type, ref }: { type: string; ref: string }) => `${type}:${ref}`,
  createSnapshot: (...args: unknown[]) => mockCreateSnapshot(...args),
  extractUserSignals: (...args: unknown[]) =>
    mockExtractUserSignals(...args),
  loadCopaConfig: () => mockLoadCopaConfig(),
  loadCopaSnapshots: () => mockLoadCopaSnapshots(),
  normalizeCopaLanguage: (language?: string) =>
    typeof language === "string" && language.toLowerCase().startsWith("zh") ? "zh" : "en",
  requestCopaProfile: (...args: unknown[]) => mockRequestCopaProfile(...args),
  resolveCopaModelConfig: vi.fn((config) => config.copa),
  resolveResonanceModelConfig: vi.fn((config) =>
    config.resonance.enabled ? config.resonance.config : config.copa
  ),
  saveCopaConfig: (...args: unknown[]) => mockSaveCopaConfig(...args),
  saveCopaSnapshot: (...args: unknown[]) => mockSaveCopaSnapshot(...args),
  deleteCopaSnapshot: vi.fn(),
}));

vi.mock("@/services/figureResonanceService", () => ({
  deleteFigureResonanceResultsForProfile: vi.fn(),
  generateFigureResonance: vi.fn(),
  loadFigureResonanceHistory: () => mockLoadFigureResonanceHistory(),
}));

vi.mock("@/services/figurePoolService", () => ({
  createFigureRecord: vi.fn(),
  deleteFigurePool: vi.fn(),
  deleteFigureRecord: vi.fn(),
  exportFigurePool: vi.fn(),
  exportFigurePoolToZip: (...args: unknown[]) => mockExportFigurePoolToZip(...args),
  importFigurePoolFromJson: vi.fn(),
  importFigurePoolFromZip: (...args: unknown[]) => mockImportFigurePoolFromZip(...args),
  inspectFigurePoolZip: (...args: unknown[]) => mockInspectFigurePoolZip(...args),
  loadFigurePools: () => mockLoadFigurePools(),
  renameFigurePool: vi.fn(),
  setDefaultFigurePool: vi.fn(),
  updateFigureRecord: vi.fn(),
}));

describe("CopaProfilePage resonance layout", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: () => {},
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: () => {},
    });

    mockUseTranslation.mockReturnValue({
      t: (
        _key: string,
        fallbackOrOptions?: string | { defaultValue?: string },
        values?: Record<string, string | number>
      ) => {
        if (typeof fallbackOrOptions === "string") {
          return fallbackOrOptions;
        }
        if (fallbackOrOptions?.defaultValue) {
          return fallbackOrOptions.defaultValue;
        }
        return values?.defaultValue ? String(values.defaultValue) : _key;
      },
      i18n: {
        resolvedLanguage: "en",
        language: "en",
      },
    });

    mockUseAppStore.mockReturnValue({
      projects: [
        {
          name: "EchoProfile",
          path: "/tmp/echoprofile",
          provider: "claude",
        },
      ],
      selectedProject: null,
      selectedSession: null,
      activeProviders: ["claude"],
      excludeSidechain: false,
    });

    mockLoadCopaConfig.mockResolvedValue({
      copa: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        apiKey: "test-key",
        temperature: 0.2,
      },
      resonance: {
        enabled: false,
        config: {
          baseUrl: "http://example.com/v1",
          model: "test-model",
          apiKey: "test-key",
          temperature: 0.2,
        },
      },
      discardSignalLength: 50,
      pasteLikeSignalLength: 40,
    });

    mockSaveCopaConfig.mockReset();
    mockSaveCopaConfig.mockImplementation(async (next) => next);
    mockRequestCopaProfile.mockReset();
    mockCreateSnapshot.mockReset();
    mockExtractUserSignals.mockReset();
    mockSaveCopaSnapshot.mockReset();
    mockApi.mockReset();
    mockToastError.mockReset();

    mockLoadCopaSnapshots.mockResolvedValue([
      {
        id: "snapshot-1",
        createdAt: "2026-04-23T00:00:00.000Z",
        language: "en",
        scope: {
          type: "global",
          ref: "global",
          label: "Global history",
          key: "global:global",
        },
        providerScope: ["claude"],
        sourceStats: {
          projectCount: 1,
          sessionCount: 1,
          rawUserMessages: 12,
          dedupedUserMessages: 12,
          truncatedMessages: 0,
        },
        modelConfig: {
          baseUrl: "http://example.com/v1",
          model: "test-model",
          temperature: 0.2,
        },
        promptSummary: "A concise summary.",
        factors: {},
        markdown: "# Profile",
      },
    ]);

    mockLoadFigurePools.mockResolvedValue([
      {
        id: "builtin-scientists",
        name: "Scientists",
        origin: "builtin",
        isDefault: true,
        createdAt: "2026-04-23T00:00:00.000Z",
        updatedAt: "2026-04-23T00:00:00.000Z",
        schemaVersion: 1,
        validationSummary: {
          validCount: 17,
          invalidCount: 3,
          errorCount: 3,
        },
        records: [
          {
            slug: "ada-lovelace",
            name: "Ada Lovelace",
            localized_names: { zh: "阿达·洛芙莱斯" },
            portrait_url: "/ada.png",
            quote_en: "That brain of mine is more than merely mortal; as time will show.",
            quote_zh: "我的头脑绝不只是凡人之物，时间会证明这一点。",
            core_traits: "structured, abstract",
            thinking_style: "Turns complex systems into clear conceptual models.",
            temperament_tags: "calm, rigorous",
            temperament_summary: "Structured and rigorous.",
            loading_copy_zh: "正在把复杂系统翻译成更清晰的结构...",
            loading_copy_en: "Translating complex systems into a clearer structure...",
            bio_zh: "早期计算先驱。",
            bio_en: "An early computing pioneer.",
            achievements_zh: ["成就一"],
            achievements_en: ["Achievement one"],
            status: "valid",
            errors: [],
            updatedAt: "2026-04-23T00:00:00.000Z",
          },
          {
            slug: "grace-hopper",
            name: "Grace Hopper",
            localized_names: { zh: "格蕾丝·霍珀" },
            portrait_url: "/grace.png",
            quote_en: "The most dangerous phrase is: we've always done it this way.",
            quote_zh: "最危险的一句话是：我们一直都是这么做的。",
            core_traits: "pragmatic, precise",
            thinking_style: "Makes systems executable and debuggable.",
            temperament_tags: "direct, practical",
            temperament_summary: "Pragmatic and direct.",
            loading_copy_zh: "正在把抽象判断压缩成可执行的结构...",
            loading_copy_en: "Compressing abstract judgment into executable structure...",
            bio_zh: "编译器先驱。",
            bio_en: "A compiler pioneer.",
            achievements_zh: ["成就二"],
            achievements_en: ["Achievement two"],
            status: "valid",
            errors: [],
            updatedAt: "2026-04-23T00:00:00.000Z",
          },
        ],
      },
    ]);

    mockLoadFigureResonanceHistory.mockResolvedValue([]);
    mockOpenBinaryFileDialog.mockResolvedValue(null);
    mockSaveBinaryFileDialog.mockResolvedValue(true);
    mockExportFigurePoolToZip.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockImportFigurePoolFromZip.mockResolvedValue(null);
    mockInspectFigurePoolZip.mockResolvedValue(null);
    mockExtractUserSignals.mockReturnValue({
      messages: [],
      stats: { userMessages: 0, dedupedMessages: 0, truncatedMessages: 0 },
    });
  });

  it("uses a frosted blue hero palette instead of the old emerald wash", async () => {
    render(<CopaProfilePage />);

    const badge = await screen.findByText("User-only inference");
    const hero = badge.closest("section");

    expect(hero).not.toBeNull();
    expect(hero?.className).toContain("96,165,250");
    expect(hero?.className).toContain("148,163,184");
    expect(hero?.className).not.toContain("22,163,74");

    expect(badge.className).toContain("border-sky-500/20");
    expect(badge.className).toContain("bg-slate-50/80");
    expect(badge.className).toContain("text-slate-700");
    expect(badge.className).not.toContain("emerald");
  });

  it("passes the normalized UI language into CoPA generation and snapshot creation", async () => {
    mockUseTranslation.mockReturnValue({
      t: (
        _key: string,
        fallbackOrOptions?: string | { defaultValue?: string },
        values?: Record<string, string | number>
      ) => {
        if (typeof fallbackOrOptions === "string") {
          return fallbackOrOptions;
        }
        if (fallbackOrOptions?.defaultValue) {
          return fallbackOrOptions.defaultValue;
        }
        return values?.defaultValue ? String(values.defaultValue) : _key;
      },
      i18n: {
        resolvedLanguage: "zh-CN",
        language: "zh-CN",
      },
    });

    mockApi.mockImplementation(async (command: string) => {
      if (command === "load_project_sessions") {
        return [
          {
            actual_session_id: "session-1",
            file_path: "/tmp/echoprofile/session-1.jsonl",
            provider: "claude",
            summary: "Session 1",
          },
        ];
      }
      if (command === "load_provider_messages") {
        return [
          {
            uuid: "u1",
            sessionId: "session-1",
            timestamp: "2026-04-23T00:00:00.000Z",
            type: "user",
            role: "user",
            content: "请保持结构化。",
          },
        ];
      }
      return [];
    });
    mockExtractUserSignals.mockReturnValue({
      messages: ["请保持结构化。"],
      stats: { userMessages: 1, dedupedMessages: 1, truncatedMessages: 0 },
    });
    mockRequestCopaProfile.mockResolvedValue({
      promptSummary: "保持结构化。",
      factors: {},
    });
    mockCreateSnapshot.mockReturnValue({
      id: "snapshot-zh",
      createdAt: "2026-04-23T01:00:00.000Z",
      language: "zh",
      scope: {
        type: "global",
        ref: "global",
        label: "全局历史",
        key: "global:global",
      },
      providerScope: ["claude"],
      sourceStats: {
        projectCount: 1,
        sessionCount: 1,
        rawUserMessages: 1,
        dedupedUserMessages: 1,
        truncatedMessages: 0,
      },
      modelConfig: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        temperature: 0.2,
      },
      promptSummary: "保持结构化。",
      factors: {},
      markdown: "# CoPA 画像",
    });
    mockSaveCopaSnapshot.mockResolvedValue([
      {
        id: "snapshot-zh",
        createdAt: "2026-04-23T01:00:00.000Z",
        language: "zh",
        scope: {
          type: "global",
          ref: "global",
          label: "全局历史",
          key: "global:global",
        },
        providerScope: ["claude"],
        sourceStats: {
          projectCount: 1,
          sessionCount: 1,
          rawUserMessages: 1,
          dedupedUserMessages: 1,
          truncatedMessages: 0,
        },
        modelConfig: {
          baseUrl: "http://example.com/v1",
          model: "test-model",
          temperature: 0.2,
        },
        promptSummary: "保持结构化。",
        factors: {},
        markdown: "# CoPA 画像",
      },
    ]);

    render(<CopaProfilePage />);

    await waitFor(() => {
      expect(screen.getAllByText("A concise summary.").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate CoPA Profile" }));

    await waitFor(() => {
      expect(mockRequestCopaProfile).toHaveBeenCalledWith(
        ["请保持结构化。"],
        expect.objectContaining({ model: "test-model" }),
        "zh",
        "serious"
      );
    });

    expect(mockCreateSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "zh",
        profileMode: "serious",
      })
    );
  });

  it("passes the selected fun profile mode into CoPA generation and snapshot creation", async () => {
    mockApi.mockImplementation(async (command: string) => {
      if (command === "load_project_sessions") {
        return [];
      }
      if (command === "load_provider_messages") {
        return [];
      }
      return [];
    });
    mockExtractUserSignals.mockReturnValue({
      messages: ["Make this playful."],
      stats: { userMessages: 1, dedupedMessages: 1, truncatedMessages: 0 },
    });
    mockRequestCopaProfile.mockResolvedValue({
      promptSummary: "Playful profile.",
      funProfileText: "A playful one-paragraph profile.",
      factors: {},
    });
    mockCreateSnapshot.mockReturnValue({
      id: "snapshot-fun",
      createdAt: "2026-04-23T01:00:00.000Z",
      language: "en",
      profileMode: "fun",
      scope: {
        type: "global",
        ref: "global",
        label: "Global history",
        key: "global:global",
      },
      providerScope: ["claude"],
      sourceStats: {
        projectCount: 1,
        sessionCount: 1,
        rawUserMessages: 1,
        dedupedUserMessages: 1,
        truncatedMessages: 0,
      },
      modelConfig: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        temperature: 0.2,
      },
      promptSummary: "Playful profile.",
      funProfileText: "A playful one-paragraph profile.",
      factors: {},
      markdown: "# CoPA Profile",
    });
    mockSaveCopaSnapshot.mockResolvedValue([]);

    render(<CopaProfilePage />);

    await waitFor(() => {
      expect(screen.getAllByText("A concise summary.").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Fun version" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate CoPA Profile" }));

    await waitFor(() => {
      expect(mockRequestCopaProfile).toHaveBeenCalledWith(
        ["Make this playful."],
        expect.objectContaining({ model: "test-model" }),
        "en",
        "fun"
      );
    });

    expect(mockCreateSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        profileMode: "fun",
        funProfileText: "A playful one-paragraph profile.",
      })
    );
  });

  it("places figure pool controls in the thought echoes section instead of the shared config card", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Thought Echoes" }));

    await waitFor(() => {
      expect(screen.getByText("Figure pool")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open LLM settings" }));

    const figurePoolLabel = screen.getByText("Figure pool");
    const baseUrlLabel = screen.getByText("Base URL");

    expect(
      baseUrlLabel.compareDocumentPosition(figurePoolLabel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows an error toast when CoPA generation fails", async () => {
    mockApi.mockImplementation(async (command: string) => {
      if (command === "load_project_sessions") {
        return [];
      }
      if (command === "load_provider_messages") {
        return [];
      }
      return [];
    });
    mockExtractUserSignals.mockReturnValue({
      messages: ["Please keep this practical."],
      stats: { userMessages: 1, dedupedMessages: 1, truncatedMessages: 0 },
    });
    mockRequestCopaProfile.mockRejectedValue(new Error("CoPA model returned invalid JSON."));

    render(<CopaProfilePage />);

    await waitFor(() => {
      expect(screen.getAllByText("A concise summary.").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate CoPA Profile" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("CoPA model returned invalid JSON.");
    });
  });

  it("shows a pending profile card and rotating figure loading copy while generating a new CoPA profile", async () => {
    let resolveProfile: ((value: unknown) => void) | null = null;
    mockApi.mockImplementation(async (command: string) => {
      if (command === "load_project_sessions") {
        return [];
      }
      if (command === "load_provider_messages") {
        return [];
      }
      return [];
    });
    mockExtractUserSignals.mockReturnValue({
      messages: ["Please keep this practical."],
      stats: { userMessages: 1, dedupedMessages: 1, truncatedMessages: 0 },
    });
    mockRequestCopaProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        })
    );
    mockCreateSnapshot.mockReturnValue({
      id: "snapshot-loading",
      createdAt: "2026-04-23T01:30:00.000Z",
      language: "en",
      scope: {
        type: "global",
        ref: "global",
        label: "Global history",
        key: "global:global",
      },
      providerScope: ["claude"],
      sourceStats: {
        projectCount: 1,
        sessionCount: 1,
        rawUserMessages: 1,
        dedupedUserMessages: 1,
        truncatedMessages: 0,
      },
      modelConfig: {
        baseUrl: "http://example.com/v1",
        model: "test-model",
        temperature: 0.2,
      },
      promptSummary: "Done",
      factors: {},
      markdown: "# Profile",
    });
    mockSaveCopaSnapshot.mockResolvedValue([
      {
        id: "snapshot-loading",
        createdAt: "2026-04-23T01:30:00.000Z",
        language: "en",
        scope: {
          type: "global",
          ref: "global",
          label: "Global history",
          key: "global:global",
        },
        providerScope: ["claude"],
        sourceStats: {
          projectCount: 1,
          sessionCount: 1,
          rawUserMessages: 1,
          dedupedUserMessages: 1,
          truncatedMessages: 0,
        },
        modelConfig: {
          baseUrl: "http://example.com/v1",
          model: "test-model",
          temperature: 0.2,
        },
        promptSummary: "Done",
        factors: {},
        markdown: "# Profile",
      },
    ]);

    render(<CopaProfilePage />);

    await waitFor(() => {
      expect(screen.getAllByText("A concise summary.").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate CoPA Profile" }));

    expect(await screen.findByText("Generating new Profile")).toBeInTheDocument();
    expect(screen.getAllByText("Figure loading copy")).toHaveLength(1);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Translating complex systems into a clearer structure...")).toBeInTheDocument();
    expect(screen.queryByText("Prompt summary")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-04-23T14:40:51.431Z")).not.toBeInTheDocument();
    const profileTrigger = screen.getByLabelText("Choose profile");
    expect(profileTrigger.tagName).toBe("BUTTON");

    expect(profileTrigger).toBeInTheDocument();

    resolveProfile?.({
      promptSummary: "Done",
      factors: {},
    });

    await waitFor(() => {
      expect(screen.queryByText("Generating new Profile")).not.toBeInTheDocument();
    });
  });

  it("renders profile history as a compact dropdown selector", async () => {
    render(<CopaProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Currently selected")).toBeInTheDocument();
    });

    const selector = screen.getByLabelText("Choose profile");
    expect(selector).toBeInTheDocument();
    expect(selector.tagName).toBe("BUTTON");

    expect(screen.getByText("Currently selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Profile" })).toBeInTheDocument();
  });

  it("renders resonance history as a compact dropdown selector", async () => {
    mockLoadFigureResonanceHistory.mockResolvedValue([
      {
        id: "result-2",
        cache_key: "global:global:snapshot-1:en:pool-2",
        scope_key: "global:global",
        profile_id: "snapshot-1",
        pool_id: "pool-2",
        pool_name_snapshot: "Founders",
        pool_updated_at_snapshot: "2026-04-23T02:00:00.000Z",
        generated_at: "2026-04-23T02:00:00.000Z",
        language: "en",
        source: "llm",
        long_term: {
          primary: {
            name: "Jeff Bezos",
            slug: "jeff-bezos",
            portrait_url: "/jeff.png",
            hook: "founder",
            quote_zh: "测试",
            quote_en: "Test",
            reason: "Reason",
            resonance_axes: ["structured"],
            confidence_style: "strong_resonance",
            loading_copy_zh: "加载中",
            loading_copy_en: "Loading",
            bio_zh: "简介",
            bio_en: "Bio",
            achievements_zh: ["成就"],
            achievements_en: ["Achievement"],
          },
          secondary: [],
        },
        recent_state: null,
      },
      {
        id: "result-1",
        cache_key: "global:global:snapshot-1:en:builtin-scientists",
        scope_key: "global:global",
        profile_id: "snapshot-1",
        pool_id: "builtin-scientists",
        pool_name_snapshot: "Scientists",
        pool_updated_at_snapshot: "2026-04-23T01:00:00.000Z",
        generated_at: "2026-04-23T01:00:00.000Z",
        language: "en",
        source: "llm",
        long_term: {
          primary: {
            name: "Enrico Fermi",
            slug: "enrico-fermi",
            portrait_url: "/fermi.png",
            hook: "scientist",
            quote_zh: "测试",
            quote_en: "Test",
            reason: "Reason",
            resonance_axes: ["rigorous"],
            confidence_style: "strong_resonance",
            loading_copy_zh: "加载中",
            loading_copy_en: "Loading",
            bio_zh: "简介",
            bio_en: "Bio",
            achievements_zh: ["成就"],
            achievements_en: ["Achievement"],
          },
          secondary: [],
        },
        recent_state: null,
      },
    ]);

    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Thought Echoes" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Choose history result")).toBeInTheDocument();
    });

    const selector = screen.getByLabelText("Choose history result");
    expect(selector.tagName).toBe("BUTTON");
    expect(selector).toHaveTextContent("Scientists");
    expect(screen.queryByText("Founders")).not.toBeInTheDocument();
  });

  it("renders the project scope selector as a custom dropdown trigger", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: /project/i }));

    const projectSelector = await screen.findByLabelText("Project");
    expect(projectSelector.tagName).toBe("BUTTON");
    expect(projectSelector).toHaveTextContent("EchoProfile");
  });

  it("renders the session scope selector as a custom dropdown trigger", async () => {
    mockApi.mockImplementation(async (command: string) => {
      if (command === "load_project_sessions") {
        return [
          {
            actual_session_id: "session-1",
            file_path: "/tmp/echoprofile/session-1.jsonl",
            provider: "claude",
            summary: "Session 1",
          },
        ];
      }
      return [];
    });

    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: /session/i }));

    const projectSelector = await screen.findByLabelText("Project");
    const sessionSelector = await screen.findByLabelText("Session");

    expect(projectSelector.tagName).toBe("BUTTON");
    expect(sessionSelector.tagName).toBe("BUTTON");
    expect(sessionSelector).toHaveTextContent("Session 1");
  });

  it("renders the figure pool selector as a custom dropdown trigger", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Thought Echoes" }));

    const poolSelector = await screen.findByLabelText("Figure pool");

    expect(poolSelector.tagName).toBe("BUTTON");
    expect(poolSelector).toHaveTextContent("Scientists");
  });

  it("shows an error toast when thought echoes fall back to heuristic generation", async () => {
    const { generateFigureResonance } = await import("@/services/figureResonanceService");
    mockApi.mockImplementation(async (command: string) => {
      if (command === "load_project_sessions") {
        return [
          {
            actual_session_id: "session-1",
            file_path: "/tmp/echoprofile/session-1.jsonl",
            provider: "claude",
            summary: "Session 1",
          },
        ];
      }
      if (command === "load_provider_messages") {
        return [
          {
            uuid: "u1",
            sessionId: "session-1",
            timestamp: "2026-04-23T00:00:00.000Z",
            type: "user",
            role: "user",
            content: "Please keep this practical.",
          },
        ];
      }
      return [];
    });
    mockExtractUserSignals.mockReturnValue({
      messages: ["Please keep this practical."],
      stats: { userMessages: 1, dedupedMessages: 1, truncatedMessages: 0 },
    });
    vi.mocked(generateFigureResonance).mockResolvedValue({
      id: "result-1",
      cache_key: "global:global:snapshot-1:en:builtin-scientists",
      scope_key: "global:global",
      profile_id: "snapshot-1",
      pool_id: "builtin-scientists",
      pool_name_snapshot: "Scientists",
      pool_updated_at_snapshot: "2026-04-23T00:00:00.000Z",
      generated_at: "2026-04-23T01:00:00.000Z",
      language: "en",
      source: "heuristic",
      long_term: {
        primary: {
          name: "Test Figure",
          slug: "test-figure",
          portrait_url: "/test.png",
          hook: "test",
          quote_zh: "测试",
          quote_en: "Test",
          reason: "Fallback reason",
          resonance_axes: ["structured"],
          confidence_style: "strong_resonance",
          loading_copy_zh: "加载中",
          loading_copy_en: "Loading",
          bio_zh: "简介",
          bio_en: "Bio",
          achievements_zh: ["成就"],
          achievements_en: ["Achievement"],
        },
        secondary: [],
      },
      recent_state: null,
    });

    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Thought Echoes" }));

    await waitFor(() => {
      expect(screen.getByText("Figure pool")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Generate Thought Echoes|重新生成/ }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Thought Echoes LLM generation failed. Showing a heuristic fallback result."
      );
    });
  });

  it("shows only pool-management content in the figure pools view", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Figure Pools" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    });

    expect(screen.queryByText("Scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Profile history")).not.toBeInTheDocument();
  });

  it("uses the same active tab styling for figure pools as the CoPA profile tab", async () => {
    render(<CopaProfilePage />);

    const poolsTab = screen.getByRole("button", { name: "Figure Pools" });
    fireEvent.click(poolsTab);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    });

    expect(poolsTab).toHaveClass("bg-foreground", "text-background");
  });

  it("renders the top navigation as individually framed buttons and keeps the hero description on one line", async () => {
    render(<CopaProfilePage />);

    await waitFor(() => {
      expect(screen.getAllByText("A concise summary.").length).toBeGreaterThan(0);
    });

    const profileTab = screen.getByRole("button", { name: "CoPA Profile" });
    const resonanceTab = screen.getByRole("button", { name: "Thought Echoes" });
    const poolsTab = screen.getByRole("button", { name: "Figure Pools" });
    const llmTrigger = screen.getByRole("button", { name: "Open LLM settings" });
    const description = screen.getByText(
      "Generate a factor-based CoPA profile from historical user messages across a session, a project, or your full history."
    );

    expect(profileTab).toHaveClass("border");
    expect(resonanceTab).toHaveClass("border");
    expect(poolsTab).toHaveClass("border");
    expect(llmTrigger).toHaveClass("border");
    expect(profileTab.parentElement).not.toHaveClass("flex-1");
    expect(profileTab.parentElement?.parentElement?.parentElement).toHaveClass("xl:ml-auto");
    expect(profileTab.parentElement?.parentElement?.parentElement).not.toHaveClass("xl:w-[44rem]");
    expect(description).toHaveClass("whitespace-nowrap");
  });

  it("does not render a duplicate next-generation pool summary card in thought echoes", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Thought Echoes" }));

    await waitFor(() => {
      expect(screen.getByText("Figure pool")).toBeInTheDocument();
    });

    expect(screen.queryByText("Next generation pool")).not.toBeInTheDocument();
  });

  it("does not render a duplicate CoPA Profile summary card in thought echoes", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Thought Echoes" }));

    await waitFor(() => {
      expect(screen.getByText("Figure pool")).toBeInTheDocument();
    });

    expect(screen.queryAllByText("A concise summary.")).toHaveLength(1);
  });

  it("keeps the thought echoes controls compact without an extra description or in-panel pool management button", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Thought Echoes" }));

    await waitFor(() => {
      expect(screen.getByText("Figure pool")).toBeInTheDocument();
    });

    expect(
      screen.getAllByText("Map the currently selected CoPA Profile to long-term and recent-state figure mirrors.")
    ).toHaveLength(1);
    expect(screen.queryByText("Thought echoes")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage pools" })).not.toBeInTheDocument();
  });

  it("shows a compact llm config trigger that opens the shared settings panel on demand", async () => {
    render(<CopaProfilePage />);

    await waitFor(() => {
      expect(screen.getAllByText("A concise summary.").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("LLM config")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open LLM settings" }));

    expect(screen.getByText("LLM config")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thought Echoes config" }));
    expect(screen.getByLabelText("Use separate Thought Echoes config")).toBeInTheDocument();
    expect(
      screen.getByText("Thought Echoes will use the CoPA configuration until you enable a separate override.")
    ).toBeInTheDocument();
  });

  it("keeps llm settings as a draft until the user confirms them", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Open LLM settings" }));

    const baseUrlInput = screen.getByDisplayValue("http://example.com/v1");
    fireEvent.change(baseUrlInput, { target: { value: "http://draft.example.com/v1" } });

    expect(mockSaveCopaConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm LLM settings" }));

    await waitFor(() => {
      expect(mockSaveCopaConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          copa: expect.objectContaining({
            baseUrl: "http://draft.example.com/v1",
          }),
        })
      );
    });
  });

  it("persists the configurable discard threshold from the llm settings panel", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Open LLM settings" }));

    const input = screen.getByLabelText("Discard threshold");
    fireEvent.change(input, { target: { value: "80" } });
    fireEvent.blur(input);

    expect(mockSaveCopaConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm LLM settings" }));

    await waitFor(() => {
      expect(mockSaveCopaConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          discardSignalLength: 80,
        })
      );
    });
  });

  it("persists the configurable filter threshold below the discard threshold after confirmation", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Open LLM settings" }));

    const input = screen.getByLabelText("Filter threshold") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("0");

    fireEvent.change(input, { target: { value: "030" } });
    expect(input.value).toBe("030");

    fireEvent.blur(input);

    expect(mockSaveCopaConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm LLM settings" }));

    await waitFor(() => {
      expect(mockSaveCopaConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          pasteLikeSignalLength: 30,
        })
      );
    });
  });

  it("clamps the filter threshold below the discard threshold before saving", async () => {
    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Open LLM settings" }));

    const input = screen.getByLabelText("Filter threshold") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "200" } });
    expect(input.value).toBe("200");

    fireEvent.blur(input);

    expect(mockSaveCopaConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm LLM settings" }));

    await waitFor(() => {
      expect(mockSaveCopaConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          discardSignalLength: 50,
          pasteLikeSignalLength: 49,
        })
      );
    });
  });

  it("opens a rename dialog when an imported pool zip conflicts with an existing pool name", async () => {
    const zipBytes = new Uint8Array([7, 7, 7]);
    const importedPool = {
      id: "pool-imported",
      name: "Scientists Copy",
      origin: "imported",
      isDefault: false,
      createdAt: "2026-04-23T00:00:00.000Z",
      updatedAt: "2026-04-23T00:00:00.000Z",
      schemaVersion: 1,
      validationSummary: {
        validCount: 2,
        invalidCount: 0,
        errorCount: 0,
      },
      records: [],
    };

    mockLoadFigurePools
      .mockResolvedValueOnce([
        {
          id: "builtin-scientists",
          name: "Scientists",
          origin: "builtin",
          isDefault: true,
          createdAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          schemaVersion: 1,
          validationSummary: {
            validCount: 17,
            invalidCount: 3,
            errorCount: 3,
          },
          records: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "builtin-scientists",
          name: "Scientists",
          origin: "builtin",
          isDefault: true,
          createdAt: "2026-04-23T00:00:00.000Z",
          updatedAt: "2026-04-23T00:00:00.000Z",
          schemaVersion: 1,
          validationSummary: {
            validCount: 17,
            invalidCount: 3,
            errorCount: 3,
          },
          records: [],
        },
        importedPool,
      ]);
    mockOpenBinaryFileDialog.mockResolvedValue({
      data: zipBytes,
      name: "scientists.zip",
      size: zipBytes.byteLength,
    });
    mockInspectFigurePoolZip.mockResolvedValue({
      payload: {
        name: "Scientists",
        description: "Imported pool",
        records: [],
      },
      hasNameConflict: true,
      conflictingPoolId: "builtin-scientists",
      conflictingPoolName: "Scientists",
    });
    mockImportFigurePoolFromZip.mockResolvedValue(importedPool);

    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Figure Pools" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(mockInspectFigurePoolZip).toHaveBeenCalledWith(zipBytes);
    });

    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getByDisplayValue("Scientists");

    fireEvent.change(nameInput, {
      target: { value: "Scientists Copy" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(mockImportFigurePoolFromZip).toHaveBeenCalledWith(zipBytes, {
        name: "Scientists Copy",
      });
    });
  });

  it("shows the import size hint and blocks zip files larger than 100 MB", async () => {
    const zipBytes = new Uint8Array([7, 7, 7]);
    mockInspectFigurePoolZip.mockClear();
    mockImportFigurePoolFromZip.mockClear();
    mockOpenBinaryFileDialog.mockResolvedValue({
      data: zipBytes,
      name: "scientists.zip",
      size: 101 * 1024 * 1024,
    });

    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Figure Pools" }));

    await waitFor(() => {
      expect(screen.getByText("ZIP import limit: 100 MB.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(
        screen.getByText("Cannot import files larger than 100 MB.")
      ).toBeInTheDocument();
    });

    expect(mockToastError).toHaveBeenCalledWith("Cannot import files larger than 100 MB.");
    expect(mockInspectFigurePoolZip).not.toHaveBeenCalled();
    expect(mockImportFigurePoolFromZip).not.toHaveBeenCalled();
  });

  it("shows the import size hint in Chinese when the UI language is Chinese", async () => {
    mockUseTranslation.mockReturnValue({
      t: (
        _key: string,
        fallbackOrOptions?: string | { defaultValue?: string },
        values?: Record<string, string | number>
      ) => {
        if (typeof fallbackOrOptions === "string") {
          return fallbackOrOptions;
        }
        if (fallbackOrOptions?.defaultValue) {
          return fallbackOrOptions.defaultValue;
        }
        return values?.defaultValue ? String(values.defaultValue) : _key;
      },
      i18n: {
        resolvedLanguage: "zh-CN",
        language: "zh-CN",
      },
    });

    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Figure Pools" }));

    await waitFor(() => {
      expect(screen.getByText("ZIP 导入上限：100 MB。")).toBeInTheDocument();
    });
  });

  it("shows pool import failures inline in the pools view", async () => {
    const zipBytes = new Uint8Array([7, 7, 7]);
    mockOpenBinaryFileDialog.mockResolvedValue({
      data: zipBytes,
      name: "scientists.zip",
      size: zipBytes.byteLength,
    });
    mockInspectFigurePoolZip.mockResolvedValue({
      payload: {
        name: "Scientists",
        description: "Imported pool",
        records: [],
      },
      hasNameConflict: false,
    });
    mockImportFigurePoolFromZip.mockRejectedValue(new Error("Import blew up"));

    render(<CopaProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Figure Pools" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText("Import blew up")).toBeInTheDocument();
    });

    expect(mockToastError).toHaveBeenCalledWith("Import blew up");
  });
});
