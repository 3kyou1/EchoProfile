import type { ClaudeMessage, ClaudeSession, ProviderId } from "@/types";

export interface UserTraceItem {
  id: string;
  sessionId: string;
  sessionTitle?: string;
  timestamp: string;
  text: string;
  provider?: ProviderId;
  projectName?: string;
}

export interface WordFrequencyItem {
  term: string;
  count: number;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "the",
  "this",
  "to",
  "with",
  "you",
]);

export function traceContentToText(content: ClaudeMessage["content"]): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      if ("text" in item && typeof item.text === "string") {
        return item.text.trim();
      }

      if ("content" in item && typeof item.content === "string") {
        return item.content.trim();
      }

      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function buildUserTraceItems(
  messages: ClaudeMessage[],
  session?: ClaudeSession,
): UserTraceItem[] {
  return messages
    .filter(
      (message) =>
        message.type === "user" && !message.toolUseResult && !message.isSidechain,
    )
    .map((message) => ({
      id: message.uuid,
      sessionId: message.sessionId || session?.actual_session_id || session?.session_id || "",
      sessionTitle: session?.summary || session?.actual_session_id || session?.session_id,
      timestamp: message.timestamp,
      text: traceContentToText(message.content),
      provider: message.provider ?? session?.provider,
      projectName: message.projectName,
    }))
    .filter((item) => item.text.length > 0)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export function tokenizeTraceText(text: string): string[] {
  const normalized = text.toLowerCase();

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return Array.from(segmenter.segment(normalized))
      .filter((segment) => segment.isWordLike)
      .map((segment) => segment.segment.trim())
      .filter(isMeaningfulToken);
  }

  return normalized.match(/[\p{L}\p{N}]+/gu)?.filter(isMeaningfulToken) ?? [];
}

export function computeWordFrequency(
  items: UserTraceItem[],
  limit = 80,
): WordFrequencyItem[] {
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let index = 0;

  for (const item of items) {
    for (const token of tokenizeTraceText(item.text)) {
      if (!firstSeen.has(token)) {
        firstSeen.set(token, index);
        index += 1;
      }
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return (firstSeen.get(left.term) ?? 0) - (firstSeen.get(right.term) ?? 0);
    })
    .slice(0, limit);
}

function isMeaningfulToken(token: string): boolean {
  if (!token || STOP_WORDS.has(token)) {
    return false;
  }

  if (/^\d+$/.test(token)) {
    return false;
  }

  return token.length >= 2 || /[\u3400-\u9fff]/.test(token);
}
