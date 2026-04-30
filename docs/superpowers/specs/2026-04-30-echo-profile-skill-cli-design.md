# EchoProfile Skill CLI Design

Date: 2026-04-30
Status: Draft approved in discussion

## Goal

Add a machine-oriented CLI surface to the existing `echo-profile` binary so Codex skills and other portable agent skills can discover local AI conversation history and collect raw user-message samples for downstream profile generation.

The CLI is not an interactive chat interface and does not generate profiles itself. It provides stable JSON data for skills, which then decide how to prompt Codex or another agent.

## Non-Goals

MVP does not include:

- `search`
- `export`
- `profile generate`
- interactive/chat mode
- human table output
- `ep` short alias
- arbitrary file reading
- LLM calls

## Command Surface

The only official command name is `echo-profile`.

All machine-interface commands always output JSON. `--json` may be accepted as a no-op for compatibility, but JSON is the default and only output format for `help`, `version`, `list`, and `profile collect`.

MVP commands:

```bash
echo-profile help
echo-profile help list
echo-profile help list providers
echo-profile help list projects
echo-profile help list sessions
echo-profile help profile collect
echo-profile help serve

echo-profile version

echo-profile list providers
echo-profile list projects
echo-profile list sessions

echo-profile profile collect --scope global
echo-profile profile collect --scope project --current-project
echo-profile profile collect --scope project --actual-project-path <PATH>
echo-profile profile collect --scope project --project-path <PROVIDER_NATIVE_PATH>
echo-profile profile collect --scope session --session-path <PATH>

echo-profile serve
echo-profile --serve
```

`echo-profile serve` is an alias for the existing WebUI server mode. Existing `echo-profile --serve` behavior remains supported for compatibility.

`serve` and `--serve` are long-running server modes, not machine-interface data commands. They preserve the existing WebUI server behavior and may write operational information to stderr instead of returning a one-shot JSON envelope.

With no CLI args, `echo-profile` continues to launch the normal Tauri desktop app.

## JSON Envelope

Every machine-interface command writes one JSON envelope to stdout. stderr is reserved for debug/internal logs. Exit code is `0` on success and non-zero on failure. This envelope does not apply to long-running `serve` / `--serve` server mode.

Success:

```json
{
  "ok": true,
  "schemaVersion": "echo-profile.cli.v1",
  "data": {},
  "warnings": []
}
```

Failure:

```json
{
  "ok": false,
  "schemaVersion": "echo-profile.cli.v1",
  "error": {
    "code": "NO_MESSAGES_FOUND",
    "message": "No user messages found for the requested scope.",
    "details": {}
  },
  "warnings": []
}
```

Error and warning codes use uppercase snake case.

Common error codes:

```text
UNKNOWN_COMMAND
INVALID_ARGUMENT
PROVIDER_UNAVAILABLE
PROVIDER_REQUIRED
PROJECT_NOT_FOUND
SESSION_NOT_FOUND
SESSION_PATH_NOT_ALLOWED
NO_MESSAGES_FOUND
INVALID_TIME_RANGE
INTERNAL_ERROR
```

Warning codes:

```text
SCAN_LIMIT_REACHED
PARTIAL_PROVIDER_FAILURE
CACHE_READ_FAILED
CACHE_WRITE_FAILED
```

## Help and Version

`echo-profile help` returns structured command documentation for skill self-discovery. Help supports topic paths such as `help profile collect`.

`echo-profile version` returns binary, CLI schema, and feature information:

```json
{
  "ok": true,
  "schemaVersion": "echo-profile.cli.v1",
  "data": {
    "appVersion": "0.1.4",
    "cliSchemaVersion": "echo-profile.cli.v1",
    "features": [
      "help",
      "version",
      "list_providers",
      "list_projects",
      "list_sessions",
      "profile_collect",
      "serve"
    ]
  },
  "warnings": []
}
```

## Provider Rules

Provider filters support all of these forms:

```bash
--provider codex
--providers codex,claude
--provider codex --provider claude
```

All values are merged and deduplicated. When no provider is explicitly specified, commands use all available providers. If a provider is explicitly specified but unsupported or unavailable, the command fails with `PROVIDER_UNAVAILABLE`.

