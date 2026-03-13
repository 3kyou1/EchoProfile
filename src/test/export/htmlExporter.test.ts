import { describe, it, expect } from "vitest";
import { exportToHtml } from "@/services/export/htmlExporter";
import type { ClaudeMessage } from "@/types";

function makeMessage(overrides: Partial<ClaudeMessage> & { type: ClaudeMessage["type"] }): ClaudeMessage {
  return {
    uuid: "test-uuid",
    sessionId: "test-session",
    timestamp: "2026-03-13T10:30:15.000Z",
    content: "",
    ...overrides,
  } as ClaudeMessage;
}

describe("htmlExporter", () => {
  it("should produce standalone HTML with inline styles", () => {
    const messages = [
      makeMessage({ type: "user", content: "Hello" }),
    ];
    const result = exportToHtml(messages, "test-session");

    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<style>");
    expect(result).not.toMatch(/<link\s+rel="stylesheet"/);
  });

  it("should include session title", () => {
    const messages = [
      makeMessage({ type: "user", content: "Hello" }),
    ];
    const result = exportToHtml(messages, "my-session");

    expect(result).toContain("<title>Session: my-session</title>");
    expect(result).toContain("<h1>Session: my-session</h1>");
  });

  it("should include message count stats", () => {
    const messages = [
      makeMessage({ type: "user", content: "q1" }),
      makeMessage({ type: "assistant", content: "a1" }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).toContain("1 user / 1 assistant");
  });

  it("should render user messages with user class", () => {
    const messages = [
      makeMessage({ type: "user", content: "question" }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).toContain('class="role user"');
    expect(result).toContain("User");
    expect(result).toContain("question");
  });

  it("should render assistant messages with assistant class", () => {
    const messages = [
      makeMessage({ type: "assistant", content: "answer" }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).toContain('class="role assistant"');
    expect(result).toContain("Assistant");
  });

  it("should escape HTML in content", () => {
    const messages = [
      makeMessage({ type: "user", content: '<script>alert("xss")</script>' }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("should exclude sidechain messages", () => {
    const messages = [
      makeMessage({ type: "user", content: "visible" }),
      makeMessage({ type: "user", content: "hidden", isSidechain: true }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).toContain("visible");
    expect(result).not.toContain("hidden");
  });

  it("should replace image content with placeholder", () => {
    const messages = [
      makeMessage({
        type: "assistant",
        content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } }],
      }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).toContain("[Image]");
  });

  it("should include print media query", () => {
    const messages = [
      makeMessage({ type: "user", content: "test" }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).toContain("@media print");
  });

  it("should render tool_use with styled div", () => {
    const messages = [
      makeMessage({
        type: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/test.ts" } }],
      }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).toContain('class="tool"');
    expect(result).toContain("Read(file_path: /test.ts)");
  });

  it("should render thinking in collapsible details", () => {
    const messages = [
      makeMessage({
        type: "assistant",
        content: [{ type: "thinking", thinking: "Analyzing..." }],
      }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).toContain("<details>");
    expect(result).toContain("Analyzing...");
  });

  it("should show model name for assistant messages", () => {
    const messages = [
      makeMessage({
        type: "assistant",
        content: "response",
        model: "claude-opus-4-20250514",
      } as Partial<ClaudeMessage> & { type: "assistant" }),
    ];
    const result = exportToHtml(messages, "test");

    expect(result).toContain("claude-opus-4-20250514");
  });
});
