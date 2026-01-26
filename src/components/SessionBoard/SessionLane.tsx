import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "../../store/useAppStore";
import type { BoardSessionData, ZoomLevel } from "../../types/board.types";
import { InteractionCard } from "./InteractionCard";
import { Coins, AlertCircle, Clock, Zap, Crown, Anchor } from "lucide-react";
import { clsx } from "clsx";
import { extractClaudeMessageContent } from "../../utils/messageUtils";

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
            const content = extractClaudeMessageContent(msg) || "";
            const isTool = !!msg.toolUse;
            // Rough content length heuristic
            const len = content.length;

            // 0: Pixel View (Fixed small)
            if (zoomLevel === 0) return 6;

            // 1: Skim View (Compact)
            if (zoomLevel === 1) {
                if (isTool) return 80;
                if (len < 100) return 60; // Tiny content -> smaller height
                return 90;
            }

            // 2: Read View (Detail)
            // Base overhead: ~40px (header+footer)
            // Line height: ~20px
            // Characters per line: ~50 (very rough avg)
            if (isTool) return 140; // Tools have generous space
            if (len < 50) return 70; // Extremely short (e.g. "Ok.", "Request cancelled")
            if (len < 200) return 120; // Short paragraph
            if (len < 500) return 180; // Medium
            return 250; // Long (clamped max)
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
        switch (depth) {
            case 'epic':
                return "w-[480px] min-w-[480px] bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200/50 dark:border-indigo-800/50";
            case 'deep':
                return "w-[380px] min-w-[380px] bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50";
            default: // shallow
                return "w-[320px] min-w-[320px] bg-card/20";
        }
    };

    return (
        <div className={clsx(
            "flex flex-col h-full border-r transition-all relative group",
            getDepthStyles()
        )}>
            {/* Vertical Connector Line (Visual Flow) */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-border/40 z-0 pointer-events-none" />

            {/* Column Header */}
            <div className={clsx(
                "p-4 border-b border-border/50 shrink-0 z-10 backdrop-blur-sm sticky top-0",
                depth === 'epic' ? "bg-indigo-50/80 dark:bg-indigo-950/40" : "bg-card/40"
            )}>
                <div className="flex items-center gap-2 mb-1.5">
                    {depth === 'epic' && <span className="bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1"><Crown className="w-3 h-3" /> EPIC</span>}
                    {depth === 'deep' && <span className="bg-slate-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1"><Anchor className="w-3 h-3" /> DEEP</span>}
                    {depth === 'shallow' && <span className="bg-muted text-muted-foreground text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">SHALLOW</span>}
                </div>

                <h3 className="text-sm font-bold truncate mb-1 text-foreground" title={session.summary || session.session_id}>
                    {session.summary || "Untitled Session"}
                </h3>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-3 opacity-70">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(session.last_modified).toLocaleDateString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-accent/5 rounded border border-accent/10">
                        <Coins className="w-3 h-3 text-accent" />
                        <span className="text-[11px] font-mono font-bold leading-none">{stats.totalTokens.toLocaleString()}</span>
                    </div>
                    <div className={clsx(
                        "flex items-center gap-1.5 px-2 py-1 rounded border",
                        stats.errorCount > 0 ? "bg-destructive/5 border-destructive/20 text-destructive" : "bg-muted/5 border-border/50 text-muted-foreground"
                    )}>
                        <AlertCircle className="w-3 h-3" />
                        <span className="text-[11px] font-mono font-bold leading-none">{stats.errorCount}</span>
                    </div>
                </div>
            </div>

            {/* Interactions Virtual List */}
            <div
                ref={parentRef}
                onScroll={handleScroll}
                className="session-lane-scroll flex-1 overflow-y-auto px-1 py-4 scrollbar-thin overflow-x-hidden relative"
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
                        if (!message) return null;

                        return (
                            <div
                                key={message.uuid}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                    // Padding adjusted to account for the connector line on the left
                                    paddingLeft: zoomLevel === 0 ? '1px' : '32px',
                                    paddingRight: zoomLevel === 0 ? '1px' : '8px',
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
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
