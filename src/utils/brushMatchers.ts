export type { ActiveBrush, BrushableCard } from "@/types/board.types";
import type { ActiveBrush, BrushableCard } from "@/types/board.types";

export function matchesBrush(brush: ActiveBrush | null, card: BrushableCard): boolean {
    if (!brush) return true;

    switch (brush.type) {
        case "model":
            return !!card.model && card.model.includes(brush.value);
        case "tool":
            return card.variant === brush.value;
        case "status":
            switch (brush.value) {
                case "error": return card.isError;
                case "cancelled": return card.isCancelled;
                case "commit": return card.isCommit;
                default: return false;
            }
        case "file":
            // Exact match for now
            return card.editedFiles.some(f => f === brush.value || f.endsWith(brush.value));
        default:
            return false;
    }
}
