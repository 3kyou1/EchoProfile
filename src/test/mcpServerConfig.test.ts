import { describe, expect, it } from "vitest";

import {
  buildMcpServerConfig,
  formatMcpServerDetails,
  isValidHttpMcpUrl,
} from "@/components/SettingsManager/sections/mcpServerConfig";

describe("mcpServerConfig", () => {
  it("builds stdio configs with command, args, and env", () => {
    expect(
      buildMcpServerConfig({
        type: "stdio",
        command: "npx",
        argsText: "-y @modelcontextprotocol/server-filesystem",
        url: "",
        env: { API_KEY: "secret" },
      })
    ).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      env: { API_KEY: "secret" },
    });
  });

  it("builds HTTP configs with URL only", () => {
    expect(
      buildMcpServerConfig({
        type: "http",
        command: "npx",
        argsText: "-y ignored",
        url: " https://api.example.com/mcp ",
        env: { API_KEY: "secret" },
      })
    ).toEqual({
      type: "http",
      url: "https://api.example.com/mcp",
    });
  });

  it("validates only HTTP and HTTPS MCP URLs", () => {
    expect(isValidHttpMcpUrl("https://api.example.com/mcp")).toBe(true);
    expect(isValidHttpMcpUrl("http://localhost:3000/mcp")).toBe(true);
    expect(isValidHttpMcpUrl("ftp://example.com/mcp")).toBe(false);
    expect(isValidHttpMcpUrl("not a url")).toBe(false);
    expect(isValidHttpMcpUrl("")).toBe(false);
  });

  it("formats HTTP servers without leaking an undefined command", () => {
    expect(formatMcpServerDetails({ type: "http", url: "https://api.example.com/mcp" })).toBe(
      "https://api.example.com/mcp"
    );
  });
});
