import { memo, useMemo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ClaudeMessage } from "../../types";
import type { ZoomLevel } from "../../types/board.types";
import { ToolIcon } from "../ToolIcon";
import { extractClaudeMessageContent } from "../../utils/messageUtils";
import { clsx } from "clsx";
import { FileText, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAppStore } from "../../store/useAppStore";

interface InteractionCardProps {
    message: ClaudeMessage;
    zoomLevel: ZoomLevel;
    isActive: boolean; // For brushing
    isExpanded: boolean; // For click expansion
    onHover?: (type: "role" | "status" | "tool" | "file", value: string) => void;
    onLeave?: () => void;
    onClick?: () => void;
}

const ExpandedCard = ({
    message,
    content,
    toolInput,
    editedMdFile,
    role,
    isError,
    triggerRect,
    isMarkdownPretty,
    onClose
}: {
    message: ClaudeMessage;
    content: string;
    toolInput: string;
    editedMdFile: string | null;
    role: string;
    isError: boolean;
    triggerRect: DOMRect | null;
    isMarkdownPretty: boolean;
    onClose: () => void;
}) => {
    if (!triggerRect) return null;

    // Calculate position: default to right, sticky to screen
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const cardWidth = 480; // Reasonable reading width
    const gap = 12;

    let left = triggerRect.right + gap;
    let top = triggerRect.top;

    // Flip to left if not enough space on right
    if (left + cardWidth > windowWidth - 20) {
        left = triggerRect.left - cardWidth - gap;
    }

    // Adjust top if bottom overflow
    const maxHeight = Math.min(600, windowHeight - 40);
    if (top + maxHeight > windowHeight - 20) {
        top = Math.max(20, windowHeight - maxHeight - 20);
    }

    // If top is initially offscreen (e.g. card is scrolled partially out), clamp it
    if (top < 20) top = 20;

    const displayContent = content || (message.toolUse ? JSON.stringify((message.toolUse as any).input, null, 2) : "No content");

    return createPortal(
        <div className="fixed inset-0 z-50 pointer-events-none">
            {/* Click backdrop to close */}
            <div className="absolute inset-0 pointer-events-auto" onClick={(e) => { e.stopPropagation(); onClose(); }} />

            <div
                className="absolute w-[480px] bg-popover/95 text-popover-foreground border border-border rounded-lg shadow-2xl flex flex-col backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-auto ring-1 ring-border/50"
                style={{
                    left: `${left}px`,
                    top: `${top}px`,
                    maxHeight: `${maxHeight}px`,
                    transformOrigin: left > triggerRect.right ? 'left top' : 'right top'
                }}
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
            >
                <div className="flex items-center justify-between p-3 border-b border-border/50 bg-muted/30 rounded-t-lg shrink-0 select-none">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-background rounded-md shadow-sm border border-border/50">
                            {message.toolUse ? (
                                <ToolIcon toolName={(message.toolUse as any).name} className="w-4 h-4 text-accent" />
                            ) : (
                                <div className={clsx("w-3 h-3 rounded-full", role === 'user' ? 'bg-primary' : 'bg-muted-foreground')} />
                            )}
                        </div>

                        <div className="flex flex-col gap-0.5">
                            <span className={clsx("font-bold uppercase text-[11px] tracking-wide",
                                message.toolUse ? "text-accent" : (role === 'user' ? 'text-primary' : 'text-foreground')
                            )}>
                                {message.toolUse ? (message.toolUse as any).name : role}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono leading-none">
                                {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                        </div>

                        {editedMdFile && (
                            <div className="ml-2 flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-600 font-medium">
                                <FileText className="w-2.5 h-2.5" />
                                <span className="max-w-[100px] truncate">{editedMdFile}</span>
                            </div>
                        )}
                    </div>

                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text">
                    {isMarkdownPretty && !message.toolUse ? (
                        <div className="prose prose-xs dark:prose-invert max-w-none break-words">
                            <ReactMarkdown>{displayContent}</ReactMarkdown>
                        </div>
                    ) : (
                        displayContent
                    )}
                </div>

                {isError && (
                    <div className="px-4 py-2 border-t border-destructive/20 bg-destructive/5 text-destructive text-xs font-medium">
                        Error detected in this interaction
                    </div>
                )}

                <div className="p-2 border-t border-border/50 bg-muted/10 rounded-b-lg flex justify-end gap-3 text-[10px] text-muted-foreground shrink-0 font-mono">
                    {(message.usage) && (
                        <>
                            <span>In: {message.usage.input_tokens.toLocaleString()}</span>
                            <span>Out: {message.usage.output_tokens.toLocaleString()}</span>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export const InteractionCard = memo(({
    message,
    zoomLevel,
    isActive,
    isExpanded,
    onHover,
    onLeave,
    onClick
}: InteractionCardProps) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
    const isMarkdownPretty = useAppStore(state => state.isMarkdownPretty);

    // Update rect when expanded changes
    useEffect(() => {
        if (isExpanded && cardRef.current) {
            setTriggerRect(cardRef.current.getBoundingClientRect());
        }
    }, [isExpanded]);

    const content = extractClaudeMessageContent(message) || "";
    const isTool = !!message.toolUse;
    const toolInput = isTool ? JSON.stringify((message.toolUse as any).input) : "";

    // Skip "No content" entries if they are not tools and empty
    if (!content.trim() && !isTool) {
        return null;
    }

    const isError = (message.stopReasonSystem?.toLowerCase().includes("error")) ||
        (message.toolUseResult as any)?.is_error ||
        (message.toolUseResult as any)?.stderr?.length > 0;

    const role = message.role || message.type;

    const editedMdFile = useMemo(() => {
        if (message.toolUse) {
            const toolUse = message.toolUse as any;
            const name = toolUse.name;
            const input = toolUse.input;

            if (['write_to_file', 'replace_file_content', 'create_file', 'edit_file'].includes(name)) {
                const path = input?.path || input?.file_path || input?.TargetFile || "";
                if (typeof path === 'string' && path.toLowerCase().endsWith('.md')) {
                    return path;
                }
            }
        }

        if (role === 'assistant' && content) {
            const mdMention = content.match(/(create|update|edit|writing|wrote).+?([a-zA-Z0-9_\-\.]+\.md)/i);
            if (mdMention && mdMention[2]) {
                return mdMention[2];
            }
        }

        return null;
    }, [message.toolUse, content, role]);

    // Base classes for the card
    const baseClasses = clsx(
        "relative rounded transition-all duration-200 cursor-pointer overflow-hidden border border-transparent shadow-sm select-none",
        !isActive && "opacity-20 scale-[0.98] grayscale blur-[0.5px]",
        isActive && "hover:border-accent hover:shadow-lg hover:z-50 hover:scale-[1.02]",
        isError && "bg-destructive/10 border-destructive/20"
    );

    // Level 0: Pixel/Heatmap
    if (zoomLevel === 0) {
        const totalTokens = (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0);
        const height = Math.min(Math.max(totalTokens / 50, 4), 20);

        let bgColor = "bg-muted";
        if (role === "user") bgColor = "bg-primary/60";
        else if (role === "assistant") bgColor = "bg-foreground/40";
        else if (message.toolUse) bgColor = "bg-accent/60";

        if (editedMdFile) bgColor = "bg-emerald-500/80";
        if (isError) bgColor = "bg-destructive/80";

        // NO onclick expansion for Pixel view yet, as requested
        return (
            <div
                ref={cardRef}
                className={clsx(baseClasses, bgColor, "w-full")}
                style={{ height: `${height}px` }}
                onMouseEnter={() => onHover?.('role', role)}
                onMouseLeave={onLeave}
                onClick={onClick}
            />
        );
    }

    // Level 1: Skim/Kanban
    if (zoomLevel === 1) {
        return (
            <>
                <div
                    ref={cardRef}
                    className={clsx(baseClasses, "mb-1.5 p-2 bg-card min-h-[60px] flex gap-2 items-start")}
                    onMouseEnter={() => onHover?.('role', role)}
                    onMouseLeave={onLeave}
                    onClick={onClick}
                >
                    <div className="mt-0.5 relative">
                        {message.toolUse ? (
                            <ToolIcon toolName={(message.toolUse as any).name} className="text-accent" />
                        ) : (
                            <div className={clsx("w-3.5 h-3.5 rounded-full",
                                role === "user" ? "bg-primary" : "bg-muted-foreground/40")}
                            />
                        )}
                        {editedMdFile && (
                            <div
                                className="absolute -top-1 -right-1 p-0.5 bg-emerald-500 rounded-full shadow-sm text-white border border-background"
                                onMouseEnter={(e) => {
                                    e.stopPropagation();
                                    onHover?.('file', editedMdFile);
                                }}
                            >
                                <FileText className="w-2 h-2" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground opacity-70 mb-0.5">
                            {message.toolUse ? (message.toolUse as any).name : role}
                        </div>
                        <p className="text-xs line-clamp-2 leading-tight text-foreground/80">
                            {message.toolUse ? toolInput : content}
                        </p>
                    </div>
                    {isError && (
                        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                    )}
                </div>
                {isExpanded && <ExpandedCard
                    message={message}
                    content={content}
                    toolInput={toolInput}
                    editedMdFile={editedMdFile}
                    role={role}
                    isError={isError as any}
                    triggerRect={triggerRect}
                    isMarkdownPretty={isMarkdownPretty}
                    onClose={() => onClick?.()}
                />}
            </>
        );
    }

    // Level 2: Read/Detail
    return (
        <>
            <div
                ref={cardRef}
                className={clsx(baseClasses, "mb-2.5 p-3 bg-card flex flex-col gap-2 ring-1 ring-border/5 shadow-md")}
                style={{ transformOrigin: 'top center' }}
                onMouseEnter={() => onHover?.('role', role)}
                onMouseLeave={onLeave}
                onClick={onClick}
            >
                {editedMdFile && (
                    <div
                        className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-600 font-medium mb-1 cursor-help group/md"
                        onMouseEnter={(e) => {
                            e.stopPropagation();
                            onHover?.('file', editedMdFile);
                        }}
                    >
                        <FileText className="w-3 h-3" />
                        <span className="truncate">Modified: {editedMdFile}</span>
                    </div>
                )}

                <div className="flex justify-between items-center border-b border-border/10 pb-1.5 mb-1">
                    <div className="flex items-center gap-2">
                        {message.toolUse ? (
                            <div className="flex items-center gap-1.5">
                                <ToolIcon toolName={(message.toolUse as any).name} className="text-accent" />
                                <span className="text-xs font-bold text-accent uppercase">{(message.toolUse as any).name}</span>
                            </div>
                        ) : (
                            <span className={clsx("text-xs font-bold uppercase", role === 'user' ? 'text-primary' : 'text-muted-foreground')}>
                                {role}
                            </span>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                </div>

                <div className="text-xs text-foreground/90 whitespace-pre-wrap break-words leading-normal max-h-[300px] overflow-hidden relative">
                    {content || (message.toolUse ? JSON.stringify((message.toolUse as any).input, null, 2) : "No content")}
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent" />
                </div>

                {(message.usage) && (
                    <div className="mt-auto pt-2 flex gap-3 text-[10px] text-muted-foreground opacity-60 font-mono">
                        <span>In: {message.usage.input_tokens}</span>
                        <span>Out: {message.usage.output_tokens}</span>
                    </div>
                )}

                {isError && (
                    <div className="mt-1 p-1.5 bg-destructive/10 rounded text-[10px] text-destructive border border-destructive/20 font-mono italic">
                        Error detected in interaction
                    </div>
                )}
            </div>
            {isExpanded && <ExpandedCard
                message={message}
                content={content}
                toolInput={toolInput}
                editedMdFile={editedMdFile}
                role={role}
                isError={isError as any}
                triggerRect={triggerRect}
                isMarkdownPretty={isMarkdownPretty}
                onClose={() => onClick?.()}
            />}
        </>
    );
});
