import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportToJson } from "@/services/export/jsonExporter";
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

describe("jsonExporter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should output valid JSON with 2-space indent", () => {
    const messages = [
      makeMessage({ type: "user", content: "Hello" }),
    ];
    const result = exportToJson(messages, "test-session");
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed).toBeDefined();
    expect(result).toContain("  ");
  });

  it("should include session metadata", () => {
    const messages = [
      makeMessage({ type: "user", content: "Hello" }),
    ];
    const result = exportToJson(messages, "my-session");
    const parsed = JSON.parse(result) as { session: string; exportedAt: string };

    expect(parsed.session).toBe("my-session");
    expect(parsed.exportedAt).toBe("2026-03-13T12:00:00.000Z");
  });

  it("should map user messages with correct role", () => {
    const messages = [
      makeMessage({ type: "user", content: "question" }),
    ];
    const result = exportToJson(messages, "test");
    const parsed = JSON.parse(result) as { messages: Array<{ role: string; content: string }> };

    expect(parsed.messages[0]?.role).toBe("user");
    expect(parsed.messages[0]?.content).toBe("question");
  });

  it("should include model for assistant messages", () => {
    const messages = [
      makeMessage({ type: "assistant", content: "answer", model: "claude-opus-4-20250514" } as Partial<ClaudeMessage> & { type: "assistant" }),
    ];
    const result = exportToJson(messages, "test");
    const parsed = JSON.parse(result) as { messages: Array<{ model?: string }> };

    expect(parsed.messages[0]?.model).toBe("claude-opus-4-20250514");
  });

  it("should exclude sidechain messages", () => {
    const messages = [
      makeMessage({ type: "user", content: "visible" }),
      makeMessage({ type: "user", content: "hidden", isSidechain: true }),
    ];
    const result = exportToJson(messages, "test");
    const parsed = JSON.parse(result) as { messages: Array<{ content: string }> };

    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]?.content).toBe("visible");
  });

  it("should extract text from ContentItem array", () => {
    const messages = [
      makeMessage({
        type: "assistant",
        content: [
          { type: "text", text: "Part A" },
          { type: "text", text: "Part B" },
        ],
      }),
    ];
    const result = exportToJson(messages, "test");
    const parsed = JSON.parse(result) as { messages: Array<{ content: string }> };

    expect(parsed.messages[0]?.content).toContain("Part A");
    expect(parsed.messages[0]?.content).toContain("Part B");
  });

  it("should include message count stats", () => {
    const messages = [
      makeMessage({ type: "user", content: "q1" }),
      makeMessage({ type: "assistant", content: "a1" }),
    ];
    const result = exportToJson(messages, "test");
    const parsed = JSON.parse(result) as { messageCount: { total: number; user: number; assistant: number } };

    expect(parsed.messageCount.total).toBe(2);
    expect(parsed.messageCount.user).toBe(1);
    expect(parsed.messageCount.assistant).toBe(1);
  });

  it("should include token usage for assistant messages", () => {
    const messages = [
      makeMessage({
        type: "assistant",
        content: "answer",
        usage: { input_tokens: 1000, output_tokens: 500 },
      } as Partial<ClaudeMessage> & { type: "assistant" }),
    ];
    const result = exportToJson(messages, "test");
    const parsed = JSON.parse(result) as { messages: Array<{ usage?: { input_tokens: number; output_tokens: number } }> };

    expect(parsed.messages[0]?.usage?.input_tokens).toBe(1000);
    expect(parsed.messages[0]?.usage?.output_tokens).toBe(500);
  });

  it("should replace image content with placeholder", () => {
    const messages = [
      makeMessage({
        type: "assistant",
        content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } }],
      }),
    ];
    const result = exportToJson(messages, "test");
    const parsed = JSON.parse(result) as { messages: Array<{ content: string }> };

    expect(parsed.messages[0]?.content).toContain("[Image]");
  });
});
