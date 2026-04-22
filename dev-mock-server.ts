/**
 * Vite dev server mock middleware for browser testing.
 *
 * Provides mock API responses so the app can render in a browser
 * without Tauri runtime. Used for UI development and testing only.
 *
 * Usage: set VITE_MOCK=1 environment variable, then `pnpm dev`
 */

import type { Plugin } from "vite";
import type {
  GlobalStatsSummary,
  ProjectStatsSummary,
  SessionTokenStats,
} from "./src/types";

function makeUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function makeMessage(
  type: "user" | "assistant",
  content: string,
  timestamp: string,
  parentUuid?: string,
) {
  const uuid = makeUuid();
  return {
    uuid,
    parentUuid: parentUuid ?? null,
    sessionId: "mock-session-001",
    timestamp,
    type,
    isSidechain: false,
    message: {
      role: type === "user" ? "user" : "assistant",
      content:
        type === "assistant"
          ? [{ type: "text", text: content }]
          : content,
      ...(type === "assistant"
        ? {
            id: `msg_${uuid.slice(0, 8)}`,
            model: "claude-sonnet-4-20250514",
            stop_reason: "end_turn",
            usage: {
              input_tokens: 1200,
              output_tokens: 350,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          }
        : {}),
    },
    content:
      type === "assistant"
        ? [{ type: "text", text: content }]
        : content,
    model: type === "assistant" ? "claude-sonnet-4-20250514" : undefined,
    usage:
      type === "assistant"
        ? {
            input_tokens: 1200,
            output_tokens: 350,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          }
        : undefined,
  };
}

/** Generate mock messages spanning 3 days */
function generateMockMessages() {
  const messages = [];
  let prevUuid: string | undefined;

  // Day 1: March 7
  const day1Pairs = [
    ["Analyze the project structure", "I can analyze the project structure. Under src/ you have components, hooks, store, and utils."],
    ["Show me the component list", "Key components include MessageViewer, ProjectTree, and SettingsManager."],
    ["How are tests organized?", "The project uses Vitest, and test files live under src/test/."],
  ];

  for (let i = 0; i < day1Pairs.length; i++) {
    const [userMsg, assistantMsg] = day1Pairs[i]!;
    const hour = 10 + i;
    const userM = makeMessage("user", userMsg!, `2026-03-07T${String(hour).padStart(2, "0")}:${String(i * 15).padStart(2, "0")}:00.000Z`, prevUuid);
    messages.push(userM);
    const assistantM = makeMessage("assistant", assistantMsg!, `2026-03-07T${String(hour).padStart(2, "0")}:${String(i * 15 + 2).padStart(2, "0")}:00.000Z`, userM.uuid);
    messages.push(assistantM);
    prevUuid = assistantM.uuid;
  }

  // Day 2: March 8
  const day2Pairs = [
    ["i18n 设置方法是什么？", "我们使用 react-i18next，当前在 src/i18n/locales/ 下保留 en 和 zh-CN 两种语言。"],
    ["How do I add a new i18n key?", "Add the key to the matching namespace JSON file in each locale folder, then run generate:i18n-types."],
    ["What are the build commands?", "Use just dev for development mode and just tauri-build for a production build."],
    ["What is the ESLint setup?", "The project uses TypeScript ESLint with no-explicit-any enabled."],
  ];

  for (let i = 0; i < day2Pairs.length; i++) {
    const [userMsg, assistantMsg] = day2Pairs[i]!;
    const hour = 9 + i * 2;
    const userM = makeMessage("user", userMsg!, `2026-03-08T${String(hour).padStart(2, "0")}:30:00.000Z`, prevUuid);
    messages.push(userM);
    const assistantM = makeMessage("assistant", assistantMsg!, `2026-03-08T${String(hour).padStart(2, "0")}:32:00.000Z`, userM.uuid);
    messages.push(assistantM);
    prevUuid = assistantM.uuid;
  }

  // Day 3: March 10 (today)
  const day3Pairs = [
    ["Summarize today's tasks", "We're working on Issue #170 to improve date visibility by adding date dividers and a floating overlay."],
    ["Start the implementation", "I'll begin with Phase 1 by adding formatDateDivider to time.ts."],
    ["Check whether it works", "The TypeScript build, ESLint, and i18n validation all passed."],
  ];

  for (let i = 0; i < day3Pairs.length; i++) {
    const [userMsg, assistantMsg] = day3Pairs[i]!;
    const hour = 14 + i;
    const userM = makeMessage("user", userMsg!, `2026-03-10T${String(hour).padStart(2, "0")}:00:00.000Z`, prevUuid);
    messages.push(userM);
    const assistantM = makeMessage("assistant", assistantMsg!, `2026-03-10T${String(hour).padStart(2, "0")}:02:00.000Z`, userM.uuid);
    messages.push(assistantM);
    prevUuid = assistantM.uuid;
  }

  return messages;
}

const MOCK_MESSAGES = generateMockMessages();

const MOCK_SESSION = {
  session_id: "mock-session-001",
  actual_session_id: "mock-session-001",
  project_name: "mock-project",
  file_path: "/mock/.claude/projects/-Users-mock-projects-mock-project/mock-session.jsonl",
  message_count: MOCK_MESSAGES.length,
  first_message_time: "2026-03-07T10:00:00.000Z",
  last_message_time: "2026-03-10T16:02:00.000Z",
  last_modified: "2026-03-10T16:02:00.000Z",
  has_tool_use: false,
  has_errors: false,
  provider: "claude",
};

const MOCK_PROJECT = {
  name: "mock-project",
  path: "/mock/.claude/projects/-Users-mock-projects-mock-project",
  actual_path: "/Users/mock/projects/mock-project",
  session_count: 1,
  message_count: MOCK_MESSAGES.length,
  last_modified: "2026-03-10T16:02:00.000Z",
  provider: "claude",
};

export function createMockSessionTokenStats(): SessionTokenStats {
  return {
    session_id: MOCK_SESSION.actual_session_id,
    project_name: MOCK_PROJECT.name,
    total_input_tokens: 12000,
    total_output_tokens: 3500,
    total_cache_creation_tokens: 0,
    total_cache_read_tokens: 0,
    total_tokens: 15500,
    message_count: MOCK_MESSAGES.length,
    first_message_time: MOCK_SESSION.first_message_time,
    last_message_time: MOCK_SESSION.last_message_time,
    summary: MOCK_SESSION.project_name,
    most_used_tools: [],
  };
}

export function createMockProjectStatsSummary(): ProjectStatsSummary {
  return {
    project_name: MOCK_PROJECT.name,
    total_sessions: 1,
    total_messages: MOCK_MESSAGES.length,
    total_tokens: 15500,
    avg_tokens_per_session: 15500,
    avg_session_duration: 360,
    total_session_duration: 360,
    most_active_hour: 14,
    most_used_tools: [],
    daily_stats: [
      {
        date: "2026-03-07",
        total_tokens: 4200,
        input_tokens: 3000,
        output_tokens: 1200,
        message_count: 6,
        session_count: 1,
        active_hours: 3,
      },
      {
        date: "2026-03-08",
        total_tokens: 5600,
        input_tokens: 4100,
        output_tokens: 1500,
        message_count: 8,
        session_count: 1,
        active_hours: 4,
      },
      {
        date: "2026-03-10",
        total_tokens: 5700,
        input_tokens: 4900,
        output_tokens: 800,
        message_count: 6,
        session_count: 1,
        active_hours: 3,
      },
    ],
    activity_heatmap: [
      { hour: 10, day: 5, activity_count: 2, tokens_used: 1300 },
      { hour: 11, day: 5, activity_count: 2, tokens_used: 1450 },
      { hour: 12, day: 5, activity_count: 2, tokens_used: 1450 },
      { hour: 9, day: 6, activity_count: 2, tokens_used: 1200 },
      { hour: 11, day: 6, activity_count: 2, tokens_used: 2200 },
      { hour: 13, day: 6, activity_count: 2, tokens_used: 2200 },
      { hour: 15, day: 6, activity_count: 2, tokens_used: 0 },
      { hour: 14, day: 2, activity_count: 2, tokens_used: 2300 },
      { hour: 15, day: 2, activity_count: 2, tokens_used: 1900 },
      { hour: 16, day: 2, activity_count: 2, tokens_used: 1500 },
    ],
    token_distribution: {
      input: 12000,
      output: 3500,
      cache_creation: 0,
      cache_read: 0,
    },
  };
}

export function createMockGlobalStatsSummary(): GlobalStatsSummary {
  return {
    total_projects: 1,
    total_sessions: 1,
    total_messages: MOCK_MESSAGES.length,
    total_tokens: 15500,
    total_session_duration_minutes: 360,
    date_range: {
      first_message: MOCK_SESSION.first_message_time,
      last_message: MOCK_SESSION.last_message_time,
      days_span: 4,
    },
    token_distribution: {
      input: 12000,
      output: 3500,
      cache_creation: 0,
      cache_read: 0,
    },
    daily_stats: [
      {
        date: "2026-03-07",
        total_tokens: 4200,
        input_tokens: 3000,
        output_tokens: 1200,
        message_count: 6,
        session_count: 1,
        active_hours: 3,
      },
      {
        date: "2026-03-08",
        total_tokens: 5600,
        input_tokens: 4100,
        output_tokens: 1500,
        message_count: 8,
        session_count: 1,
        active_hours: 4,
      },
      {
        date: "2026-03-10",
        total_tokens: 5700,
        input_tokens: 4900,
        output_tokens: 800,
        message_count: 6,
        session_count: 1,
        active_hours: 3,
      },
    ],
    activity_heatmap: [
      { hour: 10, day: 5, activity_count: 2, tokens_used: 1300 },
      { hour: 11, day: 5, activity_count: 2, tokens_used: 1450 },
      { hour: 12, day: 5, activity_count: 2, tokens_used: 1450 },
      { hour: 9, day: 6, activity_count: 2, tokens_used: 1200 },
      { hour: 11, day: 6, activity_count: 2, tokens_used: 2200 },
      { hour: 13, day: 6, activity_count: 2, tokens_used: 2200 },
      { hour: 15, day: 6, activity_count: 2, tokens_used: 0 },
      { hour: 14, day: 2, activity_count: 2, tokens_used: 2300 },
      { hour: 15, day: 2, activity_count: 2, tokens_used: 1900 },
      { hour: 16, day: 2, activity_count: 2, tokens_used: 1500 },
    ],
    most_used_tools: [],
    provider_distribution: [
      {
        provider_id: "claude",
        projects: 1,
        sessions: 1,
        messages: MOCK_MESSAGES.length,
        tokens: 15500,
      },
    ],
    model_distribution: [
      {
        model_name: "claude-sonnet-4-20250514",
        message_count: 10,
        token_count: 15500,
        input_tokens: 12000,
        output_tokens: 3500,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
      },
    ],
    top_projects: [
      {
        project_name: MOCK_PROJECT.name,
        sessions: 1,
        messages: MOCK_MESSAGES.length,
        tokens: 15500,
      },
    ],
  };
}

/** API route handlers */
const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  get_claude_folder_path: () => "/mock/.claude",
  validate_claude_folder: () => true,
  scan_projects: () => [MOCK_PROJECT],
  scan_all_projects: () => [MOCK_PROJECT],
  detect_providers: () => [{ id: "claude", name: "Claude Code", is_available: true, session_count: 1 }],
  load_project_sessions: () => [MOCK_SESSION],
  load_provider_sessions: () => [MOCK_SESSION],
  load_session_messages: () => MOCK_MESSAGES,
  load_provider_messages: () => MOCK_MESSAGES,
  search_messages: () => [],
  get_session_token_stats: () => createMockSessionTokenStats(),
  get_project_token_stats: () => ({
    sessions: [],
    total_sessions: 0,
    page: 1,
    page_size: 20,
  }),
  get_project_stats_summary: () => createMockProjectStatsSummary(),
  get_global_stats_summary: () => createMockGlobalStatsSummary(),
  get_session_comparison: () => [],
  get_recent_edits: () => [],
  load_mcp_presets: () => [],
  load_presets: () => [],
  get_all_mcp_servers: () => [],
  load_metadata: () => ({}),
  save_metadata: () => ({}),
  load_user_metadata: () => ({ version: 1, sessions: {}, projects: {}, settings: {} }),
  save_user_metadata: () => ({}),
  load_settings: () => null,
  save_settings: () => ({}),
  load_session_metadata: () => ({}),
  save_session_metadata: () => ({}),
  rename_session_native: () => ({}),
  read_text_file: () => "",
};

export function mockApiPlugin(): Plugin {
  return {
    name: "mock-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }

        const command = req.url.replace("/api/", "").split("?")[0]!;
        const handler = handlers[command];

        if (!handler) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Unknown command: ${command}` }));
          return;
        }

        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const args = body ? (JSON.parse(body) as Record<string, unknown>) : {};
            const result = handler(args);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });
    },
  };
}
