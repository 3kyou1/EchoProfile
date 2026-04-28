import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Header } from "@/layouts/Header/Header";
import type { UseAnalyticsReturn } from "@/types/analytics";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("@/contexts/modal", () => ({
  useModal: () => ({ openModal: vi.fn() }),
}));

vi.mock("@/utils/platform", () => ({
  isMacOS: () => false,
}));

vi.mock("@/shared/TooltipButton", () => ({
  TooltipButton: ({
    children,
    content,
    ...props
  }: React.ComponentProps<"button"> & { content: string }) => (
    <button type="button" aria-label={content} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/layouts/Header/SettingDropdown", () => ({
  SettingDropdown: () => <div data-testid="settings-dropdown" />,
}));

const mockStore = {
  projects: [],
  selectedProject: null,
  selectedSession: null,
  isLoadingMessages: false,
  refreshCurrentSession: vi.fn(),
};

vi.mock("@/store/useAppStore", () => ({
  useAppStore: () => mockStore,
}));

function createAnalyticsComputed(): UseAnalyticsReturn["computed"] {
  return {
    isTokenStatsView: false,
    isAnalyticsView: false,
    isMessagesView: false,
    isRecentEditsView: false,
    isSettingsView: false,
    isBoardView: false,
    isArchiveView: false,
    isMyTraceView: false,
    isCopaProfileView: false,
    hasAnyError: false,
    isLoadingAnalytics: false,
    isLoadingTokenStats: false,
    isLoadingRecentEdits: false,
    isAnyLoading: false,
  };
}

describe("Header My Trace navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.projects = [];
    mockStore.selectedProject = null;
    mockStore.selectedSession = null;
  });

  it("keeps My Trace clickable before projects are loaded", async () => {
    const switchToMyTrace = vi.fn();
    const analyticsActions = {
      switchToMyTrace,
      switchToMessages: vi.fn(),
      switchToTokenStats: vi.fn(),
      switchToAnalytics: vi.fn(),
      switchToRecentEdits: vi.fn(),
      switchToSettings: vi.fn(),
      switchToBoard: vi.fn(),
      switchToArchive: vi.fn(),
      switchToCopaProfile: vi.fn(),
      setStatsMode: vi.fn(),
      setMetricMode: vi.fn(),
      refreshAnalytics: vi.fn(),
      clearAll: vi.fn(),
    } as unknown as UseAnalyticsReturn["actions"];

    render(
      <Header
        analyticsActions={analyticsActions}
        analyticsComputed={createAnalyticsComputed()}
        updater={{} as never}
      />,
    );

    const button = screen.getByRole("button", { name: "My Trace" });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(switchToMyTrace).toHaveBeenCalledTimes(1);
  });
});
