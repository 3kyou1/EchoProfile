import { describe, expect, it } from "vitest";

import {
  buildUserTraceItems,
  computeWordFrequency,
} from "@/components/MyTrace/myTraceUtils";
import type { ClaudeMessage } from "@/types";

const userMessage = (
  uuid: string,
  timestamp: string,
  content: ClaudeMessage["content"],
  extra: Partial<ClaudeMessage> = {},
): ClaudeMessage =>
  ({
    uuid,
    sessionId: "session-1",
    timestamp,
    type: "user",
    role: "user",
    content,
    ...extra,
  }) as ClaudeMessage;

describe("myTraceUtils", () => {
  it("keeps only real user-authored messages in chronological trace order", () => {
    const messages: ClaudeMessage[] = [
      userMessage("u2", "2026-04-02T10:00:00.000Z", [
        { type: "text", text: "Second prompt" },
      ]),
      {
        uuid: "a1",
        sessionId: "session-1",
        timestamp: "2026-04-01T10:01:00.000Z",
        type: "assistant",
        role: "assistant",
        content: "Assistant response",
      } as ClaudeMessage,
      userMessage("tool-result", "2026-04-01T10:02:00.000Z", "Tool output", {
        toolUseResult: { ok: true },
      } as Partial<ClaudeMessage>),
      userMessage("u1", "2026-04-01T10:00:00.000Z", "First prompt"),
    ];

    expect(buildUserTraceItems(messages)).toEqual([
      expect.objectContaining({ id: "u1", text: "First prompt" }),
      expect.objectContaining({ id: "u2", text: "Second prompt" }),
    ]);
  });

  it("counts meaningful words for the trace word frequency and cloud", () => {
    const items = buildUserTraceItems([
      userMessage("u1", "2026-04-01T10:00:00.000Z", "Build a trace view, trace the user prompts."),
      userMessage("u2", "2026-04-01T10:05:00.000Z", "User prompts need word cloud analysis."),
    ]);

    expect(computeWordFrequency(items).slice(0, 4)).toEqual([
      { term: "trace", count: 2 },
      { term: "user", count: 2 },
      { term: "prompts", count: 2 },
      { term: "build", count: 1 },
    ]);
  });

  it("excludes sidechain user messages from the main user trace", () => {
    const items = buildUserTraceItems([
      userMessage("main", "2026-04-01T10:00:00.000Z", "Main thread prompt"),
      userMessage("agent", "2026-04-01T10:01:00.000Z", "Agent sidechain prompt", {
        isSidechain: true,
      } as Partial<ClaudeMessage>),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("Main thread prompt");
  });
});
