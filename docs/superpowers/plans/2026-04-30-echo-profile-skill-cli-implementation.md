# EchoProfile Skill CLI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a machine-oriented `echo-profile` CLI that lets portable skills inspect available history sources, list projects/sessions, and collect raw user-message samples for downstream profile generation.

**Architecture:** Implement the CLI inside the existing Rust/Tauri binary so it reuses provider parsers and session loaders. Add a small CLI module boundary for argument parsing, JSON envelopes, list/profile handlers, time filters, paste filtering, project matching, and sampling; keep WebUI `serve` as a long-running mode alias that does not use JSON envelopes.

**Tech Stack:** Rust 2021, Tauri 2, `serde`, `serde_json`, `chrono`, existing EchoProfile provider modules, new `clap` derive parser, Cargo tests.

---

## References

- Spec: `docs/superpowers/specs/2026-04-30-echo-profile-skill-cli-design.md`
- Existing entrypoint: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Provider registry: `src-tauri/src/providers/mod.rs`
- Multi-provider commands: `src-tauri/src/commands/multi_provider.rs`
- Models: `src-tauri/src/models/session.rs`, `src-tauri/src/models/message.rs`
- Codex provider safety reference: `src-tauri/src/providers/codex.rs`

## File Map

Create:

- `src-tauri/src/cli/mod.rs` — CLI dispatch entrypoint and high-level command router.
- `src-tauri/src/cli/args.rs` — `clap` command structs and parse helpers.
- `src-tauri/src/cli/output.rs` — JSON envelope, CLI errors, warnings, and exit-code mapping.
- `src-tauri/src/cli/help.rs` — structured help topics and examples.
- `src-tauri/src/cli/providers.rs` — provider normalization, availability checks, all-supported provider list.
- `src-tauri/src/cli/list.rs` — `list providers/projects/sessions` handlers and pagination.
- `src-tauri/src/cli/profile_collect.rs` — `profile collect` orchestration and output models.
- `src-tauri/src/cli/text_extract.rs` — user-text extraction from normalized `ClaudeMessage` values.
- `src-tauri/src/cli/paste_filter.rs` — paste-like heuristics.
- `src-tauri/src/cli/sampling.rs` — recent/representative/mixed/chronological sampling.
- `src-tauri/src/cli/time_filter.rs` — absolute/relative time parsing and filtering.
- `src-tauri/src/cli/project_match.rs` — current-project and path matching rules.

Modify:

- `src-tauri/Cargo.toml` — add `clap` dependency.
- `src-tauri/src/lib.rs` — expose `cli`, route CLI commands before Tauri startup, add `serve` alias.
- `src-tauri/src/commands/multi_provider.rs` — add a no-cache scan entrypoint or option without breaking existing Tauri/WebUI callers.
- Provider modules only if needed to expose safe session roots or project/session metadata needed by CLI.

Do not modify:

- Frontend TypeScript CoPA generation logic.
- WebUI REST API behavior, except that `serve` alias routes into the existing server startup.

## Chunk 1: CLI Skeleton, JSON Output, Help, Version

### Task 1: Add argument parsing dependency and CLI module shell

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/cli/mod.rs`
- Create: `src-tauri/src/cli/args.rs`
- Test: `src-tauri/src/cli/args.rs`

- [ ] **Step 1: Add failing parser tests**

Add tests in `src-tauri/src/cli/args.rs` before implementation:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_version_command() {
        let cli = CliArgs::try_parse_from(["echo-profile", "version"]).unwrap();
        assert!(matches!(cli.command, CliCommand::Version));
    }

    #[test]
    fn parses_profile_collect_project_current() {
        let cli = CliArgs::try_parse_from([
            "echo-profile",
            "profile",
            "collect",
            "--scope",
            "project",
            "--current-project",
        ])
        .unwrap();
        let CliCommand::Profile(ProfileCommand::Collect(args)) = cli.command else {
            panic!("expected profile collect");
        };
        assert_eq!(args.scope, CollectScope::Project);
        assert!(args.current_project);
    }
}
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
cd src-tauri && cargo test cli::args -- --test-threads=1
```

