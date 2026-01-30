
import type { ClaudeMessage } from "../types";
import { isClaudeAssistantMessage, isClaudeSystemMessage, isClaudeUserMessage, getToolUseBlock } from "../utils/messageUtils";
import { getToolVariant } from "@/utils/toolIconUtils";
import { matchesBrush, type ActiveBrush } from "@/utils/brushMatchers";

export interface CardSemantics {
    isTool: boolean;
    variant: string | null;
    isError: boolean;
    isCancelled: boolean;
    isCommit: boolean;
    isGit: boolean;
    isShell: boolean;
    shellCommand: string | null;
    isFileEdit: boolean;
    editedMdFile: string | null;
    hasUrls: boolean;
    isMcp: boolean;
    isRawError: boolean;
    brushMatch: boolean;
}

export function getCardSemantics(
    message: ClaudeMessage,
    content: string,
    toolUseBlock: ReturnType<typeof getToolUseBlock>,
    role: string,
    activeBrush: ActiveBrush | null | undefined
): CardSemantics {
    const isTool = !!toolUseBlock;
    const variant = toolUseBlock ? getToolVariant(toolUseBlock.name) : null;

    // Error detection - check both assistant and user messages for tool result errors
    const hasToolError = (msg: ClaudeMessage) => {
        const isAssistantOrUser = isClaudeAssistantMessage(msg) || isClaudeUserMessage(msg);
        if (!isAssistantOrUser) return false;
        
        const result = (msg as { toolUseResult?: Record<string, unknown> | string }).toolUseResult;
        if (typeof result !== 'object' || result === null) return false;
        
        return (result as Record<string, unknown>).is_error === true || 
               (typeof (result as Record<string, unknown>).stderr === 'string' && 
                ((result as Record<string, unknown>).stderr as string).length > 0);
    };
    
    const isError = (isClaudeSystemMessage(message) && message.stopReasonSystem?.toLowerCase().includes("error")) ||
        hasToolError(message);

    // Cancellation detection
    const isCancelled = (isClaudeAssistantMessage(message) && (message.stop_reason === "customer_cancelled" || message.stop_reason === "consumer_cancelled")) ||
        (isClaudeSystemMessage(message) && message.stopReasonSystem === "customer_cancelled") ||
        content.includes("request canceled by user");

    // Git commit detection
    let isCommit = false;
    if (isTool && toolUseBlock) {
        if (['run_command', 'bash', 'execute_command'].includes(toolUseBlock.name)) {
            const cmd = toolUseBlock.input?.CommandLine || toolUseBlock.input?.command;
            isCommit = typeof cmd === 'string' && cmd.includes('git commit');
        }
    }

    // Generic Git command detection (includes commits AND other git ops)
    let isGit = false;
    if (isTool && toolUseBlock) {
        // 1. Explicit tool variant
        if (variant === 'git') isGit = true;
        // 2. Shell command starting with git
        if (['run_command', 'bash', 'execute_command'].includes(toolUseBlock.name)) {
            const cmd = toolUseBlock.input?.CommandLine || toolUseBlock.input?.command;
            if (typeof cmd === 'string' && cmd.trim().startsWith('git')) {
                isGit = true;
            }
        }
    }

    // Shell detection (terminal variant, excluding git ops)
    const isShell = isTool && variant === 'terminal' && !isCommit && !isGit;

    // Shell command text (for display in zoom 1/2)
    const shellCommand = isShell && toolUseBlock
        ? (toolUseBlock.input?.CommandLine || toolUseBlock.input?.command || null) as string | null
        : null;

    // File edit detection
    const isFileEdit = isTool && toolUseBlock
        ? (['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'create_file', 'edit_file', 'Edit', 'Replace'].includes(toolUseBlock.name) || /write|edit|replace|patch/i.test(toolUseBlock.name))
        : false;

    // Collect all edited file paths for brush matching
    const editedFiles: string[] = [];
    let editedMdFile: string | null = null;
    
    if (toolUseBlock) {
        const name = toolUseBlock.name;
        const input = toolUseBlock.input;
        if (['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'create_file', 'edit_file'].includes(name) || /write|edit|replace|patch/i.test(name)) {
            const path = input?.path || input?.file_path || input?.TargetFile || "";
            if (typeof path === 'string' && path) {
                editedFiles.push(path);
                if (path.toLowerCase().endsWith('.md')) {
                    editedMdFile = path;
                }
            }
        }
    }
    if (!editedMdFile && role === 'assistant' && content) {
        const mdMention = content.match(/(create|update|edit|writing|wrote).+?([a-zA-Z0-9_\-. ]+\.md)/i);
        if (mdMention && mdMention[2]) {
            editedMdFile = mdMention[2];
        }
    }

    // URL detection
    const hasUrls = content ? /https?:\/\/[^\s]+/.test(content) : false;

    // MCP detection
    const isMcp = toolUseBlock
        ? toolUseBlock.name === 'mcp'
        : (content.includes('<command-name>/mcp') || content.includes('mcp_server'));

    // Raw error detection (in content text)
    const isRawError = content.includes('<local-command-stdout>Failed') ||
        content.includes('Error:') ||
        content.includes('[ERROR]') ||
        (content.includes('<local-command-stdout>') && content.toLowerCase().includes('failed'));

    // Model detection
    const model = isClaudeAssistantMessage(message) ? message.model : undefined;

    // Brush matching
    const brushMatch = matchesBrush(activeBrush || null, {
        role,
        model,
        variant: variant || "neutral",
        isError: isError || isRawError,
        isCancelled,
        isCommit,
        isGit,
        isShell,
        isFileEdit,
        editedFiles
    });

    return {
        isTool, variant, isError, isCancelled, isCommit, isGit, isShell, shellCommand,
        isFileEdit, editedMdFile, hasUrls, isMcp, isRawError,
        brushMatch
    };
}
