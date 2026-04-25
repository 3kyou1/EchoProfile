import { api } from "@/services/api";
import { createModuleLogger } from "@/utils/logger";
import { isTauri } from "@/utils/platform";

const llmDebugLogger = createModuleLogger("LLM Debug");
const MAX_STRING_LENGTH = 8000;
const MAX_COLLECTION_ITEMS = 40;
const MAX_OBJECT_KEYS = 40;
const MAX_DEPTH = 4;

export type LlmDebugCategory = "copa" | "resonance";
export type LlmDebugLevel = "debug" | "info" | "warn" | "error";

export interface LlmDebugEntry {
  category: LlmDebugCategory;
  stage: string;
  level?: LlmDebugLevel;
  payload?: Record<string, unknown>;
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function sanitizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return truncateString(value);
  }

  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? truncateString(value.stack) : undefined,
    };
  }

  if (depth >= MAX_DEPTH) {
    return "[truncated: depth limit]";
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1, seen));

    if (value.length > MAX_COLLECTION_ITEMS) {
      items.push(`[truncated ${value.length - MAX_COLLECTION_ITEMS} items]`);
    }

    return items;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[truncated: circular]";
    }

    seen.add(value);
    const entries = Object.entries(value);
    const limitedEntries = entries.slice(0, MAX_OBJECT_KEYS);
    const sanitized = Object.fromEntries(
      limitedEntries.map(([key, item]) => [key, sanitizeValue(item, depth + 1, seen)])
    );

    if (entries.length > MAX_OBJECT_KEYS) {
      sanitized.__truncated_keys__ = entries.length - MAX_OBJECT_KEYS;
    }

    seen.delete(value);
    return sanitized;
  }

  return String(value);
}

export async function persistLlmDebugLog(entry: LlmDebugEntry): Promise<void> {
  const level = entry.level ?? "debug";
  const payload = sanitizeValue(entry.payload ?? {}) as Record<string, unknown>;
  const message = `[${entry.category}:${entry.stage}]`;
  const shouldWarnOnPersistenceFailure = isTauri();

  llmDebugLogger[level](message, payload);

  try {
    await api("log_frontend_llm_debug", {
      category: entry.category,
      stage: entry.stage,
      level,
      payload: JSON.stringify(payload),
    });
  } catch (error) {
    if (shouldWarnOnPersistenceFailure) {
      llmDebugLogger.warn("Failed to persist LLM debug log", {
        category: entry.category,
        stage: entry.stage,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