Expected: FAIL because `cli::args` and structs do not exist yet.

- [ ] **Step 3: Add `clap` dependency**

Add to `src-tauri/Cargo.toml`:

```toml
clap = { version = "4.5", features = ["derive"] }
```

- [ ] **Step 4: Implement minimal args module**

Create `src-tauri/src/cli/args.rs` with `Parser`, `Subcommand`, and `ValueEnum` structs for:

```rust
#[derive(Debug, Parser)]
#[command(name = "echo-profile", disable_help_flag = true)]
pub struct CliArgs {
    #[arg(long, global = true)]
    pub json: bool,
    #[command(subcommand)]
    pub command: CliCommand,
}
```

Include commands: `help`, `version`, `list`, `profile collect`, `serve`. Use value enums for `CollectScope` and `SampleStrategy`.

- [ ] **Step 5: Expose CLI module**

Add to `src-tauri/src/lib.rs`:

```rust
pub mod cli;
```

- [ ] **Step 6: Run parser tests and verify pass**

Run:

```bash
cd src-tauri && cargo test cli::args -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/cli/mod.rs src-tauri/src/cli/args.rs
git commit -m "feat(cli): add command parser skeleton"
```

### Task 2: Implement JSON envelope and CLI errors

**Files:**
- Create: `src-tauri/src/cli/output.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/output.rs`

- [ ] **Step 1: Write failing output tests**

Add tests for success and error envelopes:

```rust
#[test]
fn success_envelope_has_schema_version() {
    let envelope = CliEnvelope::success(serde_json::json!({ "hello": "world" }));
    let json = serde_json::to_value(envelope).unwrap();
    assert_eq!(json["ok"], true);
    assert_eq!(json["schemaVersion"], CLI_SCHEMA_VERSION);
    assert!(json.get("warnings").unwrap().is_array());
}

#[test]
fn error_envelope_has_code_message_and_schema() {
    let envelope = CliEnvelope::failure(CliError::invalid_argument("bad arg"));
    let json = serde_json::to_value(envelope).unwrap();
    assert_eq!(json["ok"], false);
    assert_eq!(json["schemaVersion"], CLI_SCHEMA_VERSION);
    assert_eq!(json["error"]["code"], "INVALID_ARGUMENT");
}
```

- [ ] **Step 2: Run output tests and verify failure**

Run:

```bash
cd src-tauri && cargo test cli::output -- --test-threads=1
```

Expected: FAIL because output types do not exist.

- [ ] **Step 3: Implement output types**

Create:

```rust
pub const CLI_SCHEMA_VERSION: &str = "echo-profile.cli.v1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliEnvelope<T: Serialize> {
    pub ok: bool,
    pub schema_version: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CliErrorBody>,
    pub warnings: Vec<CliWarning>,
}
```

Add `CliError`, `CliErrorBody`, `CliWarning`, code constants, `exit_code()`, and `print_and_exit()` helpers. Keep details as `serde_json::Value`.

- [ ] **Step 4: Run output tests and verify pass**

Run:

```bash
cd src-tauri && cargo test cli::output -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cli/mod.rs src-tauri/src/cli/output.rs
git commit -m "feat(cli): add JSON output envelope"
```

### Task 3: Add `help` and `version` commands

**Files:**
- Create: `src-tauri/src/cli/help.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/help.rs`

- [ ] **Step 1: Write failing help tests**

Test that root help and `profile collect` help include expected options:

```rust
#[test]
fn profile_collect_help_includes_sampling_and_paste_options() {
    let topic = help_topic(&["profile", "collect"]).unwrap();
    let json = serde_json::to_value(topic).unwrap();
    let options = json["options"].as_array().unwrap();
    assert!(options.iter().any(|o| o["name"] == "--scope"));
    assert!(options.iter().any(|o| o["name"] == "--sample"));
    assert!(options.iter().any(|o| o["name"] == "--paste-detect-min-chars"));
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd src-tauri && cargo test cli::help -- --test-threads=1
```

