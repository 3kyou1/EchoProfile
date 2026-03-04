/**
 * CaptureRenderer Component
 *
 * Renders selected messages on-screen for screenshot capture.
 * html-to-image requires elements to be laid out on-screen by the browser.
 * The capture target is rendered behind a loading backdrop so the user
 * only sees the "Capturing..." indicator.
 */

import { forwardRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CaptureExpandProvider } from "@/contexts/CaptureExpandContext";
import type { FlattenedMessage, FlattenedMessageItem } from "../types";
import { ClaudeMessageNode } from "./ClaudeMessageNode";

interface OffScreenCaptureRendererProps {
  /** All flattened messages */
  flattenedMessages: FlattenedMessage[];
  /** UUID of range start */
  rangeStart: string;
  /** UUID of range end */
  rangeEnd: string;
  /** Hidden message UUIDs to exclude */
  hiddenMessageIds: string[];
}

/**
 * Renders range-selected messages behind a backdrop for capture.
 * Excludes hidden messages, group members, and hidden placeholders.
 */
export const OffScreenCaptureRenderer = forwardRef<
  HTMLDivElement,
  OffScreenCaptureRendererProps
>(function OffScreenCaptureRenderer(
  { flattenedMessages, rangeStart, rangeEnd, hiddenMessageIds },
  ref,
) {
  const { t } = useTranslation();

  const hiddenSet = useMemo(
    () => new Set(hiddenMessageIds),
    [hiddenMessageIds],
  );

  const messagesToRender = useMemo(() => {
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < flattenedMessages.length; i++) {
      const item = flattenedMessages[i];
      if (item == null || item.type !== "message") continue;
      if (item.message.uuid === rangeStart) startIdx = i;
      if (item.message.uuid === rangeEnd) endIdx = i;
    }

    if (startIdx === -1 || endIdx === -1) return [];

    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);

    const result: FlattenedMessageItem[] = [];
    for (let i = lo; i <= hi; i++) {
      const item = flattenedMessages[i];
      if (item == null || item.type !== "message") continue;
      if (hiddenSet.has(item.message.uuid)) continue;
      if (item.isGroupMember || item.isProgressGroupMember || item.isTaskOperationGroupMember) continue;
      result.push(item);
    }

    return result;
  }, [flattenedMessages, rangeStart, rangeEnd, hiddenSet]);

  if (messagesToRender.length === 0) return null;

  return createPortal(
    <>
      {/* Layer 1: Capture target — on-screen so browser computes layout,
          but behind the backdrop (z-index: 99997) */}
      <CaptureExpandProvider value={{ forceExpanded: true }}>
        <div
          ref={ref}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 99997,
            width: "800px",
            backgroundColor: "#09090b",
            color: "#fafafa",
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          {messagesToRender.map((item) => (
            <ClaudeMessageNode
              key={item.message.uuid}
              message={item.message}
              depth={item.depth}
              agentTaskGroup={item.agentTaskGroup}
              isAgentTaskGroupMember={false}
              agentProgressGroup={item.agentProgressGroup}
              isAgentProgressGroupMember={false}
              taskOperationGroup={item.taskOperationGroup}
              taskRegistry={item.taskRegistry}
              isTaskOperationGroupMember={false}
              isCaptureMode={false}
            />
          ))}
        </div>
      </CaptureExpandProvider>

      {/* Layer 2: Backdrop covers the capture target (z-index: 99998) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99998,
          backgroundColor: "rgba(0, 0, 0, 0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <span className="text-sm text-zinc-300">
            {t("captureMode.capturing")}
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
});
