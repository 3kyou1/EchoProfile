import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsManagerContext, type SettingsManagerContextValue } from "@/components/SettingsManager/UnifiedSettingsManager";
import { MCPServersSection } from "@/components/SettingsManager/sections/MCPServersSection";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function renderSection(overrides: Partial<SettingsManagerContextValue> = {}) {
  const value: SettingsManagerContextValue = {
    allSettings: null,
    activeScope: "user",
    setActiveScope: vi.fn(),
    currentSettings: {},
    isReadOnly: false,
    projectPath: "/test/project",
    setProjectPath: vi.fn(),
    activePanel: "editor",
    setActivePanel: vi.fn(),
    pendingSettings: null,
    setPendingSettings: vi.fn(),
    hasUnsavedChanges: false,
    mcpServers: {
      userClaudeJson: {},
      localClaudeJson: {},
      userSettings: {},
      userMcpFile: {},
      projectMcpFile: {},
    },
    saveMCPServers: vi.fn(),
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    ...overrides,
  };

  return render(
    <SettingsManagerContext.Provider value={value}>
      <MCPServersSection isExpanded onToggle={vi.fn()} readOnly={false} />
    </SettingsManagerContext.Provider>
  );
}

describe("MCPServersSection", () => {
  it("renders HTTP MCP servers by URL and keeps long row text bounded", () => {
    renderSection({
      mcpServers: {
        userClaudeJson: {
          "remote-server-with-a-very-long-name-that-should-not-cover-badges": {
            type: "http",
            url: "https://api.example.com/mcp",
          },
        },
        localClaudeJson: {},
        userSettings: {},
        userMcpFile: {},
        projectMcpFile: {},
      },
    });

    expect(screen.getByText("https://api.example.com/mcp")).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    expect(
      screen.getByText("remote-server-with-a-very-long-name-that-should-not-cover-badges")
    ).toHaveClass("min-w-0");
  });
});
