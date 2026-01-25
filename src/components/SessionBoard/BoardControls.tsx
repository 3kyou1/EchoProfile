import type { ZoomLevel } from "../../types/board.types";
import {
    Layout,
    Layers,
    Eye,
    User,
    Bot,
    Wrench,
    AlertCircle,
    FileText,
    MousePointer2,
    FileCode,
    AlignLeft
} from "lucide-react";
import { clsx } from "clsx";
import { useCallback } from "react";
import { useAppStore } from "../../store/useAppStore";

interface BoardControlsProps {
    zoomLevel: ZoomLevel;
    onZoomChange: (level: ZoomLevel) => void;
    activeBrush: { type: string; value: string } | null;
    onBrushChange: (brush: { type: "role" | "status" | "tool" | "file"; value: string } | null) => void;
}

export const BoardControls = ({
    zoomLevel,
    onZoomChange,
    activeBrush,
    onBrushChange
}: BoardControlsProps) => {
    const { isMarkdownPretty, setMarkdownPretty } = useAppStore();

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

            {/* Brushing / Legend */}
            <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-50">Highlight</span>

                <div className="flex items-center gap-2">
                    <LegendItem
                        icon={<User className="w-3.5 h-3.5" />}
                        label="User"
                        isActive={activeBrush?.type === 'role' && activeBrush.value === 'user'}
                        onHover={() => onBrushChange({ type: 'role', value: 'user' })}
                        onLeave={() => onBrushChange(null)}
                        onClick={() => onBrushChange(activeBrush?.type === 'role' && activeBrush.value === 'user' ? null : { type: 'role', value: 'user' })}
                        colorClass="text-primary"
                    />
                    <LegendItem
                        icon={<Bot className="w-3.5 h-3.5" />}
                        label="Assistant"
                        isActive={activeBrush?.type === 'role' && activeBrush.value === 'assistant'}
                        onHover={() => onBrushChange({ type: 'role', value: 'assistant' })}
                        onLeave={() => onBrushChange(null)}
                        onClick={() => onBrushChange(activeBrush?.type === 'role' && activeBrush.value === 'assistant' ? null : { type: 'role', value: 'assistant' })}
                        colorClass="text-foreground"
                    />
                    <LegendItem
                        icon={<Wrench className="w-3.5 h-3.5" />}
                        label="Tools"
                        isActive={activeBrush?.type === 'tool'}
                        onHover={() => onBrushChange({ type: 'tool', value: 'tool' })}
                        onLeave={() => onBrushChange(null)}
                        onClick={() => onBrushChange(activeBrush?.type === 'tool' ? null : { type: 'tool', value: 'tool' })}
                        colorClass="text-accent"
                    />
                    <LegendItem
                        icon={<FileText className="w-3.5 h-3.5" />}
                        label="Docs"
                        isActive={activeBrush?.type === 'file'}
                        onHover={() => onBrushChange({ type: 'file', value: '.md' })}
                        onLeave={() => onBrushChange(null)}
                        onClick={() => onBrushChange(activeBrush?.type === 'file' ? null : { type: 'file', value: '.md' })}
                        colorClass="text-emerald-500"
                    />
                    <LegendItem
                        icon={<AlertCircle className="w-3.5 h-3.5" />}
                        label="Errors"
                        isActive={activeBrush?.type === 'status' && activeBrush.value === 'error'}
                        onHover={() => onBrushChange({ type: 'status', value: 'error' })}
                        onLeave={() => onBrushChange(null)}
                        onClick={() => onBrushChange(activeBrush?.type === 'status' && activeBrush.value === 'error' ? null : { type: 'status', value: 'error' })}
                        colorClass="text-destructive"
                    />
                </div>
            </div>

            <div className="flex items-center gap-3">
                {/* Markdown Toggle */}
                <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg border border-border/50">
                    <button
                        onClick={() => setMarkdownPretty(false)}
                        className={clsx(
                            "p-1.5 rounded-md transition-all",
                            !isMarkdownPretty ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                        title="Raw Text"
                    >
                        <AlignLeft className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setMarkdownPretty(true)}
                        className={clsx(
                            "p-1.5 rounded-md transition-all",
                            isMarkdownPretty ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                        title="Pretty Print Markdown"
                    >
                        <FileCode className="w-4 h-4" />
                    </button>
                </div>

                <div className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded font-mono">
                    {zoomLevel === 0 ? 'PIXEL' : zoomLevel === 1 ? 'SKIM' : 'READ'}
                </div>
            </div>
        </div>
    );
};

interface LegendItemProps {
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onHover: () => void;
    onLeave: () => void;
    onClick: () => void;
    colorClass: string;
}

const LegendItem = ({ icon, label, isActive, onHover, onLeave, onClick, colorClass }: LegendItemProps) => (
    <div
        className={clsx(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all cursor-pointer select-none",
            isActive ? "bg-background border-accent shadow-sm scale-105" : "bg-muted/20 border-transparent opacity-70 hover:opacity-100 hover:bg-muted/40"
        )}
        onMouseEnter={!isActive ? onHover : undefined}
        onMouseLeave={!isActive ? onLeave : undefined}
        onClick={onClick}
    >
        <span className={clsx(colorClass)}>{icon}</span>
        <span className="text-[11px] font-medium">{label}</span>
    </div>
);