Expected: FAIL because help module is missing.

- [ ] **Step 3: Implement structured help**

Create serializable help structs: `HelpTopic`, `HelpOption`, and `HelpExample`. Add topics for root, `list`, `list providers`, `list projects`, `list sessions`, `profile collect`, and `serve`.

- [ ] **Step 4: Implement `version` response**

In `src-tauri/src/cli/mod.rs`, add handler returning:

```rust
serde_json::json!({
    "appVersion": env!("CARGO_PKG_VERSION"),
    "cliSchemaVersion": CLI_SCHEMA_VERSION,
    "features": ["help", "version", "list_providers", "list_projects", "list_sessions", "profile_collect", "serve"]
})
```

- [ ] **Step 5: Wire CLI dispatch for help/version**

Add `run_machine_command(args) -> Result<serde_json::Value, CliError>` that handles `help` and `version` first.

- [ ] **Step 6: Run tests**

Run:

```bash
cd src-tauri && cargo test cli::help cli::output cli::args -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/cli/help.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): add structured help and version"
```

### Task 4: Route CLI commands from binary startup

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: manual command smoke tests after build

- [ ] **Step 1: Add routing function**

In `src-tauri/src/cli/mod.rs`, expose:

```rust
pub enum CliAction {
    RunMachineCommand(Vec<String>),
    RunServe(Vec<String>),
    LaunchDesktop,
}

pub fn classify_args(args: &[String]) -> CliAction { ... }
```

Rules:

- no args => `LaunchDesktop`
- `--serve` anywhere => `RunServe(args.to_vec())`
- first positional `serve` => `RunServe(convert_serve_to_legacy_args(args))`
- known machine commands => `RunMachineCommand(args.to_vec())`
- unknown first command => machine error JSON with `UNKNOWN_COMMAND`

- [ ] **Step 2: Wire into `run()`**

In `src-tauri/src/lib.rs`, after app data preparation and before `run_tauri()`:

```rust
let args: Vec<String> = std::env::args().collect();
match crate::cli::classify_args(&args) {
    crate::cli::CliAction::LaunchDesktop => {}
    crate::cli::CliAction::RunMachineCommand(args) => {
        std::process::exit(crate::cli::run_and_print(args));
    }
    crate::cli::CliAction::RunServe(args) => { /* existing server path */ }
}
```

Keep server code under `#[cfg(feature = "webui-server")]`. If `serve` is requested without the feature, print JSON error for `serve` command; keep legacy `--serve` behavior as close to existing as possible.

- [ ] **Step 3: Build check**

Run:

```bash
cd src-tauri && cargo check
```

Expected: PASS.

- [ ] **Step 4: Smoke test JSON commands**

Run:

```bash
cd src-tauri && cargo run -- version
cd src-tauri && cargo run -- help profile collect
```

Expected: stdout is valid JSON with `ok: true` and `schemaVersion`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): route machine commands from startup"
```

## Chunk 2: Provider Resolution, Listing, Time Filters

### Task 5: Implement provider normalization and availability checks

**Files:**
- Create: `src-tauri/src/cli/providers.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/providers.rs`

- [ ] **Step 1: Write failing provider tests**

Cover merging and validation:

```rust
#[test]
fn merges_provider_flags_and_csv_values() {
    let resolved = normalize_provider_filters(
        &["codex".to_string()],
        Some("claude,codex"),
    )
    .unwrap();
    assert_eq!(resolved, vec!["claude", "codex"]);
}