`list providers` lists all supported providers, not only available ones:

```json
{
  "provider": "codex",
  "displayName": "Codex CLI",
  "isAvailable": true,
  "basePath": "/Users/hangsu/.codex"
}
```

Unavailable providers are included with `isAvailable: false` and `basePath: null`.

## List Projects

Command examples:

```bash
echo-profile list projects
echo-profile list projects --provider codex
echo-profile list projects --providers codex,claude
echo-profile list projects --limit 50 --offset 0
echo-profile list projects --since 30d
echo-profile list projects --no-cache
```

Rules:

- Default providers: all available providers.
- Explicit unavailable provider fails.
- Default sort: `lastModified` descending.
- Default pagination: `limit=50`, `offset=0`.
- Supports `--since` and `--until`.
- Uses provider scan cache by default.
- `--no-cache` forces a fresh scan.
- Does not output opaque stable ids.

Item schema:

```json
{
  "provider": "codex",
  "projectPath": "codex:///Users/hangsu/Desktop/EchoProfile",
  "actualProjectPath": "/Users/hangsu/Desktop/EchoProfile",
  "name": "EchoProfile",
  "sessionCount": 12,
  "messageCount": 438,
  "lastModified": "2026-04-30T12:34:56Z"
}
```

Pagination schema:

```json
{
  "offset": 0,
  "limit": 50,
  "returned": 50,
  "hasMore": true,
  "nextOffset": 50
}
```

## List Sessions

Command examples:

```bash
echo-profile list sessions
echo-profile list sessions --current-project
echo-profile list sessions --current-project --include-ancestor-projects
echo-profile list sessions --actual-project-path /Users/hangsu/Desktop/EchoProfile
echo-profile list sessions --project-path "codex:///Users/hangsu/Desktop/EchoProfile"
echo-profile list sessions --provider codex
echo-profile list sessions --limit 50 --offset 0
echo-profile list sessions --since 7d
echo-profile list sessions --no-cache
```

Rules:

- Without a project filter, returns the most recent 50 sessions across all available providers.
- With `--current-project`, uses the same matching logic as `profile collect --scope project --current-project`.
- With `--actual-project-path`, matches provider history by actual project path.
- With `--project-path`, matches provider-native project path.
- Default sort: `lastMessageTime` or `lastModified` descending.
- Default pagination: `limit=50`, `offset=0`.
- Supports `--since` and `--until`.
- Uses provider scan cache by default.
- `--no-cache` forces a fresh scan.
- Outputs session metadata only; no message previews.
- Includes `summary` if available.
- Does not output `actualSessionId` or opaque stable ids.

Item schema:

```json
{
  "provider": "codex",
  "sessionPath": "/Users/hangsu/.codex/sessions/.../rollout-xxx.jsonl",
  "projectPath": "codex:///Users/hangsu/Desktop/EchoProfile",
  "actualProjectPath": "/Users/hangsu/Desktop/EchoProfile",
  "summary": "Discussed EchoProfile CLI design",
  "messageCount": 58,
  "firstMessageTime": "2026-04-30T10:00:00Z",
  "lastMessageTime": "2026-04-30T12:34:56Z",
  "lastModified": "2026-04-30T12:35:01Z"
}
```

## Project Location Rules

Path/native locators are first-class. The CLI does not rely on opaque ids.

Primary locating fields:

- `provider`
- `projectPath`
- `actualProjectPath`
- `sessionPath`

`--current-project`:

- Starts from current process cwd.
- Tries cwd and ancestor roots.
- Root markers include `.git`, `package.json`, `Cargo.toml`, and parent paths.
- Defaults to the nearest matching project.
- If multiple providers match the nearest project, all are included.
- `--include-ancestor-projects` includes higher ancestor projects too.

`--actual-project-path <PATH>`:

- Must be an absolute path.
- Is used only as a key to match provider history metadata.
- Does not read the project directory contents.
- If no matching history project exists, fails with `PROJECT_NOT_FOUND`.

## Session Path Safety

