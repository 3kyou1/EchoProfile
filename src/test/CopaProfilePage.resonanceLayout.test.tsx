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

vi.mock("react-i18next", () => ({
  useTranslation: () => mockUseTranslation(),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: () => mockUseAppStore(),
}));

vi.mock("@/services/api", () => ({
  api: (...args: unknown[]) => mockApi(...args),
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
    });

    mockSaveCopaConfig.mockImplementation(async (next) => next);
    mockRequestCopaProfile.mockReset();
    mockCreateSnapshot.mockReset();
    mockExtractUserSignals.mockReset();
    mockSaveCopaSnapshot.mockReset();
    mockApi.mockReset();

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
        records: [],
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
        "zh"
      );
    });

    expect(mockCreateSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "zh",
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

  it("renders the top navigation as individually framed buttons and keeps the hero description on one line", () => {
    render(<CopaProfilePage />);

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

    expect(screen.queryByText("LLM config")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open LLM settings" }));

    expect(screen.getByText("LLM config")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thought Echoes config" }));
    expect(screen.getByLabelText("Use separate Thought Echoes config")).toBeInTheDocument();
    expect(
      screen.getByText("Thought Echoes will use the CoPA configuration until you enable a separate override.")
    ).toBeInTheDocument();
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
    mockOpenBinaryFileDialog.mockResolvedValue(zipBytes);
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
});
