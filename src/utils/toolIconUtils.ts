import { TOOL_VARIANTS, type RendererVariant } from "@/components/renderers/types";

/**
 * Get tool variant from tool name.
 * Delegates to the canonical TOOL_VARIANTS map first (exact match),
 * then falls back to fuzzy matching for unknown/MCP tool names.
 */
export const getToolVariant = (name: string): RendererVariant => {
    // Canonical exact match (covers all known Claude Code tools)
    if (name in TOOL_VARIANTS) {
        return TOOL_VARIANTS[name] as RendererVariant;
    }

    // Fuzzy fallback for unknown tools (MCP plugins, custom tools, legacy names)
    const lower = name.toLowerCase();

    // Use word boundaries or specific patterns to avoid false positives
    if (/\b(read|write|edit|lsp|notebook|replace)\b/.test(lower)) {
        return "code";
    }
    if (/\b(grep|search)\b/.test(lower)) {
        return "search";
    }
    if (/\b(glob|ls|create)\b/.test(lower) || lower === "file") {
        return "file";
    }
    if (/\b(task|todo|agent)\b/.test(lower)) {
        return "task";
    }
    if (/\b(bash|command|shell|kill)\b/.test(lower)) {
        return "terminal";
    }
    if (/\bgit\b/.test(lower)) {
        return "git";
    }
    if (/\b(web|fetch|http)\b/.test(lower)) {
        return "web";
    }
    if (/\b(mcp|server)\b/.test(lower)) {
        return "mcp";
    }
    if (/\b(document|pdf)\b/.test(lower)) {
        return "document";
    }

    return "neutral";
};
