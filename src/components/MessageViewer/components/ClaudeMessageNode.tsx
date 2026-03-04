/**
 * ClaudeMessageNode Component
 *
 * Renders individual message nodes with support for various message types.
 */

import React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ProgressData } from "../../../types";
import { ClaudeContentArrayRenderer } from "../../contentRenderer";
import {
  ClaudeToolUseDisplay,
  MessageContentDisplay,
  ToolExecutionResultRouter,
  ProgressRenderer,
  AgentProgressGroupRenderer,
  FileHistorySnapshotRenderer,
} from "../../messageRenderer";
import { AgentTaskGroupRenderer, TaskOperationGroupRenderer } from "../../toolResultRenderer";
import { extractClaudeMessageContent } from "../../../utils/messageUtils";
import { isEmptyMessage } from "../helpers/messageHelpers";
import { isToolUseContent, isToolResultContent } from "../../../utils/typeGuards";
import { MessageHeader } from "./MessageHeader";
import { SummaryMessage } from "./SummaryMessage";
import type { MessageNodeProps } from "../types";

// Capture mode hover background style (uses named group to avoid conflicts)
const CAPTURE_HOVER_BG = "group-hover/capture:bg-red-500/5 group-hover/capture:ring-1 group-hover/capture:ring-red-500/20";

// Range selection styles
const RANGE_IN_RANGE_BG = "bg-blue-500/10";
const RANGE_ANCHOR_BORDER_START = "ring-2 ring-blue-500/60 bg-blue-500/15";
const RANGE_ANCHOR_BORDER_END = "ring-2 ring-blue-400/60 bg-blue-500/15";

function getRangeClasses(position: "start" | "end" | "in-range" | null | undefined): string {
  if (position === "start") return RANGE_ANCHOR_BORDER_START;
  if (position === "end") return RANGE_ANCHOR_BORDER_END;
  if (position === "in-range") return RANGE_IN_RANGE_BG;
  return "";
}

