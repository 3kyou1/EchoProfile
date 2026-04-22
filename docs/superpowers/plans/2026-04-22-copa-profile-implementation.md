# CoPA / Profile Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated CoPA / Profile page that generates six-factor CoPA snapshots from user-only history across session, project, and global scopes.

**Architecture:** Implement the feature in the frontend by reusing existing provider-aware project/session/message loading APIs, then running OpenAI-compatible generation and local snapshot persistence through the current storage layer. The app gains a new top-level analytics view, a dedicated Zustand slice, and a focused CoPA page/component set.

**Tech Stack:** React 19, Zustand, Vite, Vitest, i18next, existing `storageAdapter`, OpenAI-compatible HTTP API via browser `fetch`

---

## Chunk 1: Data model and generation helpers

### Task 1: Add failing tests for CoPA normalization and prompt helpers

**Files:**
- Create: `src/test/copaProfileService.test.ts`
- Create: `src/types/copaProfile.ts`
- Create: `src/services/copaProfileService.ts`

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run `pnpm vitest src/test/copaProfileService.test.ts` and verify failure**
- [ ] **Step 3: Implement minimal CoPA types and helper functions**
- [ ] **Step 4: Re-run the same test and verify pass**

### Task 2: Add snapshot persistence tests

**Files:**
- Modify: `src/test/copaProfileService.test.ts`
- Modify: `src/services/copaProfileService.ts`

- [ ] **Step 1: Add failing tests for append-only snapshot save/load behavior**
- [ ] **Step 2: Run `pnpm vitest src/test/copaProfileService.test.ts` and verify failure**
- [ ] **Step 3: Implement storage-backed snapshot persistence**
- [ ] **Step 4: Re-run the same test and verify pass**

## Chunk 2: Store and view integration

### Task 3: Add the new analytics view and CoPA slice

**Files:**
- Modify: `src/types/analytics.ts`
- Modify: `src/hooks/analytics/useAnalyticsNavigation.ts`
- Modify: `src/hooks/analytics/useAnalyticsComputed.ts`
- Modify: `src/store/slices/types.ts`
- Create: `src/store/slices/copaProfileSlice.ts`
- Modify: `src/store/useAppStore.ts`

- [ ] **Step 1: Add failing tests for view state / slice behavior if practical, otherwise helper-level tests first**
- [ ] **Step 2: Implement new `copaProfile` analytics view and store slice wiring**
- [ ] **Step 3: Verify existing analytics navigation still compiles and CoPA slice state is reachable**

### Task 4: Wire CoPA view into app shell navigation

**Files:**
- Modify: `src/layouts/Header/Header.tsx`
- Modify: `src/layouts/AppLayout.tsx`
- Modify: `src/components/mobile/BottomTabBar.tsx`

- [ ] **Step 1: Add the new nav entry and view switch handlers**
- [ ] **Step 2: Render the CoPA page in the main content switch**
- [ ] **Step 3: Verify existing views still render correctly**

## Chunk 3: CoPA page UI

### Task 5: Build the page and controls

**Files:**
- Create: `src/components/CopaProfile/CopaProfilePage.tsx`
- Create: `src/components/CopaProfile/CopaFactorCard.tsx`
- Create: `src/components/CopaProfile/index.ts`

- [ ] **Step 1: Write failing UI/helper tests for key empty-state or rendering behavior if practical**
- [ ] **Step 2: Implement scope selector, config form, source summary, factor cards, and history list**
- [ ] **Step 3: Verify local rendering and state transitions**

### Task 6: Add export behavior

**Files:**
- Modify: `src/components/CopaProfile/CopaProfilePage.tsx`
- Modify: `src/services/copaProfileService.ts`
- Reuse: `src/utils/fileDialog.ts`

- [ ] **Step 1: Add failing tests for markdown/json export serialization helpers**
- [ ] **Step 2: Implement export actions**
- [ ] **Step 3: Re-run CoPA service tests and verify pass**

## Chunk 4: Localization and verification

### Task 7: Add translation keys and polish

**Files:**
- Modify: `src/i18n/locales/en/common.json`
- Modify: `src/i18n/locales/zh-CN/common.json`
- Modify: `src/i18n/locales/ko/common.json`
- Modify: `src/i18n/locales/ja/common.json`
- Modify: `src/i18n/locales/zh-TW/common.json`

- [ ] **Step 1: Add CoPA page labels and messages**
- [ ] **Step 2: Verify translation lookups resolve**

### Task 8: Run verification

**Files:**
- Modify as needed from prior tasks

- [ ] **Step 1: Run `pnpm vitest src/test/copaProfileService.test.ts`**
- [ ] **Step 2: Run `pnpm test -- --runInBand` or the closest supported targeted suite if full tests are too heavy**
- [ ] **Step 3: Run `pnpm build`**
- [ ] **Step 4: Fix regressions until green**

Plan complete and saved to `docs/superpowers/plans/2026-04-22-copa-profile-implementation.md`. Ready to execute.