`profile collect --scope session --session-path <PATH>` must restrict reads to the relevant provider history directory.

Examples:

- Codex: `~/.codex/sessions` or `~/.codex/archived_sessions`
- Claude: `~/.claude/projects` or configured custom Claude paths
- Other providers: their own safe history roots

The implementation must canonicalize paths and prevent `../` and symlink traversal. There is no `--allow-any-session-path` escape hatch.

If `--provider` is omitted for session scope, the CLI attempts to infer provider from the path and/or format. If inference fails, return `PROVIDER_REQUIRED`.

## Profile Collect

`profile collect` collects raw user text messages for downstream profile generation by Codex skills. It does not call an LLM and does not generate the profile.

Supported scopes:

```bash
--scope global
--scope project
--scope session
```

Rules:

- `global`: defaults to all available providers.
- `project`: requires one of `--current-project`, `--actual-project-path`, or `--project-path`.
- `session`: requires `--session-path`.
- Multiple matching providers/projects are included and reflected in `config.matchedProjects`.
- Defaults include active and archived sessions.

Output schema:

```json
{
  "config": {
    "scope": "project",
    "sample": "mixed",
    "budgetChars": 30000,
    "pasteDetectMinChars": 50,
    "pasteLikeThreshold": 0.7,
    "includePasteLike": false,
    "providers": ["codex", "claude"],
    "matchedProjects": [
      {
        "provider": "codex",
        "projectPath": "codex:///Users/hangsu/Desktop/EchoProfile",
        "actualProjectPath": "/Users/hangsu/Desktop/EchoProfile"
      }
    ]
  },
  "messages": [
    {
      "provider": "codex",
      "role": "user",
      "timestamp": "2026-04-30T12:34:56Z",
      "sessionPath": "/Users/hangsu/.codex/sessions/.../rollout-xxx.jsonl",
      "projectPath": "codex:///Users/hangsu/Desktop/EchoProfile",
      "actualProjectPath": "/Users/hangsu/Desktop/EchoProfile",
      "text": "完整用户输入..."
    }
  ],
  "usedChars": 12800,
  "omitted": {
    "pasteLike": 6,
    "overBudget": 12,
    "singleMessageOverBudget": 1,
    "scanLimitSessions": 0,
    "scanLimitMessages": 0,
    "nonTextMessages": 3
  }
}
```

If no user messages remain, return `NO_MESSAGES_FOUND`. If all messages were filtered out, include omitted counts in `error.details`.

## Text Extraction

`profile collect` only includes user messages and only text content.

Rules:

- Ignore assistant/tool messages.
- Ignore images, attachments, and non-text content blocks.
- If a user message has no text content, omit it and increment `omitted.nonTextMessages`.
- Preserve selected message text exactly.
- Do not dedupe.
- Do not summarize.
- Do not rewrite.
- Do not truncate a single message.

## Budget

Default:

```bash
--budget-chars 30000
```

`budgetChars` counts only `messages[].text` characters. It does not count metadata/config JSON.

Rules:

- A single message longer than `budgetChars` is skipped and counted in `omitted.singleMessageOverBudget`.
- If a message does not fit in remaining budget, skip it and count `omitted.overBudget`.
- Continue considering later messages according to the sampling strategy.

## Paste-Like Filtering

Default paste-like filtering is enabled.

Defaults:

```bash
--paste-detect-min-chars 50
--paste-like-threshold 0.7
```

Rules:

- If message length is below `pasteDetectMinChars`, do not run paste-like detection.
- If message length is at or above `pasteDetectMinChars`, run paste-like detection.
- If paste-like ratio is at or above `pasteLikeThreshold`, skip it and increment `omitted.pasteLike`.
- `--include-paste-like` disables paste-like filtering.

Paste-like signals include:

- fenced code block dominates
- diff/patch dominates
- JSON/YAML/XML/blob dominates
- stack trace/log dump dominates
- shell output dominates
- many long lines resembling file content
- low natural-language ratio

Filtering must be conservative. Length alone is not enough to filter.

Short inputs such as `继续`, `ok`, `1`, or `改` are not filtered merely for being short.

