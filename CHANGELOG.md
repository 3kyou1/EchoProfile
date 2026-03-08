# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-03-08

### Added
- **WebUI Server Mode**: Run as a standalone web server with `--serve` flag for remote/headless access
  - Bearer token authentication for secure access
  - SSE real-time file watcher for live session updates
  - Single-binary deployment with embedded frontend via rust-embed
  - Docker and docker-compose support
  - Homebrew formula (`cchv-server`) with auto-update CI
  - Comprehensive server guides (EN + KO)
- **Screenshot Capture**: Long screenshot with range selection, preview modal, and explorer-style multi-selection
- **Archive Management**: Create, browse, rename, delete, and export session archives
  - Name-based archive IDs (e.g., `My-Project_3f8a1b2c`) replacing UUID-only format
  - Per-session and per-subagent inline export buttons
  - Automatic legacy UUID directory migration
- **Accessibility**: Keyboard navigation, screen reader support, and readability improvements across the app
- **Mobile UI**: Comprehensive 390px viewport support with bottom tab bar and responsive layouts
- **External Links**: All links now open in the system default browser instead of WebView (#165)
- **Platform Detection**: `PlatformCapabilities` context for centralized Tauri/WebUI runtime detection

### Changed
- Split `App.tsx` into modular architecture (`AppLayout`, `useAppInitialization`, `useAppKeyboard`)
- Extract shared `Markdown` component with unified remark/rehype config
- Decompose `SessionItem` into sub-components (`SessionHeader`, `SessionMeta`, `SessionNameEditor`)
- Split `useAnalytics` hook into focused modules (`useAnalyticsAutoLoad`, `useAnalyticsComputed`, `useAnalyticsNavigation`)
- Split Vite bundle chunks to eliminate 1.28MB index warning
- Remove markdown export format from archive, keep JSON only

### Fixed
- Multi-byte string panic when slicing token preview in Rust backend
- Focus ring outlines removed from all UI components
- ANSI text rendering applied to all terminal output paths
- Consistent markdown rendering across all content renderers
- Updater UX improved with manual restart fallback state
- Capture font readiness wait with proper timeout
- Mobile renderer layout overflow and navigation dedup for 390px viewport
- 43 security review findings addressed for WebUI server mode
- SHA256 checksum verification added to install script

### Security
- WebUI server mode includes Bearer token authentication
- `rehypeSanitize` added to markdown rendering pipeline
- Archive ID validation hardened against path traversal

## [1.5.3] - 2026-02-22

### Added
- Deep linking from Token Stats view to detailed session conversation
- Brushing UI refinement with single-select brushing and translucent pixel view

### Changed
- Comprehensive type safety improvements with proper type guards for `ClaudeMessage` union type
- Extracted `toolIconUtils.ts` and refactored `toolSummaries.ts` for reduced complexity
- Memoized tool frequency calculations to prevent unnecessary re-renders

### Fixed
- React "Rule of Hooks" violation in `App.tsx`
- Production build failures caused by missing Aptabase environment variables
- Infinite loading when switching sessions from Board view via optimistic store updates

## [1.5.2] - 2026-02-21

### Added

- Update Notes in Modal: Auto-update modal now shows release name and release notes from updater metadata.
- One-click Issue Report from Update Failure: Failure state now opens the feedback modal with updater diagnostics prefilled for faster bug reporting.

### Changed

- Updater Stage UX: Download, install, and restart stages are separated and reflected in UI states for clearer progress feedback.

### Fixed

- Updater Error Mapping: Distinguishes install-stage and restart-stage failures to avoid misleading `Download failed` messages after successful payload download.
- Release Workflow Auth: Split GitHub token usage between main repository and tap repository access in updater release workflow.

## [1.0.0-beta.4] - 2025-12-21

### Added

- Global Aggregated Dashboard: View aggregated statistics across all projects in a single dashboard
- Accurate Session Time Calculation: Session duration now calculated precisely from message timestamps
- Accurate Pricing Information: Token usage cost calculation with accurate pricing model
- Linux Build Support: Added comprehensive Linux build support with cross-platform automation
- Unit Tests: Added Vitest unit tests for tauri.conf.json validation and importability
- Update Check Caching: Added update check result caching utility and force update check feature

### Changed

- Default Language: Changed default language from Korean to English for better international accessibility
- Search Performance: Optimized search performance for large JSONL files with improved indexing
- JSONL Loading Optimization: Analyzed and optimized batch size for better loading performance
- Build System: Enhanced build system with multi-package-manager support

### Fixed

- Complete i18n Coverage: Removed all hardcoded Korean text that was ignoring language settings
- Auto Language Detection: App automatically detects and displays in user's system language on first launch
- Security Patches: Applied critical security patches and code quality improvements

## [1.0.0-beta.3] - 2025-07-03

### Added
- Multi-language support: 5 languages (Korean, English, Japanese, Simplified/Traditional Chinese)
- Feedback system: Category-based feedback submission with GitHub integration
- Language selection menu: Real-time language switching in settings

### Changed
- File reading performance improvements with file size estimation
- Library consolidation: Unified syntax highlighting library
- README simplified: 46% reduction focused on core features

## [1.0.0-beta.2] - 2025-07-02

### Added
- Analytics Dashboard: Usage patterns, token usage, activity heatmap
- Auto-update system: Priority-based update notifications
- Thinking content display: Formatted Claude thinking process

### Changed
- Pagination: Fast initial loading with 100-message batches
- HeadlessUI replaced with Radix UI
- Lucide React icon library adopted

## [1.0.0-beta.1] - 2025-06-30

### Added
- Project/session browser: Hierarchical tree structure for Claude Code conversations
- Full-text search across all conversation history
- Syntax highlighting for all programming languages
- Token usage statistics: Per-project, per-session analysis and visualization
- Dark mode support: Dark, light, and system mode
- Virtual scrolling for large message lists
- Image rendering support
- Diff viewer for file changes
