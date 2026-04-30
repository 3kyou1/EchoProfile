import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { createProjectSlice, type ProjectSlice } from "@/store/slices/projectSlice";
import type { ClaudeProject, ProviderInfo } from "@/types";

const mockApi = vi.fn();
const mockStoreGet = vi.fn();
const mockStoreSet = vi.fn();
const mockStoreSave = vi.fn();

vi.mock("@/services/api", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

vi.mock("@/services/storage", () => ({
  storageAdapter: {
    load: vi.fn(async () => ({
      get: mockStoreGet,
      set: mockStoreSet,
      save: mockStoreSave,
    })),
  },
}));

const codexProvider: ProviderInfo = {
  id: "codex",
  display_name: "Codex CLI",
  base_path: "/home/vepfsdata/.codex",
  is_available: true,
};

const codexProject: ClaudeProject = {
  name: "EchoProfile",
  path: "/home/vepfsdata/.codex/projects/EchoProfile",
  actual_path: "/home/vepfsdata/Desktop/EchoProfile",
  session_count: 1,
  message_count: 10,
  last_modified: "2026-04-27T00:00:00.000Z",
  provider: "codex",
  git_info: null,
};

const createTestStore = () =>
  create<ProjectSlice & Record<string, unknown>>()((set, get, store) => ({
    ...createProjectSlice(
      set as Parameters<typeof createProjectSlice>[0],
      get as Parameters<typeof createProjectSlice>[1],
      store as Parameters<typeof createProjectSlice>[2],
    ),
    providers: [],
    userMetadata: { version: 1, sessions: {}, projects: {}, settings: {} },
    loadMetadata: vi.fn(async () => {
      set({
        userMetadata: { version: 1, sessions: {}, projects: {}, settings: {} },
      });
    }),
    detectProviders: vi.fn(async () => {
      set({ providers: [codexProvider], activeProviders: ["codex"] });
    }),
    addCustomClaudePath: vi.fn(),
    updateUserSettings: vi.fn(),
  }));

describe("projectSlice initialization without a Claude directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreGet.mockResolvedValue(null);
    mockStoreSet.mockResolvedValue(undefined);
    mockStoreSave.mockResolvedValue(undefined);
    mockApi.mockImplementation(async (command: string) => {
      if (command === "get_claude_folder_path") {
        throw new Error("CLAUDE_FOLDER_NOT_FOUND:/home/vepfsdata/.claude");
      }
      if (command === "detect_claude_config_dir") {
        return null;
      }
      if (command === "scan_all_projects") {
        return [codexProject];
      }
      throw new Error(`Unexpected command: ${command}`);
    });
  });

  it("initializes without waiting for provider project scanning", async () => {
    const useStore = createTestStore();
    let resolveScan: (projects: ClaudeProject[]) => void = () => undefined;
    const scanPromise = new Promise<ClaudeProject[]>((resolve) => {
      resolveScan = resolve;
    });
    mockApi.mockImplementation(async (command: string) => {
      if (command === "get_claude_folder_path") {
        throw new Error("CLAUDE_FOLDER_NOT_FOUND:/home/vepfsdata/.claude");
      }
      if (command === "detect_claude_config_dir") {
        return null;
      }
      if (command === "scan_all_projects") {
        return scanPromise;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await useStore.getState().initializeApp();

    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().isLoading).toBe(false);
    expect(useStore.getState().isLoadingProjects).toBe(true);
    expect(useStore.getState().projects).toEqual([]);
    expect(mockApi).toHaveBeenCalledWith("scan_all_projects", expect.objectContaining({
      activeProviders: ["codex"],
      claudePath: undefined,
    }));

    resolveScan([codexProject]);
    await vi.waitFor(() => expect(useStore.getState().projects).toEqual([codexProject]));
  });

  it("hydrates cached projects before background refresh completes", async () => {
    const useStore = createTestStore();
    let resolveScan: (projects: ClaudeProject[]) => void = () => undefined;
    const scanPromise = new Promise<ClaudeProject[]>((resolve) => {
      resolveScan = resolve;
    });
    mockStoreGet.mockImplementation(async (key: string) => (key === "projects" ? [codexProject] : null));
    mockApi.mockImplementation(async (command: string) => {
      if (command === "get_claude_folder_path") {
        throw new Error("CLAUDE_FOLDER_NOT_FOUND:/home/vepfsdata/.claude");
      }
      if (command === "detect_claude_config_dir") {
        return null;
      }
      if (command === "scan_all_projects") {
        return scanPromise;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await useStore.getState().initializeApp();

    expect(useStore.getState().projects).toEqual([codexProject]);
    expect(useStore.getState().isLoadingProjects).toBe(true);

    resolveScan([]);
    await vi.waitFor(() => expect(useStore.getState().isLoadingProjects).toBe(false));
  });

  it("scans Codex projects when claudePath is empty and a non-Claude provider is available", async () => {
    const useStore = createTestStore();
    useStore.setState({ providers: [codexProvider], claudePath: "" });

    await useStore.getState().scanProjects();

    expect(useStore.getState().projects).toEqual([codexProject]);
    expect(mockApi).toHaveBeenCalledWith("scan_all_projects", expect.objectContaining({
      activeProviders: ["codex"],
      claudePath: undefined,
    }));
  });
});
