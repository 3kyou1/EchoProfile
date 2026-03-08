import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectSessions } from "../hooks/useProjectSessions";
import type { ClaudeProject, ClaudeSession } from "../types";

vi.mock("@/services/api", () => ({
  api: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const { mockUseAppStore } = vi.hoisted(() => ({
  mockUseAppStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ excludeSidechain: false })),
  }),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: mockUseAppStore,
}));

import { api } from "@/services/api";
import { toast } from "sonner";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const createProject = (name: string, path: string): ClaudeProject => ({
  name,
  path,
  actual_path: path,
  session_count: 1,
  message_count: 1,
  last_modified: "2026-03-01T00:00:00.000Z",
  provider: "claude",
});

const createSession = (filePath: string, projectName: string): ClaudeSession => ({
  session_id: filePath,
  actual_session_id: filePath.split("/").pop()?.replace(".jsonl", "") ?? "session",
  file_path: filePath,
  project_name: projectName,
  message_count: 5,
  first_message_time: "2026-03-01T00:00:00.000Z",
  last_message_time: "2026-03-01T00:05:00.000Z",
  last_modified: "2026-03-01T00:05:00.000Z",
  has_tool_use: false,
  has_errors: false,
  summary: `${projectName} summary`,
  provider: "claude",
});

describe("useProjectSessions", () => {
  const mockApi = vi.mocked(api);
  const mockToastError = vi.mocked(toast.error);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppStore.getState.mockReturnValue({ excludeSidechain: false });
  });

  it("keeps the latest project sessions when earlier requests resolve late", async () => {
    const first = createDeferred<ClaudeSession[]>();
    const second = createDeferred<ClaudeSession[]>();
    const projectA = createProject("Project A", "/projects/a");
    const projectB = createProject("Project B", "/projects/b");
    const projectASessions = [createSession("/projects/a/a.jsonl", "Project A")];
    const projectBSessions = [createSession("/projects/b/b.jsonl", "Project B")];

    mockApi.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useProjectSessions());

    let firstLoad!: Promise<void>;
    let secondLoad!: Promise<void>;

    act(() => {
      firstLoad = result.current.loadSessions(projectA);
    });
    act(() => {
      secondLoad = result.current.loadSessions(projectB);
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      second.resolve(projectBSessions);
      await secondLoad;
    });

    expect(result.current.sessions).toEqual(projectBSessions);
    expect(result.current.mainSessions).toEqual(projectBSessions);
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      first.resolve(projectASessions);
      await firstLoad;
    });

    expect(result.current.sessions).toEqual(projectBSessions);
    expect(result.current.mainSessions).toEqual(projectBSessions);
    expect(result.current.isLoading).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("invalidates in-flight loads when sessions are cleared", async () => {
    const deferred = createDeferred<ClaudeSession[]>();
    const project = createProject("Project A", "/projects/a");
    const sessions = [createSession("/projects/a/a.jsonl", "Project A")];

    mockApi.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() => useProjectSessions());

    let loadPromise!: Promise<void>;
    act(() => {
      loadPromise = result.current.loadSessions(project);
    });

    act(() => {
      result.current.clearSessions();
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.mainSessions).toEqual([]);
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      deferred.resolve(sessions);
      await loadPromise;
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.mainSessions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
