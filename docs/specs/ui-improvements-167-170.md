# UI Improvements Plan (#167, #168, #169, #170)

## Scope
This note summarizes a batch of UI cleanup tasks covering timestamp clarity, capture-mode fidelity, and dropdown compactness.

## Issue #170 — Show the date alongside timestamps
### Problem
The message list shows time-only labels, which makes older conversations harder to review.

### Proposed Solution
- Insert date dividers whenever the day changes in the message stream.
- Show a full date-time tooltip when hovering over a timestamp.

### Files to Update
- Message list rendering in `src/components/MessageViewer/`
- Timestamp rendering components
- i18n date formatting keys in `en` and `zh-CN`

### Notes
- Virtualized lists need stable height handling for date divider rows.
- Date formatting must remain language-aware.

## Issue #169 — Keep capture mode aligned with the active theme and expansion state
### Problem
Capture output can drift from what the user actually sees.

### Proposed Solution
- Remove hard-coded theme styling from the off-screen capture renderer.
- Pass the active theme and visible collapse state into the capture renderer.
- Make capture output follow a WYSIWYG rule by default.

### Files to Update
- `OffScreenCaptureRenderer.tsx`
- capture expand-state context/provider
- screenshot capture hook configuration

### Notes
- CSS variable inheritance must be verified in the off-screen DOM container.
- Capture regression tests should cover both dark and light themes.

## Issue #168 — Compact the settings dropdown
### Problem
The dropdown becomes too tall and pushes important actions below the viewport.

### Proposed Solution
- Replace long radio groups with compact controls such as icon toggles and selects.
- Keep a scrollable fallback on the dropdown container as a safety net.

### Candidate Changes
- Theme: icon toggle group
- Font size: select
- Language: select
- Dropdown container: max-height plus vertical scrolling

## Issue #167 — Narrow-window panel overlap
This issue was already completed and is kept here only as historical context for the UI cleanup batch.
