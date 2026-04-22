# CLAUDE.md

This file provides repository-specific guidance for Claude Code when working in this project.

If the user prompt starts with `EP:`, read `PROMPT_ENHANCER.md`, propose the improved prompt, and ask for approval before acting on it.

## Principles
- Prefer clear, readable designs.
- Favor predictable behavior.
- Keep cohesion high.
- Keep coupling low.
- Use `pnpm` as the package manager.

## Project Overview
EchoProfile is a Tauri-based desktop application for browsing and analyzing conversation history from Claude Code (`~/.claude`), Codex CLI (`~/.codex`), and OpenCode (`~/.local/share/opencode/`).

## Common Commands
### Recommended (`just`)
```bash
just setup
just dev
just lint
just tauri-build
just test
just test-run
just sync-version
```

### Direct `pnpm` usage
```bash
pnpm install
pnpm exec tauri dev
pnpm exec tauri build --target universal-apple-darwin
pnpm exec tauri build
pnpm dev
pnpm build
pnpm lint
```

## Branch Strategy
- `main`: release-only branch
- `develop`: integration branch for the next release
- `feature/*`, `fix/*`: task branches that target `develop`

Rules:
- Open feature and fix PRs against `develop`, not `main`.
- Merge `develop` into `main` only for releases.
- Update user-facing release docs on `main` as part of the release flow.

## Version Management
`package.json` is the single source of truth for the version. Sync it into `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` with:

```bash
just sync-version
```

## Release Process
1. Run quality checks:
   ```bash
   pnpm install
   pnpm tsc --build .
   pnpm vitest run --reporter=verbose
   pnpm lint
   cd src-tauri && cargo test -- --test-threads=1 && cd ..
   cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings && cd ..
   cd src-tauri && cargo fmt --all -- --check && cd ..
   pnpm run i18n:validate
   ```
2. Review changes since the last tag and choose the next SemVer version.
3. Merge `develop` into `main`, bump the version, sync version files, and re-run the checks.
4. Commit, tag, and push the release.
5. Confirm that the GitHub Actions release workflow publishes platform binaries and `latest.json`.

## Architecture Summary
### Frontend
- React + TypeScript
- Zustand store in `src/store/useAppStore.ts`
- Main UI areas: message viewer, project tree, content renderers, message renderers

### Backend
- Rust + Tauri
- Main commands are defined in `src-tauri/src/lib.rs`
- Reads provider-specific history files and normalizes them into the app model

## i18n Structure
- Runtime languages are English and Simplified Chinese
- Namespace-based locale files live in `src/i18n/locales/`
- Regenerate translation types after key changes:
  ```bash
  pnpm run generate:i18n-types
  ```
- Validate locale consistency with:
  ```bash
  pnpm run i18n:validate
  ```

## Code Quality Checklist
### Security
- Validate user-derived identifiers before using them in file paths
- Prefer atomic write patterns for file updates
- Block symlink traversal where directory walking touches user data

### Error Handling
- Do not rely on `console.error` alone for user-visible failures
- Validate multi-step saves before applying writes
- Guard required parameters early

### i18n
- Update both `en` and `zh-CN` when adding user-facing copy
- Avoid duplicate JSON keys
- Wrap user-facing TSX strings in `t()`

### Accessibility
- Icon-only buttons need `aria-label`
- Dialogs need `DialogTitle` or an accessible label
- Label/input pairs need matching `htmlFor` and `id`

### Cross-platform
- Handle both `/` and `\` path separators
- Be careful with rename semantics on Windows
- Keep home-directory detection cross-platform
