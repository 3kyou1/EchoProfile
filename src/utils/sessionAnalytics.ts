import { isClaudeAssistantMessage, isClaudeUserMessage } from "./messageUtils";
import type { ClaudeMessage } from "../types";

export interface SessionStats {
    fileEditCount: number;
    shellCount: number;
    commitCount: number;
    errorCount: number;
    filesTouched: Set<string>;
    hasMarkdownEdits: boolean; // New Flag
    toolBreakdown: Record<string, number>;
    searchCount: number;
    webCount: number;
    mcpCount: number;
}

export function analyzeSessionMessages(messages: ClaudeMessage[]): SessionStats {
    const stats: SessionStats = {
        fileEditCount: 0,
        shellCount: 0,
        commitCount: 0,
        errorCount: 0,
        filesTouched: new Set(),
        hasMarkdownEdits: false,
        toolBreakdown: {},
        searchCount: 0,
        webCount: 0,
        mcpCount: 0
    };

    messages.forEach(msg => {
        // 1. Check for Errors
        let isError = false;

        if (msg.type === 'system' && msg.stopReasonSystem?.toLowerCase().includes("error")) {
            isError = true;
        }

        if (isClaudeUserMessage(msg) && msg.toolUseResult) {
            const result = msg.toolUseResult;
            if (typeof result === 'object' && result !== null) {
                const res = result as Record<string, unknown>;
                if (res.is_error === true || (typeof res.stderr === 'string' && res.stderr.trim().length > 0)) {
                    isError = true;
                }
            }
        }

        if (isError) {
            stats.errorCount++;
        }

        // 2. Scan Tool Usage
        if (isClaudeAssistantMessage(msg) && msg.toolUse) {
            const tool = msg.toolUse;
            const name = (tool.name as string) || "";
            const input = (tool.input as Record<string, unknown>) || {};

            // Track tool name in breakdown
            stats.toolBreakdown[name] = (stats.toolBreakdown[name] || 0) + 1;

            // Detect File Edits
            // Broaden detection to catch multi_replace, atomic writes, etc.
            if (['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'create_file', 'edit_file', 'Edit', 'Replace'].includes(name) || /write|edit|replace|patch/i.test(name)) {
                stats.fileEditCount++;

                const path = input.path || input.file_path || input.TargetFile || input.key;
                if (typeof path === 'string' && path.trim().length > 0) {
                    stats.filesTouched.add(path);

                    if (path.toLowerCase().endsWith('.md') || path.toLowerCase().endsWith('.markdown')) {
                        stats.hasMarkdownEdits = true;
                    }
                }
            }

            // Detect Shell Commands
            if (['run_command', 'bash', 'execute_command'].includes(name)) {
                stats.shellCount++;

                const cmd = input.CommandLine || input.command;
                if (typeof cmd === 'string' && cmd.trim().startsWith('git commit')) {
                    stats.commitCount++;
                }
            }

            // Detect Search
            if (name.toLowerCase().includes('search') || name.toLowerCase().includes('grep')) {
                stats.searchCount++;
            }

            // Detect Web
            if (name.toLowerCase().includes('web') || name.toLowerCase().includes('fetch') || name.toLowerCase().includes('http')) {
                stats.webCount++;
            }

            // Detect MCP
            if (name.toLowerCase().includes('mcp') || name.toLowerCase().includes('server')) {
                stats.mcpCount++;
            }
        }
    });

    return stats;
}
