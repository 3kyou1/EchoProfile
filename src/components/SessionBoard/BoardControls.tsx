import type { ZoomLevel, DateFilter } from "../../types/board.types";
import {
    Layout,
    Layers,
    Eye,
    MousePointer2
} from "lucide-react";
import { clsx } from "clsx";
import React, { useCallback } from "react";
import { DatePickerHeader } from "../ui/DatePickerHeader";

interface BoardControlsProps {
    zoomLevel: ZoomLevel;
    onZoomChange: (level: ZoomLevel) => void;
    activeBrush: { type: string; value: string } | null;
    onBrushChange: (brush: { type: "role" | "status" | "tool" | "file"; value: string } | null) => void;
    dateFilter?: DateFilter;
    setDateFilter?: (filter: DateFilter) => void;
}

export const BoardControls = ({
    zoomLevel,
    onZoomChange,
    dateFilter,
    setDateFilter
}: BoardControlsProps) => {

    const handleWheel = useCallback((e: React.WheelEvent) => {
        // Determine scroll direction
        if (Math.abs(e.deltaY) < 10) return;

        if (e.deltaY > 0) {
            if (zoomLevel > 0) onZoomChange((zoomLevel - 1) as ZoomLevel);
        } else {
            if (zoomLevel < 2) onZoomChange((zoomLevel + 1) as ZoomLevel);
        }
    }, [zoomLevel, onZoomChange]);



    return (
        <div
            className="h-14 px-6 border-b border-border/50 bg-card/30 flex items-center justify-between shrink-0 backdrop-blur-md select-none"
            onWheel={handleWheel}
        >
            {/* Zoom Controls */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg border border-border/50">
                    <button
                        onClick={() => onZoomChange(0)}
                        className={clsx(
                            "p-1.5 rounded-md transition-all",
                            zoomLevel === 0 ? "bg-background shadow-sm text-accent" : "text-muted-foreground hover:text-foreground"
                        )}
                        title="Pixel View (Scroll Down in header)"
                    >
                        <Layout className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onZoomChange(1)}
                        className={clsx(
                            "p-1.5 rounded-md transition-all",
                            zoomLevel === 1 ? "bg-background shadow-sm text-accent" : "text-muted-foreground hover:text-foreground"
                        )}
                        title="Skim View"
                    >
                        <Layers className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onZoomChange(2)}
                        className={clsx(
                            "p-1.5 rounded-md transition-all",
                            zoomLevel === 2 ? "bg-background shadow-sm text-accent" : "text-muted-foreground hover:text-foreground"
                        )}
                        title="Read View (Scroll Up in header)"
                    >
                        <Eye className="w-4 h-4" />
                    </button>
                </div>
                <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground opacity-60">
                    <MousePointer2 className="w-3 h-3" />
                    <span>Scroll header to zoom</span>
                </div>
            </div>

            <div className="flex items-center gap-6">
                {/* Date Filter */}
                {dateFilter && setDateFilter && (
                    <DatePickerHeader
                        dateFilter={dateFilter}
                        setDateFilter={setDateFilter}
                    />
                )}

                <div className="flex items-center gap-3">
                    <div className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded font-mono">
                        {zoomLevel === 0 ? 'PIXEL' : zoomLevel === 1 ? 'SKIM' : 'READ'}
                    </div>
                </div>
            </div>
        </div>
    );
};
