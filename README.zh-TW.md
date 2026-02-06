# Claude Code History Viewer

瀏覽儲存在`~/.claude`中的Claude Code對話記錄的桌面應用。

🌐 [網站](https://jhlee0409.github.io/claude-code-history-viewer/) | 📦 [下載](https://github.com/jhlee0409/claude-code-history-viewer/releases)

![Version](https://img.shields.io/badge/Version-1.2.5-blue.svg)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

**Languages**: [English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文 (简体)](README.zh-CN.md) | [中文 (繁體)](README.zh-TW.md)

> 

## 截圖

<p align="center">
  <img width="49%" alt="對話記錄" src="https://github.com/user-attachments/assets/9a18304d-3f08-4563-a0e6-dd6e6dfd227e" />
  <img width="49%" alt="分析儀表板" src="https://github.com/user-attachments/assets/0f869344-4a7c-4f1f-9de3-701af10fc255" />
</p>
<p align="center">
  <img width="49%" alt="Token統計" src="https://github.com/user-attachments/assets/d30f3709-1afb-4f76-8f06-1033a3cb7f4a" />
  <img width="49%" alt="最近編輯" src="https://github.com/user-attachments/assets/8c9fbff3-55dd-4cfc-a135-ddeb719f3057" />
</p>

## 功能

- **瀏覽對話**: 按專案/工作階段瀏覽對話記錄（支援工作樹分組）
- **搜尋**: 全域跨對話訊息搜尋
- **統計**: Token使用量分析和API費用計算
- **工作階段看板**: 多工作階段視覺化分析（像素視圖、屬性刷選）
- **設定管理器**: 作用域感知的Claude Code設定編輯器（含MCP伺服器管理）
- **訊息導航器**: 右側可摺疊目錄，快速定位長對話
- **即時監控**: 工作階段檔案變更即時偵測
- **工作階段重新命名**: 原生重新命名及搜尋聯動
- **多語言**: 英語、韓語、日語、中文（簡體/繁體）
- **最近編輯**: 查看檔案修改記錄和還原
- **其他**: 自動更新、GitHub Issue聯動回饋

## 安裝

從[Releases](https://github.com/jhlee0409/claude-code-history-viewer/releases)下載適合您平台的安裝檔案。

## 從原始碼建置

```bash
git clone https://github.com/jhlee0409/claude-code-history-viewer.git
cd claude-code-history-viewer
pnpm install
pnpm tauri:build
```

**需求**: Node.js 18+、pnpm、Rust工具鏈

## 使用方法

1. 啟動應用程式
2. 自動掃描`~/.claude`資料夾中的對話資料
3. 在左側邊欄瀏覽專案
4. 點擊工作階段查看訊息
5. 使用分頁切換訊息、統計、Token分析、最近編輯、工作階段看板

## 資料隱私

僅本機執行。對話資料不會傳送到伺服器。不進行任何分析或追蹤。

## 疑難排解

**「找不到Claude資料」**: 確認`~/.claude`資料夾和對話記錄存在。

**效能問題**: 大量對話記錄可能初始載入較慢。使用虛擬捲動處理。

**更新錯誤**: 如果自動更新失敗，從[Releases](https://github.com/jhlee0409/claude-code-history-viewer/releases)手動下載。

## 技術堆疊

- **後端**: Rust + Tauri v2
- **前端**: React 19, TypeScript, Tailwind CSS, Zustand
- **建置**: Vite, just

## 授權條款

MIT License - 參見[LICENSE](LICENSE)。

---

[提交Issue](https://github.com/jhlee0409/claude-code-history-viewer/issues)提問或回報bug。
