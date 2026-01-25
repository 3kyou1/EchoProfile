import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "../../store/useAppStore";
import { SessionLane } from "./SessionLane";
import { BoardControls } from "./BoardControls";
import { LoadingSpinner } from "../ui/loading";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";

export const SessionBoard = () => {
    const {
        boardSessions,
        visibleSessionIds,
        isLoadingBoard,
        zoomLevel,
        activeBrush,
        setZoomLevel,
        setActiveBrush
    } = useAppStore();

    const { t } = useTranslation();
    const parentRef = useRef<HTMLDivElement>(null);

    const columnVirtualizer = useVirtualizer({
        count: visibleSessionIds.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 320,
        horizontal: true,
        overscan: 2,
    });

    if (isLoadingBoard) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-sm text-muted-foreground animate-pulse">
                    {t("common.loading")}
                </p>
            </div>
        );
    }

    if (visibleSessionIds.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-sm mx-auto">
                    <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
                        <MessageSquare className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">
                        No sessions selected
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Select multiple sessions to compare them on the board.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            {/* Board Toolbar */}
            <BoardControls
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
                activeBrush={activeBrush}
                onBrushChange={setActiveBrush}
            />

            {/* Virtualized Lanes Container */}
            <div
                ref={parentRef}
                className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin"
            >
                <div
                    style={{
                        width: `${columnVirtualizer.getTotalSize()}px`,
                        height: '100%',
                        position: 'relative',
                    }}
                >
                    {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
                        const sessionId = visibleSessionIds[virtualColumn.index];
                        if (!sessionId) return null;

                        const data = boardSessions[sessionId];
                        if (!data) return null;

                        return (
                            <div
                                key={sessionId}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    height: '100%',
                                    width: `${virtualColumn.size}px`,
                                    transform: `translateX(${virtualColumn.start}px)`,
                                }}
                            >
                                <SessionLane
                                    data={data}
                                    zoomLevel={zoomLevel}
                                    activeBrush={activeBrush}
                                    onHoverInteraction={(type, value) => setActiveBrush({ type: type as any, value })}
                                    onLeaveInteraction={() => setActiveBrush(null)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