export const ClaudeMessageNode = React.memo(({
  message,
  isCurrentMatch,
  isMatch,
  searchQuery,
  filterType = "content",
  currentMatchIndex,
  agentTaskGroup,
  isAgentTaskGroupMember,
  agentProgressGroup,
  isAgentProgressGroupMember,
  taskOperationGroup,
  taskRegistry,
  isTaskOperationGroupMember,
  isCaptureMode,
  onHideMessage,
  onRangeSelect,
  rangePosition,
}: MessageNodeProps) => {
  const { t } = useTranslation();

  // Range selection click handler
  const handleRangeClick = isCaptureMode && onRangeSelect
    ? (e: React.MouseEvent) => {
        // Don't trigger range select if clicking the hide button
        if ((e.target as HTMLElement).closest("button")) return;
        onRangeSelect(message.uuid);
      }
    : undefined;

  const rangeHighlight = isCaptureMode ? getRangeClasses(rangePosition) : "";
  const rangeCursor = isCaptureMode && onRangeSelect ? "cursor-crosshair" : "";

  // Capture mode hide button - appears on hover
  const CaptureHideButton = isCaptureMode && onHideMessage ? (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onHideMessage(message.uuid);
      }}
      className={cn(
        "absolute top-3 right-3 z-10",
        "flex items-center justify-center",
        "w-7 h-7 rounded-lg",
        // Glass morphism effect
        "bg-zinc-900/80 backdrop-blur-sm",
        "border border-zinc-700/50",
        // Hover state
        "hover:bg-red-500/90 hover:border-red-400/50",
        "hover:shadow-lg hover:shadow-red-500/20",
        // Text/icon
        "text-zinc-400 hover:text-white",
        // Animation - appears on capture mode group hover only
        "opacity-0 group-hover/capture:opacity-100",
        "translate-y-1 group-hover/capture:translate-y-0",
        "transition-all duration-200 ease-out"
      )}
      title={t("captureMode.hideBlock")}
      aria-label={t("captureMode.hideBlock")}
    >
      <X className="w-4 h-4" strokeWidth={2.5} />
    </button>
  ) : null;

  if (message.isSidechain) {
    return null;
  }

  // Render hidden placeholders for group members
  if (isAgentTaskGroupMember) {
    return (
      <div
        data-message-uuid={message.uuid}
        className="hidden"
        aria-hidden="true"
      />
    );
  }

  if (isAgentProgressGroupMember) {
    return (
      <div
        data-message-uuid={message.uuid}
        className="hidden"
        aria-hidden="true"
      />
    );
  }

  if (isTaskOperationGroupMember) {
    return (
      <div
        data-message-uuid={message.uuid}
        className="hidden"
        aria-hidden="true"
      />
    );
  }

  // Skip empty messages
  if (isEmptyMessage(message)) {
    return null;
  }

  // Render grouped agent tasks
  if (agentTaskGroup && agentTaskGroup.length > 0) {
    return (
      <div
        data-message-uuid={message.uuid}
        onClick={handleRangeClick}
        className={cn(
          "relative w-full px-2 md:px-4 py-2 transition-all duration-200",
          isCaptureMode && !rangePosition && CAPTURE_HOVER_BG,
          rangeHighlight,
          rangeCursor
        )}
      >
        {CaptureHideButton}
        <div className="max-w-4xl mx-auto">
          <AgentTaskGroupRenderer tasks={agentTaskGroup} timestamp={message.timestamp} />
        </div>
      </div>
    );
  }

  // Render grouped agent progress
  if (agentProgressGroup && agentProgressGroup.entries.length > 0) {
    return (
      <div
        data-message-uuid={message.uuid}
        onClick={handleRangeClick}
        className={cn(
          "relative w-full px-2 md:px-4 py-2 transition-all duration-200",
          isCaptureMode && !rangePosition && CAPTURE_HOVER_BG,
          rangeHighlight,
          rangeCursor
        )}
      >
        {CaptureHideButton}
        <div className="max-w-4xl mx-auto">
          <AgentProgressGroupRenderer
            entries={agentProgressGroup.entries}
            agentId={agentProgressGroup.agentId}
          />
        </div>
      </div>
    );
  }

  // Render grouped task operations
  if (taskOperationGroup && taskOperationGroup.length > 0) {
    return (
      <div
        data-message-uuid={message.uuid}
        onClick={handleRangeClick}
        className={cn(
          "relative w-full px-2 md:px-4 py-2 transition-all duration-200",
          isCaptureMode && !rangePosition && CAPTURE_HOVER_BG,
          rangeHighlight,
          rangeCursor
        )}
      >
        {CaptureHideButton}
        <div className="max-w-4xl mx-auto">
          <TaskOperationGroupRenderer operations={taskOperationGroup} taskRegistry={taskRegistry} />
        </div>
      </div>
    );
  }

  // Summary messages
  if (message.type === "summary") {
    const summaryContent = typeof message.content === "string"
      ? message.content
      : "";
    return (
      <div
        data-message-uuid={message.uuid}
        onClick={handleRangeClick}
        className={cn(
          "relative max-w-4xl mx-auto transition-all duration-200",
          isCaptureMode && !rangePosition && CAPTURE_HOVER_BG,
          rangeHighlight,
          rangeCursor
        )}
      >
        {CaptureHideButton}
        <SummaryMessage content={summaryContent} timestamp={message.timestamp} />
      </div>
    );
  }

  // File history snapshot messages
  if (message.type === "file-history-snapshot") {
    if (!message.snapshot) {
      return null;
    }

    return (
      <div
        data-message-uuid={message.uuid}
        onClick={handleRangeClick}
        className={cn(
          "relative w-full px-2 md:px-4 py-2 transition-all duration-200",
          isCaptureMode && !rangePosition && CAPTURE_HOVER_BG,
          rangeHighlight,
          rangeCursor
        )}
      >
        {CaptureHideButton}
        <div className="max-w-4xl mx-auto">
          <FileHistorySnapshotRenderer
            messageId={message.messageId ?? message.uuid}
            snapshot={message.snapshot}
            isSnapshotUpdate={Boolean(message.isSnapshotUpdate)}
          />
        </div>
      </div>
    );
  }

  // Progress messages
  if (message.type === "progress" && message.data) {
    return (
      <div
        data-message-uuid={message.uuid}
        onClick={handleRangeClick}
        className={cn(
          "relative w-full px-2 md:px-4 py-1 transition-all duration-200",
          isCaptureMode && !rangePosition && CAPTURE_HOVER_BG,
          rangeHighlight,
          rangeCursor
        )}
      >
        {CaptureHideButton}
        <div className="max-w-4xl mx-auto">
          <ProgressRenderer
            data={message.data as ProgressData}
            toolUseID={message.toolUseID}
            parentToolUseID={message.parentToolUseID}
          />
        </div>
      </div>
    );
  }

  const hasInlineToolResult =
    Array.isArray(message.content) && message.content.some(isToolResultContent);
  const shouldRenderLegacyToolResult =
    (message.type === "user" || message.type === "assistant") &&
    message.toolUseResult != null &&
    !hasInlineToolResult;

  // Default message rendering
  return (
    <div
      data-message-uuid={message.uuid}
      onClick={handleRangeClick}
      className={cn(
        "relative w-full px-2 md:px-4 py-2 transition-all duration-200",
        message.isSidechain && "bg-muted",
        // Search highlight
        isCurrentMatch && "bg-highlight-current ring-2 ring-warning",
        isMatch && !isCurrentMatch && "bg-highlight",
        // Capture mode hover effect
        isCaptureMode && !isCurrentMatch && !isMatch && !rangePosition && CAPTURE_HOVER_BG,
        // Range selection highlight
        rangeHighlight,
        rangeCursor
      )}
    >
      {CaptureHideButton}
      <div className="max-w-4xl mx-auto">
        <MessageHeader message={message} />

        <div className="w-full">
          <MessageContentDisplay
            content={extractClaudeMessageContent(message)}
            messageType={message.type}
            searchQuery={searchQuery}
            isCurrentMatch={isCurrentMatch}
            currentMatchIndex={currentMatchIndex}
          />

          {message.content &&
            Array.isArray(message.content) && (
              <div className="mb-2">
                <ClaudeContentArrayRenderer
                  content={message.content}
                  searchQuery={searchQuery}
                  filterType={filterType}
                  isCurrentMatch={isCurrentMatch}
                  currentMatchIndex={currentMatchIndex}
                  skipToolResults={shouldRenderLegacyToolResult}
                  skipText={
                    message.type === "assistant" &&
                    !!extractClaudeMessageContent(message)
                  }
                />
              </div>
            )}

          {message.type === "assistant" &&
            message.toolUse &&
            !(
              Array.isArray(message.content) &&
              message.content.some(isToolUseContent)
            ) && <ClaudeToolUseDisplay toolUse={message.toolUse} />}

          {shouldRenderLegacyToolResult && (
              <ToolExecutionResultRouter
                toolResult={message.toolUseResult!}
                searchQuery={searchQuery}
                isCurrentMatch={isCurrentMatch}
                currentMatchIndex={currentMatchIndex}
              />
            )}
        </div>
      </div>
    </div>
  );
});

ClaudeMessageNode.displayName = "ClaudeMessageNode";
