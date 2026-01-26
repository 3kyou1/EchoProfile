import { useRef, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "../../store/useAppStore";
import type { BoardSessionData, ZoomLevel } from "../../types/board.types";
import { InteractionCard } from "./InteractionCard";
import { Clock, Crown, Anchor, GitCommit, Pencil, TrendingUp, Zap } from "lucide-react";
import { clsx } from "clsx";
import { extractClaudeMessageContent } from "../../utils/messageUtils";

// Helper for formatting duration
const formatDuration = (minutes: number): string => {
    if (minutes < 1) return "<1m";
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

// Helper for formatting large numbers
const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`; // Changed to match "17.1K" style
    return num.toLocaleString();
};

interface SessionLaneProps {
    data: BoardSessionData;
    zoomLevel: ZoomLevel;
    activeBrush: { type: string; value: string } | null;
    onInteractionClick?: (messageUuid: string) => void;
    onHoverInteraction?: (type: "role" | "status" | "tool" | "file", value: string) => void;
    onLeaveInteraction?: () => void;
    onScroll?: (scrollTop: number) => void;
}

export const SessionLane = ({
    data,
    zoomLevel,
    activeBrush,
    onInteractionClick,
    onHoverInteraction,
    onLeaveInteraction,
    onScroll
}: SessionLaneProps) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const { session, messages, stats, depth } = data;
    const selectedMessageId = useAppStore(state => state.selectedMessageId);

    // Filter out "no-content" messages before virtualization
    const visibleMessages = messages.filter(msg => {
        const content = extractClaudeMessageContent(msg) || "";
        const isTool = !!msg.toolUse;
        return content.trim().length > 0 || isTool;
    });

    const rowVirtualizer = useVirtualizer({
        count: visibleMessages.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => {
            const msg = visibleMessages[index];
            if (!msg) return 4; // Safely return default if undefined

            // 0: Pixel View (Fixed small)
            if (zoomLevel === 0) {
                const totalTokens = (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0);
                // Must matches InteractionCard logic: Math.min(Math.max(totalTokens / 50, 4), 20)
                return Math.min(Math.max(totalTokens / 50, 4), 20);
            }

            const content = extractClaudeMessageContent(msg) || "";
            const isTool = !!msg.toolUse;
            const len = content.length;

            // Initial estimates (will be corrected by dynamic measurement if enabled/rendered)
            // 1: Skim View (Compact)
            if (zoomLevel === 1) {
                if (isTool) return 80;
                if (len < 100) return 60;
                return 90;
            }

            // 2: Read View (Detail)
            if (isTool) return 140;
            if (len < 50) return 70;
            if (len < 200) return 120;
            if (len < 500) return 180;
            return 250;
        },
        overscan: 10,
    });

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (onScroll) {
            onScroll(e.currentTarget.scrollTop);
        }
    };

    const isInteractionActive = (msg: any) => {
        // Highlighting disabled globally for now, always return true
        return true;
    };

    // Determine styles for different session depths
    const getDepthStyles = () => {
        // Pixel View always uses compact width
        if (zoomLevel === 0) {
            return "w-[80px] min-w-[80px] bg-background border-r border-border/30";
        }

        switch (depth) {
            // epic, deep, etc...
            case 'epic':
                return "w-[480px] min-w-[480px] bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200/50 dark:border-indigo-800/50";
            case 'deep':
                return "w-[380px] min-w-[380px] bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50";
            default: // shallow
                return "w-[320px] min-w-[320px] bg-card/20";
        }
    };

    // Calculate duration for display
    const durationMinutes = stats.durationMs ? stats.durationMs / (1000 * 60) : 0;

    return (
        <div className={clsx(
            "flex flex-col h-full border-r transition-all relative group",
            getDepthStyles()
        )}>
            {/* Vertical Connector Line (Only for non-Pixel views) */}
            {zoomLevel !== 0 && (
                <div className="absolute left-6 top-0 bottom-0 w-px bg-border/40 z-0 pointer-events-none" />
            )}

            {/* Column Header */}
            <div className={clsx(
                "border-b border-border/50 shrink-0 z-10 backdrop-blur-sm sticky top-0",
                zoomLevel === 0 ? "p-2 bg-background/90" : "p-4",
                (zoomLevel !== 0 && depth === 'epic') ? "bg-indigo-50/80 dark:bg-indigo-950/40" : (zoomLevel !== 0 ? "bg-card/40" : "")
            )}
                style={{
                    height: zoomLevel === 0 ? '110px' : 'auto', // Auto height for flexible analytics layout in normal view
                    minHeight: zoomLevel === 0 ? '0' : '150px'
                }}
            >
                {/* Pixel View Header */}
                {zoomLevel === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 text-center h-full justify-between">
                        {/* Mini badge for depth */}
                        {depth === 'epic' && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse mb-1" title="Epic Session" />}
                        {depth === 'deep' && <div className="w-2 h-2 rounded-full bg-slate-500 mb-1" title="Deep Session" />}

                        <div className="flex justify-center gap-1 mb-1">
                            {/* High Level Indicators for Commits / Markdown in Pixel View */}
                            {stats.commitCount > 0 && (
                                <div className="flex items-center justify-center w-3 h-3 rounded bg-indigo-500 text-white shadow-sm" title="Commits">
                                    <GitCommit className="w-2 h-2" />
                                </div>
                            )}
                            {stats.hasMarkdownEdits && (
                                <div className="flex items-center justify-center w-3 h-3 rounded bg-amber-500 text-white shadow-sm" title="Docs">
                                    <Pencil className="w-2 h-2" />
                                </div>
                            )}
                        </div>

                        <div className="text-[10px] font-bold text-muted-foreground rotate-0 truncate max-w-full leading-tight" title={session.summary || session.session_id}>
                            {/* Just show truncated ID or short date */}
                            {new Date(session.last_modified).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                        </div>

                        {/* Vertical Sparkline - using simple stacking bars for stats visually in a tiny column */}
                        <div className="flex flex-col gap-1 w-full items-center mt-auto">
                            {/* Commits Metric */}
                            {stats.commitCount > 0 && (
                                <div className="flex flex-col items-center gap-0.5" title={`${stats.commitCount} Commits`}>
                                    <div className="w-3 h-0.5 bg-indigo-500"></div>
                                    <span className="text-[8px] font-mono text-indigo-500 font-bold">{stats.commitCount}</span>
                                </div>
                            )}

                            {/* Edits Metric */}
                            {stats.fileEditCount > 0 && (
                                <div className="flex flex-col items-center gap-0.5" title={`${stats.fileEditCount} File Edits`}>
                                    <div className="w-3 h-0.5 bg-emerald-500"></div>
                                    <span className="text-[8px] font-mono text-emerald-500">{stats.fileEditCount}</span>
                                </div>
                            )}

                            <div className="flex flex-col items-center gap-0.5" title={`${Math.round(stats.totalTokens / 1000)}k Tokens`}>
                                <div className="w-full h-px bg-foreground/10" />
                                <span className="text-[8px] font-mono text-muted-foreground">{Math.round(stats.totalTokens / 1000)}k</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Normal Header - Styled like SessionStatsCard */
                    <div className="flex flex-col h-full gap-3">
                        {/* Top Row: Date | Depth Badges | HIGH LEVEL TRAITS */}
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
                                {new Date(session.last_modified).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>

                            <div className="flex gap-1.5 items-center">
                                {/* High Level Indicators for Commits / Markdown */}
                                {stats.commitCount > 0 && (
                                    <div className="flex items-center justify-center w-4 h-4 rounded bg-indigo-500 text-white shadow-sm" title={`${stats.commitCount} Commits in this session`}>
                                        <GitCommit className="w-2.5 h-2.5" />
                                    </div>
                                )}
                                {stats.hasMarkdownEdits && (
                                    <div className="flex items-center justify-center w-4 h-4 rounded bg-amber-500 text-white shadow-sm" title="Markdown Documentation Edited">
                                        <Pencil className="w-2.5 h-2.5" />
                                    </div>
                                )}

                                {depth === 'epic' && <span className="text-indigo-500 ml-1"><Crown className="w-3 h-3" /></span>}
                                {depth === 'deep' && <span className="text-slate-500 ml-1"><Anchor className="w-3 h-3" /></span>}
                            </div>
                        </div>

                        {/* Main Stats Row: Large Tokens Count */}
                        <div className="flex items-baseline gap-2">
                            <div className="flex items-baseline text-xl font-bold font-mono tracking-tight text-foreground">
                                {formatNumber(stats.totalTokens)}
                                <span className="text-[10px] text-muted-foreground font-normal ml-1">tokens</span>
                            </div>
                            <div className="ml-auto flex items-baseline gap-3 text-[10px] text-muted-foreground">
                                <span>{messages.length} msgs</span>
                                <span>{formatDuration(durationMinutes)}</span>
                            </div>
                        </div>

                        {/* Detailed Token Breakdown Row */}
                        <div className="grid grid-cols-2 gap-2 pb-2 border-b border-border/30">
                            <div className="flex items-center gap-1.5">
                                <TrendingUp className="w-3 h-3 text-emerald-500" />
                                <span className="text-[10px] text-muted-foreground font-mono">
                                    In: <span className="text-emerald-500 font-bold">{formatNumber(stats.inputTokens)}</span>
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Zap className="w-3 h-3 text-purple-500" />
                                <span className="text-[10px] text-muted-foreground font-mono">
                                    Out: <span className="text-purple-500 font-bold">{formatNumber(stats.outputTokens)}</span>
                                </span>
                            </div>
                        </div>

                        {/* Derived Metrics (Commit / Edits) - Replaced text with progress bars or other visuals? No, keep text for detail, but Top Right icons are the "High Level" scan path */}
                        {(stats.commitCount > 0 || stats.fileEditCount > 0) && (
                            <div className="flex items-center gap-3 pt-1 text-[10px]">
                                {stats.commitCount > 0 && (
                                    <div className="flex items-center gap-1.5 text-indigo-500 font-medium opacity-80">
                                        <GitCommit className="w-3 h-3" />
                                        <span>{stats.commitCount} commits</span>
                                    </div>
                                )}
                                {stats.fileEditCount > 0 && (
                                    <div className="flex items-center gap-1.5 text-emerald-600 font-medium opacity-80">
                                        <Pencil className="w-3 h-3" />
                                        <span>{stats.fileEditCount} edits</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Title/Summary at bottom */}
                        <div className="mt-auto pt-2">
                            <h3 className="text-xs font-semibold text-foreground/90 line-clamp-2 leading-relaxed" title={session.summary || session.session_id}>
                                {session.summary || "Untitled Session"}
                            </h3>
                            <code className="text-[9px] text-muted-foreground/40 font-mono mt-1 block truncate">
                                {session.session_id}
                            </code>
                        </div>
                    </div>
                )}
            </div>

            {/* Interactions Virtual List */}
            <div
                ref={parentRef}
                onScroll={handleScroll}
                className={clsx(
                    "session-lane-scroll flex-1 overflow-y-auto scrollbar-thin overflow-x-hidden relative",
                    zoomLevel === 0 ? "px-0.5 py-2" : "px-1 py-4"
                )}
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const message = visibleMessages[virtualRow.index];
                        const nextMessage = visibleMessages[virtualRow.index + 1];
                        const prevMessage = visibleMessages[virtualRow.index - 1];

                        if (!message) return null;

                        // Use dynamic measurements for Zoom 1 & 2 to avoid layout breakage
                        const isDynamic = zoomLevel !== 0;

                        return (
                            <div
                                key={message.uuid}
                                data-index={virtualRow.index}
                                ref={isDynamic ? rowVirtualizer.measureElement : undefined}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    // Only force height for Pixel View (Zoom 0) or if dynamic measure fails?
                                    // For dynamic, we let content drive height, but absolute pos requires careful handling.
                                    // Virtualizer sets `virtualRow.size` to measured height anyway.
                                    // BUT initially it's estimated. If we don't set height, the content sets it.
                                    // Then the measure callback fires.
                                    // So we should NOT set height for dynamic rows.
                                    // For Zoom 0, we must force it because we return a fixed calculation in estimateSize but no measureElement is used.
                                    height: isDynamic ? undefined : `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                    // Padding adjusted to account for the connector line on the left
                                    paddingLeft: zoomLevel === 0 ? '0' : '32px',
                                    paddingRight: zoomLevel === 0 ? '0' : '8px',
                                }}
                            >
                                <InteractionCard
                                    message={message}
                                    zoomLevel={zoomLevel}
                                    isActive={true}
                                    isExpanded={selectedMessageId === message.uuid}
                                    onHover={onHoverInteraction}
                                    onLeave={onLeaveInteraction}
                                    onClick={() => onInteractionClick?.(message.uuid)}
                                    onNext={nextMessage ? () => onInteractionClick?.(nextMessage.uuid) : undefined}
                                    onPrev={prevMessage ? () => onInteractionClick?.(prevMessage.uuid) : undefined}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
