# Issue #77: Codex / OpenCode Support

## Worktree
- Repository: `EchoProfile`
- Focus: add multi-provider support beyond Claude Code history

## Issue
Users want the app to ingest and browse conversation history from Codex CLI and OpenCode in addition to Claude Code.

## Research Summary
### OpenAI Codex CLI
- Storage format: JSONL, close to the Claude Code history format
- Implementation complexity: medium
- Suggested approach: reuse the existing JSONL pipeline and add a provider-specific adapter layer

### OpenCode
- Storage format: multiple JSON files and a more distributed layout
- Implementation complexity: high
- Suggested approach: isolate filesystem scanning and parsing in a dedicated provider module

## Implementation Notes
- Start with Codex CLI first because the format is closer to the current backend model
- Split backend parsers by provider, for example `claude/`, `codex/`, and `opencode/`
- Convert each provider into a shared message model through adapter-style transforms
- Distinguish providers in the project tree with provider-specific labels and icons