#[test]
fn rejects_unknown_provider() {
    let err = normalize_provider_filters(&["unknown".to_string()], None).unwrap_err();
    assert_eq!(err.code(), "PROVIDER_UNAVAILABLE");
}
```

- [ ] **Step 2: Implement provider helpers**

Add:

- `supported_provider_infos() -> Vec<ProviderListItem>` that includes all `ProviderId` values.
- `available_provider_ids() -> Vec<String>` from `providers::detect_providers()` where `is_available`.
- `resolve_provider_scope(explicit) -> Result<Vec<String>, CliError>` with spec behavior.

- [ ] **Step 3: Run tests**

Run:

```bash
cd src-tauri && cargo test cli::providers -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/cli/providers.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): resolve provider filters"
```

### Task 6: Implement time filters

**Files:**
- Create: `src-tauri/src/cli/time_filter.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/time_filter.rs`

- [ ] **Step 1: Write failing time parsing tests**

```rust
#[test]
fn parses_iso_date_as_start_of_day_utc() {
    let parsed = parse_time_arg("2026-04-30", fixed_now()).unwrap();
    assert_eq!(parsed.to_rfc3339(), "2026-04-30T00:00:00+00:00");
}

#[test]
fn parses_relative_days() {
    let now = Utc.with_ymd_and_hms(2026, 4, 30, 12, 0, 0).unwrap();
    let parsed = parse_time_arg("30d", now).unwrap();
    assert_eq!(parsed, now - chrono::Duration::days(30));
}
```

- [ ] **Step 2: Implement parser**

Support `YYYY-MM-DD`, RFC3339/ISO datetime, and relative `Nd`, `Nh`, `Nm`. Add `TimeRange { since, until }` and `contains(timestamp)` helpers.

- [ ] **Step 3: Run tests**

Run:

```bash
cd src-tauri && cargo test cli::time_filter -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/cli/time_filter.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): parse time filters"
```

### Task 7: Add no-cache project scan helper

**Files:**
- Modify: `src-tauri/src/commands/multi_provider.rs`
- Test: existing Rust tests and cargo check

- [ ] **Step 1: Add a no-cache-capable helper without changing Tauri command signature**

Refactor existing `scan_all_projects(...)` internals into:

```rust
pub async fn scan_all_projects_with_options(
    claude_path: Option<String>,
    active_providers: Option<Vec<String>>,
    custom_claude_paths: Option<Vec<CustomClaudePathParam>>,
    wsl_enabled: Option<bool>,
    wsl_excluded_distros: Option<Vec<String>>,
    use_cache: bool,
) -> Result<Vec<ClaudeProject>, String>
```

Then make the existing Tauri command call it with `use_cache = true`.

- [ ] **Step 2: Preserve WSL cache behavior**

Keep existing rule: WSL scans remain live because remote/mounted freshness differs. Effective cache condition should be `use_cache && !wsl_cache_enabled`.

- [ ] **Step 3: Run checks**

Run:

```bash
cd src-tauri && cargo test commands::multi_provider -- --test-threads=1
cd src-tauri && cargo check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/multi_provider.rs
git commit -m "refactor: expose no-cache provider scan option"
```

### Task 8: Implement `list providers` and `list projects`

**Files:**
- Create: `src-tauri/src/cli/list.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/list.rs`

- [ ] **Step 1: Write failing pagination tests**

Add pure tests for pagination helper:

```rust
#[test]
fn paginates_items_and_reports_has_more() {
    let items = vec![1, 2, 3];
    let page = paginate(items, 0, 2);
    assert_eq!(page.items, vec![1, 2]);
    assert!(page.pagination.has_more);
    assert_eq!(page.pagination.next_offset, Some(2));
}
```

- [ ] **Step 2: Implement list output models**

Add serializable structs for `ProviderItem`, `ProjectItem`, `SessionItem`, `Pagination`, and `ListResponse<T>`.

- [ ] **Step 3: Implement providers handler**

Use `cli::providers::supported_provider_infos()` and return all supported providers with availability.

- [ ] **Step 4: Implement projects handler**

Use `scan_all_projects_with_options(..., use_cache = !args.no_cache)`, map `ClaudeProject` into project item fields, filter by time range, sort descending by `lastModified`, paginate.

- [ ] **Step 5: Wire list dispatch**

In `cli::mod.rs`, call `list::handle_list(args).await` or use a runtime if handlers stay async.

If CLI dispatch is synchronous, create a Tokio runtime only for CLI commands that call async backend functions:

```rust
let rt = tokio::runtime::Runtime::new().map_err(...)?;
rt.block_on(list::handle_list(...))
```

`tokio` is already an optional dependency behind `webui-server`; if CLI needs it in default builds, either avoid Tokio for list handlers or move `tokio` out of optional dependencies. Prefer reusing synchronous provider functions where possible; if async command reuse is necessary, update Cargo features intentionally.

- [ ] **Step 6: Run tests and smoke commands**

Run:

```bash
cd src-tauri && cargo test cli::list -- --test-threads=1
cd src-tauri && cargo run -- list providers
cd src-tauri && cargo run -- list projects --limit 1
```

Expected: tests pass and commands output JSON.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/cli/list.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): list providers and projects"
```

