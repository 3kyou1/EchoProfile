import { describe, it, expect } from "vitest";
import { extractBlocks, blocksToPlainText } from "@/services/export/contentExtractor";

describe("contentExtractor", () => {
  it("should return empty array for null/undefined", () => {
    expect(extractBlocks(null as unknown as undefined)).toEqual([]);
    expect(extractBlocks(undefined)).toEqual([]);
  });

  it("should wrap plain string as text block", () => {
    const blocks = extractBlocks("hello world");
    expect(blocks).toEqual([{ kind: "text", text: "hello world" }]);
  });

  it("should extract text content items", () => {
    const blocks = extractBlocks([
      { type: "text", text: "First" },
      { type: "text", text: "Second" },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ kind: "text", text: "First" });
  });

  it("should extract thinking as thinking kind", () => {
    const blocks = extractBlocks([{ type: "thinking", thinking: "Let me think..." }]);
    expect(blocks[0]).toEqual({ kind: "thinking", text: "Let me think..." });
  });

  it("should handle redacted thinking", () => {
    const blocks = extractBlocks([{ type: "redacted_thinking" }]);
    expect(blocks[0]).toEqual({ kind: "thinking", text: "[Redacted thinking]" });
  });

  it("should include tool_use input summary", () => {
    const blocks = extractBlocks([
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/src/main.ts" } },
    ]);
    expect(blocks[0]?.kind).toBe("tool");
    expect(blocks[0]?.text).toContain("Read");
    expect(blocks[0]?.text).toContain("file_path: /src/main.ts");
  });

  it("should truncate long tool input values", () => {
    const longValue = "x".repeat(200);
    const blocks = extractBlocks([
      { type: "tool_use", id: "t1", name: "Write", input: { content: longValue } },
    ]);
    expect(blocks[0]?.text).toContain("...");
    expect(blocks[0]!.text.length).toBeLessThan(200);
  });

  it("should handle tool_result with string content", () => {
    const blocks = extractBlocks([
      { type: "tool_result", tool_use_id: "t1", content: "File contents here" },
    ]);
    expect(blocks[0]).toEqual({ kind: "result", text: "File contents here" });
  });

  it("should handle tool_result errors", () => {
    const blocks = extractBlocks([
      { type: "tool_result", tool_use_id: "t1", content: "Not found", is_error: true },
    ]);
    expect(blocks[0]?.text).toContain("[Error]");
  });

  it("should handle image content", () => {
    const blocks = extractBlocks([{ type: "image" }]);
    expect(blocks[0]).toEqual({ kind: "media", text: "[Image]" });
  });

  it("should handle server_tool_use", () => {
    const blocks = extractBlocks([{ type: "server_tool_use", id: "s1", name: "web_search" }]);
    expect(blocks[0]).toEqual({ kind: "tool", text: "[Server: web_search]" });
  });

  it("should handle document with title", () => {
    const blocks = extractBlocks([{ type: "document", title: "README.md" }]);
    expect(blocks[0]).toEqual({ kind: "media", text: "[Document: README.md]" });
  });

  it("should handle mcp_tool_use", () => {
    const blocks = extractBlocks([{ type: "mcp_tool_use", name: "query-docs" }]);
    expect(blocks[0]).toEqual({ kind: "tool", text: "[MCP: query-docs]" });
  });

  it("should handle unknown types with type label", () => {
    const blocks = extractBlocks([{ type: "future_type" }]);
    expect(blocks[0]).toEqual({ kind: "text", text: "[future_type]" });
  });

  it("should convert blocks to plain text", () => {
    const blocks = [
      { kind: "text" as const, text: "Hello" },
      { kind: "tool" as const, text: "Read(file: test.ts)" },
    ];
    const text = blocksToPlainText(blocks);
    expect(text).toBe("Hello\n\nRead(file: test.ts)");
  });
});