## Sampling

Option:

```bash
--sample recent|representative|mixed|chronological
```

Defaults:

- `global`: `mixed`
- `project`: `mixed`
- `session`: `chronological`

Final output is always sorted by message timestamp ascending.

`mixed`:

- 50% recent
- 50% representative

`recent`:

- Prioritize recent sessions.
- Final message output remains chronological.

`representative`:

- Global: cover provider/project/session/time buckets.
- Project: cover provider/session/time buckets.
- Session: time-uniform sampling if explicitly requested.

`chronological`:

- Select messages in ascending time order until budget is exhausted.

Lightweight weighting applies for `mixed` and `representative`, without LLM calls. Higher-value messages include explicit preferences, constraints, corrections, decisions, workflow statements, and long natural-language explanations.

## Time Filtering

Supported for `list sessions` and `profile collect`:

```bash
--since 2026-01-01
--until 2026-04-30
--since 30d
--since 12h
--since 90m
```

Accepted formats:

- ISO date: `YYYY-MM-DD`
- ISO datetime: `YYYY-MM-DDTHH:mm:ssZ`
- Relative duration: `Nd`, `Nh`, `Nm`

Relative times are based on local machine current time. Invalid ranges return `INVALID_TIME_RANGE`.

## Scan Limits

Defaults:

```bash
--max-sessions-scan 1000
--max-messages-scan 50000
```

When a scan limit is reached:

- Do not fail.
- Return collected results.
- Add `SCAN_LIMIT_REACHED` warning.
- Increment `omitted.scanLimitSessions` or `omitted.scanLimitMessages`.

## Implementation Plan Shape

Recommended modules:

```text
src-tauri/src/cli/mod.rs
src-tauri/src/cli/args.rs
src-tauri/src/cli/output.rs
src-tauri/src/cli/help.rs
src-tauri/src/cli/list.rs
src-tauri/src/cli/profile_collect.rs
src-tauri/src/cli/paste_filter.rs
src-tauri/src/cli/sampling.rs
src-tauri/src/cli/time_filter.rs
src-tauri/src/cli/project_match.rs
```

Use Rust built-in CLI inside the existing binary. Recommended argument parser: `clap` with derive support.

Current backend/provider logic should be reused rather than reimplemented in TypeScript:

- `src-tauri/src/providers/*`
- `src-tauri/src/commands/multi_provider.rs`
- existing models such as `ClaudeProject`, `ClaudeSession`, and `ClaudeMessage`

CLI commands must not start Tauri UI or WebUI server unless the user runs `serve` or `--serve`.

## Tests

Unit tests:

- `time_filter`: ISO dates, ISO datetimes, relative durations, invalid inputs.
- `paste_filter`: short natural input, long natural input, code block, diff, log, stack trace, include-paste-like bypass.
- `sampling`: chronological order, recent session priority, mixed 50/50, representative bucket coverage, budget behavior.
- `project_match`: cwd exact match, subdirectory ancestor match, nearest-project default, include ancestors, multiple provider match.
- `output`: success envelope, error envelope, schemaVersion presence, exit code mapping.

Integration tests should use temporary HOME / CODEX_HOME fixtures and avoid reading a developer's real history.

Command tests:

```bash
echo-profile version
echo-profile help
echo-profile help profile collect
echo-profile list providers
echo-profile list projects --limit 1
echo-profile list sessions --limit 1
echo-profile profile collect --scope session --session-path <fixture>
```

## Skill Integration Notes

A portable skill should treat `echo-profile` as a local data collection tool.

Recommended workflow:

1. Run `echo-profile version` to check CLI schema and features.
2. Run `echo-profile list providers` to see available history sources.
3. Optionally run `echo-profile list sessions --current-project` to identify recent project sessions.
4. Optionally calibrate paste threshold by collecting one explicit session with `--include-paste-like`.
5. Run `echo-profile profile collect` for `global`, `project`, or `session` scope.
6. Generate the profile inside Codex using the returned JSON messages.

Example:

```bash
echo-profile profile collect \
  --scope project \
  --current-project \
  --budget-chars 30000
```
