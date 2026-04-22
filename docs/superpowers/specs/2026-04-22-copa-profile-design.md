# CoPA / Profile Design

**Date:** 2026-04-22

## Goal

Add a new `CoPA / Profile` page to the history viewer so users can select a history scope (`session`, `project`, or `global`), generate a CoPA profile from user-only messages, save every generation as a snapshot, and export the result as Markdown or JSON.

## Product Scope

- Keep the app as a history viewer; do not embed full DeepTutor workflows.
- Add a dedicated top-level view for CoPA generation and browsing.
- Support all providers already supported by the viewer, but only use `user` messages as CoPA signals.
- Save generation outputs as versioned snapshots instead of overwriting previous results.
- Export each snapshot as:
  - canonical JSON
  - readable Markdown

## CoPA Compatibility

Use DeepTutor's six-factor structure as the canonical model:

- `CT` - Cognitive Trust
- `SA` - Situational Anchoring
- `SC` - Schema Consistency
- `CLM` - Cognitive Load Management
- `MS` - Metacognitive Scaffolding
- `AMR` - Affective and Motivational Resonance

The viewer may present the result differently, but the payload should remain semantically aligned with DeepTutor's `user_profile_description`, `response_strategy[]`, and `prompt_summary` concepts.

## UX

### Entry Point

- Add a new top-level application view: `CoPA / Profile`
- Expose it alongside the existing main views instead of attaching it to an individual session page.

### Page Layout

1. Header
   - title
   - explanation text
   - primary action to generate a new snapshot
   - export actions for the currently displayed snapshot
2. Scope selector
   - `Session`
   - `Project`
   - `Global`
3. Range detail controls
   - session picker for session scope
   - project picker for project scope
   - provider multi-select / filter for global scope
4. Generation config
   - OpenAI-compatible endpoint settings
   - model name
   - API key
   - optional base URL
5. Source summary
   - providers included
   - projects count
   - sessions count
   - user message count
6. Result area
   - overview/factors
   - prompt summary
   - metadata
   - snapshot history

## Data Flow

1. User selects a scope.
2. Frontend resolves the scope into concrete project/session candidates.
3. Frontend loads messages through the existing provider-aware commands.
4. Only `user` messages are retained.
5. Messages are normalized, deduplicated, and truncated for prompt safety.
6. Frontend calls an OpenAI-compatible chat/completions endpoint.
7. The response is normalized into canonical CoPA JSON.
8. The snapshot is stored locally through the existing storage adapter.
9. The result is rendered and can be exported.

## Storage Model

Use a separate local store file, `copa-profiles.json`, managed through `storageAdapter`.

Each snapshot contains:

- `id`
- `createdAt`
- `scope.type`
- `scope.ref`
- `scope.label`
- `providerScope`
- `sourceStats`
- `modelConfig`
- `factors`
- `promptSummary`
- `markdown`

Snapshots are append-only.

## Technical Approach

Implement this feature primarily in the frontend to avoid introducing a new Rust-side LLM client dependency.

- Reuse existing commands for project/session/message loading.
- Add a frontend generation service for:
  - scope resolution
  - user-message extraction
  - prompt building
  - OpenAI-compatible API calls
  - snapshot normalization
- Add a new store slice for CoPA page state and snapshot management.

## First Version Constraints

- Only user messages count as signals.
- No assistant/tool/system content is used for profile inference.
- Generation is best-effort and token-limited; very large global histories must be sampled and truncated.
- Snapshots are local to the app instance.
- LLM credentials are stored locally for convenience in the CoPA page settings.

## Out of Scope

- Scientist resonance
- DeepTutor memory synchronization
- Shared cloud profile storage
- Real-time background CoPA refresh after every turn
