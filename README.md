# Claude Code History Viewer

Desktop app to browse Claude Code conversation history stored in `~/.claude`.

![Version](https://img.shields.io/badge/Version-1.0.0--beta.4-orange.svg)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

**Languages**: [English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文 (简体)](README.zh-CN.md) | [中文 (繁體)](README.zh-TW.md)

> ⚠️ **Beta** - Things may break or change

## Screenshots

<p align="center">
  <img width="49%" alt="Main Interface 1" src="https://github.com/user-attachments/assets/45719832-324c-40c3-8dfe-5c70ddffc0a9" />
  <img width="49%" alt="Main Interface 2" src="https://github.com/user-attachments/assets/bb9fbc9d-9d78-4a95-a2ab-a1b1b763f515" />
</p>

<img width="720" alt="Analytics Dashboard" src="https://github.com/user-attachments/assets/77dc026c-8901-47d1-a8ca-e5235b97e945" />

<img width="720" alt="Token Statistics" src="https://github.com/user-attachments/assets/ec5b17d0-076c-435e-8cec-1c6fd74265db" />

## Features

- **Browse**: Navigate conversations by project/session
- **Search**: Search messages across all conversations
- **Analytics**: Token usage stats and API cost calculation
- **Multi-language**: English, Korean, Japanese, Chinese
- **Recent edits**: View file modification history and restore
- **Others**: Auto-update, folder selection, feedback

## Installation

Download for your platform from [Releases](https://github.com/jhlee0409/claude-code-history-viewer/releases).

## Build from source

```bash
git clone https://github.com/jhlee0409/claude-code-history-viewer.git
cd claude-code-history-viewer

# Option 1: Using just (recommended)
brew install just    # or: cargo install just
just setup
just dev             # Development
just tauri-build     # Production build

# Option 2: Using pnpm directly
pnpm install
pnpm tauri:dev       # Development
pnpm tauri:build     # Production build
```

**Requirements**: Node.js 18+, pnpm, Rust toolchain

## Usage

1. Launch the app
2. It automatically scans `~/.claude` for conversation data
3. Browse projects in the left sidebar
4. Click a session to view messages
5. Use tabs to switch between Messages, Analytics, Token Stats, and Recent Edits

## Data privacy

Runs locally only. No data sent to servers.

## Troubleshooting

**"No Claude data found"**: Make sure `~/.claude` exists with conversation history.

**Performance issues**: Large conversation histories may be slow initially. The app uses virtual scrolling to handle this.

**Update problems**: If auto-updater fails, download manually from [Releases](https://github.com/jhlee0409/claude-code-history-viewer/releases).

## Tech stack

- **Backend**: Rust + Tauri v2
- **Frontend**: React 19, TypeScript, Tailwind CSS, Zustand
- **Build**: Vite, just

## License

MIT License - see [LICENSE](LICENSE).

---

[Open an issue](https://github.com/jhlee0409/claude-code-history-viewer/issues) for questions or bug reports.