## Chunk 3: Project Matching and Session Listing

### Task 9: Implement current-project matching

**Files:**
- Create: `src-tauri/src/cli/project_match.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/project_match.rs`

- [ ] **Step 1: Write failing project matching tests**

Use synthetic `ClaudeProject` values:

```rust
#[test]
fn current_project_picks_nearest_ancestor() {
    let cwd = PathBuf::from("/repo/packages/app/src");
    let projects = vec![project("codex", "/repo"), project("codex", "/repo/packages/app")];
    let matches = match_current_project(&cwd, &projects, false).unwrap();
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].actual_path, "/repo/packages/app");
}

#[test]
fn include_ancestor_projects_keeps_all_matches() {
    let cwd = PathBuf::from("/repo/packages/app/src");
    let projects = vec![project("codex", "/repo"), project("claude", "/repo/packages/app")];
    let matches = match_current_project(&cwd, &projects, true).unwrap();
    assert_eq!(matches.len(), 2);
}
```

- [ ] **Step 2: Implement matching helpers**

Implement:

- canonical/normalized path comparison without requiring matched project dirs to be read.
- cwd ancestor list from nearest to farthest.
- nearest-only default.
- include-ancestors option.
- multi-provider matches at same nearest actual path.

- [ ] **Step 3: Run tests**

Run:

```bash
cd src-tauri && cargo test cli::project_match -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/cli/project_match.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): match current project history"
```

### Task 10: Implement `list sessions`

**Files:**
- Modify: `src-tauri/src/cli/list.rs`
- Test: `src-tauri/src/cli/list.rs`

- [ ] **Step 1: Write failing session list tests with mocked data helpers**

Add pure tests for sorting/filtering session items by time and pagination. Avoid real provider IO in unit tests.

```rust
#[test]
fn session_items_sort_newest_first_before_pagination() {
    let sessions = vec![session("old", "2026-01-01T00:00:00Z"), session("new", "2026-04-01T00:00:00Z")];
    let sorted = sort_sessions_desc(sessions);
    assert_eq!(sorted[0].session_path, "new");
}
```

- [ ] **Step 2: Implement project-filter resolution for sessions**

Support no project filter, `--current-project`, `--actual-project-path`, and `--project-path`.

- [ ] **Step 3: Implement session loading**

For filtered projects, call `commands::multi_provider::load_provider_sessions(provider, project_path, Some(false))`. For no project filter, scan projects first, load sessions for projects in recency order until enough candidates are gathered for `offset + limit` or scan limits.

- [ ] **Step 4: Map sessions to output items**

Set:

- `provider`
- `sessionPath` from `ClaudeSession.file_path`
- `projectPath` from parent project path
- `actualProjectPath` from parent project actual path
- `summary`
- counts and times

Do not include `actualSessionId`.

- [ ] **Step 5: Apply time filters and pagination**

Apply `--since` / `--until` to session `lastMessageTime` or best available timestamp. Sort desc, then paginate.

