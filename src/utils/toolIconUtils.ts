import type { RendererVariant } from "@/components/renderers";

/** Get tool variant from tool name */
export const getToolVariant = (name: string): RendererVariant => {
    const lower = name.toLowerCase();

    // Code operations (Blue)
    if (lower.includes("read") || lower.includes("write") || lower.includes("edit") || lower.includes("lsp") || lower.includes("notebook")) {
        return "code";
    }

    // File operations (Teal)
    if (lower.includes("glob") || lower.includes("ls") || lower === "file") {
        return "file";
    }

    // Search operations (Violet)
    if (lower.includes("grep") || lower.includes("search")) {
        return "search";
    }

    // Task management (Amber)
    if (lower.includes("task") || lower.includes("todo") || lower.includes("agent")) {
        return "task";
    }

    // System/Shell operations (Gray)
    if (lower.includes("bash") || lower.includes("command") || lower.includes("shell") || lower.includes("kill")) {
        return "terminal";
    }

    // Git operations (Cyan)
    if (lower.includes("git")) {
        return "git";
    }

    // Web operations (Sky Blue)
    if (lower.includes("web") || lower.includes("fetch") || lower.includes("http")) {
        return "web";
    }

    // MCP operations (Magenta)
    if (lower.includes("mcp") || lower.includes("server")) {
        return "mcp";
    }

    // Document operations (Teal)
    if (lower.includes("document") || lower.includes("pdf")) {
        return "document";
    }

    return "neutral";
};
