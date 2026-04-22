# i18n Structure Refactor Analysis

## Current State
The project uses namespace-based translation files under `src/i18n/locales/`. The goal of the refactor is to keep translation files small, focused, and easy to update independently.

## Main Problems
1. Large translation files are harder to review and maintain.
2. Unrelated UI changes can touch the same translation files.
3. Parallel translation work becomes more difficult when domains are not clearly separated.
4. Type generation and key validation need to stay aligned with the file layout.

## Refactor Strategy
- Keep translation resources split by domain-oriented namespaces.
- Preserve the existing `t('prefix.key')` usage pattern for compatibility.
- Regenerate translation types after key changes.
- Validate that every supported language exposes the same key set.

## Target Structure
- `common`: shared UI text
- `analytics`: analytics dashboard text
- `session`: session and project text
- `settings`: settings UI text
- `tools`: tool-related labels and results
- `error`: error messages
- `message`: message viewer text
- `renderers`: renderer-specific copy
- `update`: updater flow text
- `feedback`: feedback UI text
- `recentEdits`: recent edit UI text

## Expected Benefits
1. Smaller files are easier to understand and edit.
2. Related changes stay grouped in the same namespace.
3. Translation work can proceed in parallel across domains.
4. Type-safe key usage remains intact through generated types.

## Implementation Plan
### Phase 1
Create or update scripts that can split, flatten, and validate locale files.

### Phase 2
Update the i18n bootstrap code so namespace resources are merged consistently at runtime.

### Phase 3
Regenerate the TypeScript translation key definitions.

### Phase 4
Verify the build, tests, and i18n validation scripts.

## Compatibility Notes
Existing translation calls should continue to work without requiring a large migration of UI components.
