import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BoardSessionData, ZoomLevel } from "../../types/board.types";
import { InteractionCard } from "./InteractionCard";
import { Coins, AlertCircle, Clock } from "lucide-react";
import { clsx } from "clsx";

interface SessionLaneProps {
    data: BoardSessionData;
    zoomLevel: ZoomLevel;
    activeBrush: { type: string; value: string } | null;
    onInteractionClick?: (messageUuid: string) => void;
    onHoverInteraction?: (type: string, value: string) => void;
    onLeaveInteraction?: () => void;
}

export const SessionLane = ({
    data,
    zoomLevel,
    activeBrush,
    onInteractionClick,
    onHoverInteraction,
    onLeaveInteraction
}: SessionLaneProps) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const { session, messages, stats } = data;

    const rowVirtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => {
            if (zoomLevel === 0) return 12;
            if (zoomLevel === 1) return 85;
            return 160;
        },
        overscan: 5,
    });

    const isInteractionActive = (msg: any) => {
        if (!activeBrush) return true;
        if (!msg) return false;
        const role = msg.role || msg.type;
        if (activeBrush.type === 'role' && role === activeBrush.value) return true;
        if (activeBrush.type === 'status' && activeBrush.value === 'error') {
            const isError = (msg.stopReasonSystem?.toLowerCase().includes("error")) ||
                (msg.toolUseResult as any)?.is_error ||
                (msg.toolUseResult as any)?.stderr?.length > 0;
            return isError;
        }
        if (activeBrush.type === 'tool' && msg.toolUse) {
            return (msg.toolUse as any).name === activeBrush.value;
        }
        return false;
    };

    return (
        <div className="flex flex-col h-full w-[320px] min-w-[320px] border-r border-border/40 bg-card/20 group hover:bg-card/40 transition-colors">
            {/* Column Header */}
            <div className="p-4 border-b border-border/50 shrink-0">
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
                className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin overflow-x-hidden"
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const message = messages[virtualRow.index];
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
                                }}
                            >
                                <InteractionCard
                                    message={message}
                                    zoomLevel={zoomLevel}
                                    isActive={isInteractionActive(message)}
                                    onHover={() => onHoverInteraction?.('role', message.role || message.type)}
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