- [ ] **Step 6: Run tests and smoke command**

Run:

```bash
cd src-tauri && cargo test cli::list -- --test-threads=1
cd src-tauri && cargo run -- list sessions --limit 1
```

Expected: PASS and JSON output.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/cli/list.rs
git commit -m "feat(cli): list sessions"
```

## Chunk 4: Profile Collect Internals

### Task 11: Implement text extraction

**Files:**
- Create: `src-tauri/src/cli/text_extract.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/text_extract.rs`

- [ ] **Step 1: Write failing extraction tests**

Cover string content, content arrays with text blocks, non-user messages, and non-text-only user messages.

```rust
#[test]
fn extracts_string_content_from_user_message() {
    let message = user_message(serde_json::json!("hello"));
    assert_eq!(extract_user_text(&message), Some("hello".to_string()));
}

#[test]
fn ignores_non_text_content_blocks() {
    let message = user_message(serde_json::json!([
        {"type": "image", "source": {}},
        {"type": "text", "text": "describe this"}
    ]));
    assert_eq!(extract_user_text(&message), Some("describe this".to_string()));
}
```

- [ ] **Step 2: Implement extraction**

Rules:

- Only role/user messages are eligible. Use `message.role == Some("user")` or provider-normalized fields that indicate user type.
- `content` string => string.
- `content` array => concatenate text block strings with newlines.
- Objects with text fields => extract only if provider-normalized as text.
- Empty text => `None`.

- [ ] **Step 3: Run tests**

Run:

```bash
cd src-tauri && cargo test cli::text_extract -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/cli/text_extract.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): extract user text messages"
```

### Task 12: Implement paste-like filter

**Files:**
- Create: `src-tauri/src/cli/paste_filter.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/paste_filter.rs`

- [ ] **Step 1: Write failing paste tests**

```rust
#[test]
fn short_input_bypasses_detection() {
    let cfg = PasteFilterConfig { min_chars: 50, threshold: 0.7, include_paste_like: false };
    assert!(!is_paste_like("ok", &cfg).is_paste_like);
}

#[test]
fn dominant_code_block_is_paste_like() {
    let text = "```rust\nfn main() {}\nfn other() {}\n```";
    let cfg = PasteFilterConfig { min_chars: 10, threshold: 0.7, include_paste_like: false };
    assert!(is_paste_like(text, &cfg).is_paste_like);
}

#[test]
fn include_paste_like_bypasses_filtering() {
    let cfg = PasteFilterConfig { min_chars: 10, threshold: 0.7, include_paste_like: true };
    assert!(!should_filter_paste_like("```\ncode\n```", &cfg));
}
```

- [ ] **Step 2: Implement conservative heuristics**

Calculate ratios by lines/chars for fenced code, diff markers, JSON/XML/YAML-like structure, stack traces/log lines, shell output, long-line ratio, and natural-language line ratio. Return a score and feature list internally, but only use it for filtering/omitted counts in MVP.

- [ ] **Step 3: Run tests**

Run:

```bash
cd src-tauri && cargo test cli::paste_filter -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/cli/paste_filter.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): filter paste-like profile inputs"
```

### Task 13: Implement sampling and budget selection

**Files:**
- Create: `src-tauri/src/cli/sampling.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/sampling.rs`

- [ ] **Step 1: Write failing sampling tests**

Test chronological output, budget behavior, recent, representative, and mixed.

```rust
#[test]
fn budget_never_truncates_messages() {
    let messages = vec![candidate("a", 5), candidate("too_long", 20), candidate("b", 5)];
    let result = select_messages(messages, SamplingConfig { budget_chars: 10, strategy: SampleStrategy::Chronological, ..Default::default() });
    assert_eq!(result.messages.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(), vec!["a", "b"]);
    assert_eq!(result.omitted.over_budget, 1);
}

