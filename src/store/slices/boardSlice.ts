import type { StateCreator } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { FullAppStore } from "./types";
import type {
    BoardSessionData,
    BoardSessionStats,
    ZoomLevel,
} from "../../types/board.types";
import type { ClaudeMessage, ClaudeSession } from "../../types";

export interface BoardSliceState {
    boardSessions: Record<string, BoardSessionData>;
    visibleSessionIds: string[];
    isLoadingBoard: boolean;
    zoomLevel: ZoomLevel;
    activeBrush: {
        type: "role" | "status" | "tool";
        value: string;
    } | null;
}

export interface BoardSliceActions {
    loadBoardSessions: (sessions: ClaudeSession[]) => Promise<void>;
    setZoomLevel: (level: ZoomLevel) => void;
    setActiveBrush: (brush: BoardSliceState["activeBrush"]) => void;
    clearBoard: () => void;
}

export type BoardSlice = BoardSliceState & BoardSliceActions;

const initialBoardState: BoardSliceState = {
    boardSessions: {},
    visibleSessionIds: [],
    isLoadingBoard: false,
    zoomLevel: 1, // Default to SKIM
    activeBrush: null,
};

export const createBoardSlice: StateCreator<
    FullAppStore,
    [],
    [],
    BoardSlice
> = (set) => ({
    ...initialBoardState,

    loadBoardSessions: async (sessions: ClaudeSession[]) => {
        set({ isLoadingBoard: true });

        try {
            const loadPromises = sessions.map(async (session) => {
                try {
                    const messages = await invoke<ClaudeMessage[]>(
                        "load_session_messages",
                        { sessionPath: session.file_path }
                    );

                    // Calculate stats
                    const stats: BoardSessionStats = {
                        totalTokens: 0,
                        inputTokens: 0,
                        outputTokens: 0,
                        errorCount: 0,
                        durationMs: 0,
                        toolCount: 0,
                    };

                    messages.forEach((msg) => {
                        // Token stats from assistant messages
                        if (msg.usage) {
                            const usage = msg.usage;
                            stats.inputTokens += usage.input_tokens || 0;
                            stats.outputTokens += usage.output_tokens || 0;
                            stats.totalTokens +=
                                (usage.input_tokens || 0) + (usage.output_tokens || 0);
                        }

                        // Duration if available
                        if (msg.durationMs) {
                            stats.durationMs += msg.durationMs;
                        }

                        // Error count - System level
                        if (msg.stopReasonSystem?.toLowerCase().includes("error")) {
                            stats.errorCount++;
                        }

                        // Error count - Assistant stop reason
                        if (msg.type === "assistant" && msg.stop_reason === "max_tokens") {
                            // Not necessarily an error, but worth noting depending on context
                        }

                        // Check tool uses and results
                        if (msg.toolUse) {
                            stats.toolCount++;
                        }

                        if (msg.toolUseResult) {
                            const result = msg.toolUseResult as any;
                            if (result.is_error || (result.stderr && result.stderr.length > 0)) {
                                stats.errorCount++;
                            }
                        }

                        // Also check nested content for tool interactions
                        if (Array.isArray(msg.content)) {
                            msg.content.forEach((content: any) => {
                                if (content.type === "tool_use") {
                                    stats.toolCount++;
                                }
                                if (content.type === "tool_result" && content.is_error) {
                                    stats.errorCount++;
                                }
                                // Handle complex tool result types (bash, code execution, etc.)
                                if (content.type?.includes("tool_result") && content.content) {
                                    if (content.content.stderr || content.content.type?.includes("error")) {
                                        stats.errorCount++;
                                    }
                                }
                            });
                        }
                    });

                    return {
                        sessionId: session.session_id,
                        data: {
                            session,
                            messages,
                            stats,
                        },
                    };
                } catch (err) {
                    console.error(`Failed to load session ${session.session_id}:`, err);
                    return null;
                }
            });

            const results = await Promise.all(loadPromises);

            const boardSessions: Record<string, BoardSessionData> = {};
            const visibleSessionIds: string[] = [];

            results.forEach((res) => {
                if (res) {
                    boardSessions[res.sessionId] = res.data;
                    visibleSessionIds.push(res.sessionId);
                }
            });

            set({
                boardSessions,
                visibleSessionIds,
                isLoadingBoard: false,
            });

            if (import.meta.env.DEV) {
                console.log(`[BoardSlice] Loaded ${visibleSessionIds.length} sessions`);
            }
        } catch (error) {
            console.error("Failed to load board sessions:", error);
            set({ isLoadingBoard: false });
        }
    },

    setZoomLevel: (zoomLevel: ZoomLevel) => set({ zoomLevel }),

    setActiveBrush: (activeBrush) => set({ activeBrush }),

    clearBoard: () => set(initialBoardState),
});
