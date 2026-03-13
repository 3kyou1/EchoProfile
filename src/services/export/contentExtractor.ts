/**
 * Content Extractor
 *
 * Shared utility for extracting readable text from ClaudeMessage content.
 * Used by all export format converters.
 */

import type { ContentItem } from "@/types/core/tool";

export interface ExtractedBlock {
  kind: "text" | "thinking" | "tool" | "result" | "media" | "search" | "code";
  text: string;
}

function summarizeInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(input)) {
    if (val == null) continue;
    if (typeof val === "string") {
      const truncated = val.length > 120 ? `${val.slice(0, 120)}...` : val;
      parts.push(`${key}: ${truncated}`);
    } else if (typeof val === "boolean" || typeof val === "number") {
      parts.push(`${key}: ${val}`);
    }
  }
  return parts.join(", ");
}

export function extractBlocks(content: string | ContentItem[] | Record<string, unknown> | undefined): ExtractedBlock[] {
  if (content == null) return [];
  if (typeof content === "string") return [{ kind: "text", text: content }];
  if (!Array.isArray(content)) return [];

  const blocks: ExtractedBlock[] = [];

  for (const item of content) {
    if (!("type" in item)) continue;

    switch (item.type) {
      case "text":
        if ("text" in item && typeof item.text === "string") {
          blocks.push({ kind: "text", text: item.text });
        }
        break;

      case "thinking":
        if ("thinking" in item && typeof item.thinking === "string") {
          blocks.push({ kind: "thinking", text: item.thinking });
        }
        break;

      case "redacted_thinking":
        blocks.push({ kind: "thinking", text: "[Redacted thinking]" });
        break;

      case "tool_use":
        if ("name" in item && typeof item.name === "string") {
          const input = "input" in item && typeof item.input === "object" && item.input != null
            ? summarizeInput(item.input as Record<string, unknown>)
            : "";
          const detail = input ? `${item.name}(${input})` : item.name;
          blocks.push({ kind: "tool", text: detail });
        }
        break;

      case "tool_result":
        if ("content" in item) {
          const c = item.content;
          const isError = "is_error" in item && item.is_error;
          const prefix = isError ? "[Error] " : "";
          if (typeof c === "string") {
            const truncated = c.length > 500 ? `${c.slice(0, 500)}...` : c;
            blocks.push({ kind: "result", text: `${prefix}${truncated}` });
          } else {
            blocks.push({ kind: "result", text: `${prefix}[Tool result]` });
          }
        }
        break;

      case "server_tool_use":
        if ("name" in item && typeof item.name === "string") {
          blocks.push({ kind: "tool", text: `[Server: ${item.name}]` });
        }
        break;

      case "web_search_tool_result":
        if ("search_results" in item && Array.isArray(item.search_results)) {
          const urls = item.search_results
            .slice(0, 5)
            .map((r: Record<string, unknown>) => r.url ?? r.title ?? "")
            .filter(Boolean)
            .join(", ");
          blocks.push({ kind: "search", text: `[Web search: ${urls}]` });
        } else {
          blocks.push({ kind: "search", text: "[Web search results]" });
        }
        break;

      case "web_fetch_tool_result":
        if ("url" in item && typeof item.url === "string") {
          blocks.push({ kind: "search", text: `[Web fetch: ${item.url}]` });
        } else {
          blocks.push({ kind: "search", text: "[Web fetch result]" });
        }
        break;

      case "code_execution_tool_result":
      case "bash_code_execution_tool_result":
      case "text_editor_code_execution_tool_result": {
        const stdout = "stdout" in item && typeof item.stdout === "string" ? item.stdout : "";
        const truncated = stdout.length > 300 ? `${stdout.slice(0, 300)}...` : stdout;
        blocks.push({ kind: "code", text: truncated || `[${item.type}]` });
        break;
      }

      case "tool_search_tool_result":
        blocks.push({ kind: "result", text: "[Tool search result]" });
        break;

      case "image":
        blocks.push({ kind: "media", text: "[Image]" });
        break;

      case "document":
        if ("title" in item && typeof item.title === "string") {
          blocks.push({ kind: "media", text: `[Document: ${item.title}]` });
        } else {
          blocks.push({ kind: "media", text: "[Document]" });
        }
        break;

      case "search_result":
        if ("title" in item && typeof item.title === "string") {
          blocks.push({ kind: "search", text: `[Search: ${item.title}]` });
        } else {
          blocks.push({ kind: "search", text: "[Search result]" });
        }
        break;

      case "mcp_tool_use":
        if ("name" in item && typeof item.name === "string") {
          blocks.push({ kind: "tool", text: `[MCP: ${item.name}]` });
        }
        break;

      case "mcp_tool_result":
        blocks.push({ kind: "result", text: "[MCP result]" });
        break;

      default:
        blocks.push({ kind: "text", text: `[${String((item as Record<string, unknown>).type)}]` });
        break;
    }
  }

  return blocks;
}

/**
 * Flatten blocks to plain text (for JSON export).
 */
export function blocksToPlainText(blocks: ExtractedBlock[]): string {
  return blocks.map((b) => b.text).join("\n\n");
}