#[test]
fn final_output_is_chronological() {
    let messages = vec![candidate_at("new", 2), candidate_at("old", 1)];
    let result = select_messages(messages, SamplingConfig { strategy: SampleStrategy::Recent, budget_chars: 100, ..Default::default() });
    assert_eq!(result.messages[0].id, "old");
}
```

- [ ] **Step 2: Implement candidate model**

Add an internal `MessageCandidate` with provider/project/session/timestamp/text plus derived fields for session recency and lightweight profile-value score.

- [ ] **Step 3: Implement strategies**

- `chronological`: ascending timestamp.
- `recent`: choose by recent session first, output ascending timestamp.
- `representative`: bucket by provider/project/session/time; use lightweight score within buckets.
- `mixed`: build 50% budget allocation for recent and 50% for representative, dedupe by candidate identity, then final sort ascending.

- [ ] **Step 4: Implement lightweight weighting**

Use simple keyword/pattern checks for preferences, constraints, corrections, decisions, workflow statements, and long natural-language explanations.

- [ ] **Step 5: Run tests**

Run:

```bash
cd src-tauri && cargo test cli::sampling -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/cli/sampling.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): sample profile messages"
```

### Task 14: Implement `profile collect` orchestration

**Files:**
- Create: `src-tauri/src/cli/profile_collect.rs`
- Modify: `src-tauri/src/cli/mod.rs`
- Test: `src-tauri/src/cli/profile_collect.rs`

- [ ] **Step 1: Write failing orchestration tests around pure helpers**

Test that scope validation rejects missing project/session locators and that `NO_MESSAGES_FOUND` includes omitted details.

```rust
#[test]
fn project_scope_requires_locator() {
    let args = CollectArgs { scope: CollectScope::Project, ..Default::default() };
    let err = validate_collect_args(&args).unwrap_err();
    assert_eq!(err.code(), "INVALID_ARGUMENT");
}
```

- [ ] **Step 2: Implement collect output models**

Create `CollectResponse`, `CollectConfigEcho`, `CollectMessage`, `OmittedCounts`, and `MatchedProject` with camelCase serialization.

- [ ] **Step 3: Implement scope resolution**

- `global`: scan projects across providers.
- `project`: resolve matched projects by current project, actual path, or provider-native path.
- `session`: infer provider if absent, validate safe session path, load one session.

- [ ] **Step 4: Implement candidate collection**

For each matched project, load sessions, apply session time filters and scan limits, then load messages, extract user text, apply non-text/paste/single-message-over-budget filters, and build candidates.

- [ ] **Step 5: Implement session path safety**

Use provider-specific safe roots. Start with helpers for current providers based on their detect/base path functions. Canonicalize both root and session path, require session path to start with one allowed root, and fail with `SESSION_PATH_NOT_ALLOWED` otherwise.

- [ ] **Step 6: Apply sampling and no-message failure**

Call `sampling::select_messages`. If no messages are selected, return `NO_MESSAGES_FOUND` with omitted counts in details.

- [ ] **Step 7: Run unit tests**

Run:

```bash
cd src-tauri && cargo test cli::profile_collect -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 8: Smoke test with local data if available**

Run:

```bash
cd src-tauri && cargo run -- profile collect --scope global --budget-chars 1000
```

