import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveBrowser } from "../components/ArchiveManager/ArchiveBrowser";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/utils/platform", () => ({
  isTauri: () => false,
}));

vi.mock("../components/ArchiveManager/ArchiveCreateDialog", () => ({
  ArchiveCreateDialog: () => <div data-testid="archive-create-dialog" />,
}));

const { mockArchiveApi, mockStore } = vi.hoisted(() => ({
  mockArchiveApi: {
    getBasePath: vi.fn(),
  },
  mockStore: {
    archive: {
      manifest: {
        version: 1,
        archives: [
          {
            id: "archive-1",
            name: "Archive One",
            description: null,
            createdAt: "2026-03-01T00:00:00.000Z",
            sourceProvider: "claude",
            sourceProjectPath: "/projects/a",
            sourceProjectName: "Project A",
            sessionCount: 1,
            totalSizeBytes: 1024,
            includeSubagents: false,
          },
        ],
      },
      currentArchiveId: "archive-1",
      currentArchiveSessions: [
        {
          sessionId: "session-1",
          fileName: "session-1.jsonl",
          originalFilePath: "/projects/a/session-1.jsonl",
          messageCount: 4,
          firstMessageTime: "2026-03-01T00:00:00.000Z",
          lastMessageTime: "2026-03-01T00:05:00.000Z",
          summary: "Preserved session",
          sizeBytes: 512,
          subagentCount: 0,
          subagentSizeBytes: 0,
          subagents: [],
        },
      ],
      currentArchiveSessionsError: null,
      diskUsage: null,
      expiringSessions: [],
      expiringError: null,
      activeTab: "browse" as const,
      isLoadingArchives: false,
      isCreatingArchive: false,
      isDeletingArchive: false,
      isLoadingSessions: false,
      isLoadingExpiring: false,
      isLoadingDiskUsage: false,
      isRenamingArchive: false,
      isExporting: false,
      error: "Export failed",
    },
    loadArchives: vi.fn(async () => {}),
    deleteArchive: vi.fn(async () => {}),
    renameArchive: vi.fn(async () => "archive-1"),
    loadArchiveSessions: vi.fn(async () => {}),
    loadDiskUsage: vi.fn(async () => {}),
    clearArchiveError: vi.fn(),
    exportSession: vi.fn(async () => "{}"),
  },
}));

vi.mock("@/services/archiveApi", () => ({
  archiveApi: mockArchiveApi,
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: () => mockStore,
}));

describe("ArchiveBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArchiveApi.getBasePath.mockResolvedValue("/archives");
  });

  it("keeps loaded sessions visible when an unrelated archive error exists", async () => {
    render(<ArchiveBrowser />);

    await waitFor(() => {
      expect(mockStore.loadArchives).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText("Archive One"));

    expect(await screen.findByText("Preserved session")).toBeInTheDocument();
    expect(screen.queryByText("archive.error.loadSessionsFailed")).not.toBeInTheDocument();
    expect(mockStore.loadArchiveSessions).toHaveBeenCalledWith("archive-1");
  });
});