Expected: valid JSON. If no local history exists, expect valid `NO_MESSAGES_FOUND` JSON.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/cli/profile_collect.rs src-tauri/src/cli/mod.rs
git commit -m "feat(cli): collect profile input messages"
```

## Chunk 5: Integration, Docs, Validation

### Task 15: Add fixture-based integration tests

**Files:**
- Create or modify Rust integration test under `src-tauri/tests/cli.rs` if the crate test layout supports it; otherwise use module-level tests with temp dirs.
- Test fixture helpers may live in `src-tauri/src/test_utils.rs` if reusable.

- [ ] **Step 1: Inspect existing test fixture patterns**

Run:

```bash
find src-tauri -maxdepth 3 -type f -name '*test*' -o -name '*.rs' | sort | head -80
```

Use existing `test_utils` conventions where possible.

- [ ] **Step 2: Create temporary Codex fixture**

Build a temp `CODEX_HOME` with:

```text
sessions/2026/04/30/rollout-test.jsonl
archived_sessions/2026/04/01/rollout-old.jsonl
```

Use the minimal Codex rollout shape already parsed by `providers::codex::load_messages`.

- [ ] **Step 3: Test list and collect against fixture**

Assertions:

- `list providers` marks codex available when `CODEX_HOME` exists.
- `list projects --provider codex` returns fixture project.
- `list sessions --provider codex --actual-project-path <fixture project>` returns metadata without messages.
- `profile collect --scope session --provider codex --session-path <fixture>` returns user messages only.

- [ ] **Step 4: Run integration tests**

Run:

```bash
cd src-tauri && cargo test cli -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tests/cli.rs src-tauri/src/test_utils.rs
git commit -m "test(cli): cover fixture-based history collection"
```

Adjust paths in `git add` to match actual files created.

### Task 16: Update developer docs minimally

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CLAUDE.md` if common commands should mention CLI checks

- [ ] **Step 1: Add concise CLI section**

Add a short section to README files with examples:

```bash
echo-profile version
echo-profile list providers
echo-profile list sessions --current-project
echo-profile profile collect --scope project --current-project --budget-chars 30000
```

Clarify that `profile collect` does not call an LLM and is intended for skills/automation.

- [ ] **Step 2: Run docs grep for command consistency**

Run:

```bash
rg -n "profile collect|list providers|echo-profile serve|--serve" README.md README.zh-CN.md CLAUDE.md LINUX_BUILD.md
```

Expected: new CLI examples are present; existing `--serve` docs remain valid.

- [ ] **Step 3: Commit**

```bash
git add README.md README.zh-CN.md CLAUDE.md
git commit -m "docs: document skill CLI commands"
```

Only add files actually modified.

### Task 17: Final verification

**Files:**
- No code changes expected unless verification finds issues.

- [ ] **Step 1: Format Rust**

Run:

```bash
cd src-tauri && cargo fmt --all
```

Expected: completes without errors.

- [ ] **Step 2: Run Rust tests**

Run:

```bash
cd src-tauri && cargo test -- --test-threads=1
```

Expected: PASS.

- [ ] **Step 3: Run clippy**

Run:

```bash
cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings
```

Expected: PASS.

- [ ] **Step 4: Run frontend/type checks if docs or shared build config changed**

Run:

```bash
pnpm run build
```

Expected: PASS.

If this is too slow locally, run at least:

```bash
pnpm exec tsc --build .
```

- [ ] **Step 5: Manual CLI smoke tests**

Run:

```bash
cd src-tauri
cargo run -- version
cargo run -- help profile collect
cargo run -- list providers
cargo run -- list projects --limit 1
cargo run -- list sessions --limit 1
cargo run -- profile collect --scope global --budget-chars 1000
```

Expected: every machine command prints valid JSON to stdout. `profile collect` may return `ok: false` with `NO_MESSAGES_FOUND` on machines without history, but the JSON envelope must be valid.

- [ ] **Step 6: Check working tree**

Run:

```bash
git status --short
```

Expected: only intentional changes remain. Do not revert unrelated user changes.

- [ ] **Step 7: Final commit if formatting or docs changed after previous commits**

```bash
git add <changed-files>
git commit -m "chore: finalize skill CLI"
```

Skip if there are no new changes.

## Review Notes for Implementers

- Keep JSON schema stable and camelCase.
- Do not add human table output in MVP.
- Do not add `search`, `export`, or LLM-based profile generation.
- Do not use opaque ids in list/profile output.
- Do not let `--session-path` become an arbitrary file reader.
- Do not silently consume unrelated provider failures when the provider was explicitly requested.
- Preserve no-arg desktop startup and legacy `--serve` behavior.
- Treat `serve` as a long-running server exception to one-shot JSON envelopes.
