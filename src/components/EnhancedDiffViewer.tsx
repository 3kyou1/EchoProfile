"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AdvancedTextDiff } from "./AdvancedTextDiff";
import { AlignLeft, Columns } from "lucide-react";
import ReactDiffViewer from "react-diff-viewer-continued";
import * as Prism from "prismjs";
import { useCopyButton } from "../hooks/useCopyButton";

import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-json";
import "prismjs/components/prism-css";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-bash";
import { TooltipButton } from "../shared/TooltipButton";
import { layout } from "@/components/renderers";

type Props = {
  oldText: string;
  newText: string;
  filePath?: string;
  showAdvancedDiff?: boolean;
};

// Enhanced Diff Viewer with multiple modes
export const EnhancedDiffViewer = ({
  oldText,
  newText,
  filePath = "",
  showAdvancedDiff = false,
}: Props) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<"visual" | "advanced">("advanced");
  const [splitView, setSplitView] = useState(true);
  const { renderCopyButton } = useCopyButton();

  const getLanguageFromPath = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase();
    const fileName = path.split("/").pop()?.toLowerCase() || "";

    switch (ext) {
      case "rs":
        return "rust";
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "py":
        return "python";
      case "json":
        return "json";
      case "css":
        return "css";
      case "scss":
      case "sass":
        return "scss";
      case "html":
      case "htm":
        return "html";
      case "yaml":
      case "yml":
        return "yaml";
      case "sh":
      case "zsh":
      case "bash":
        return "bash";
      default:
        if (fileName.includes("dockerfile")) return "dockerfile";
        if (fileName.includes("makefile")) return "makefile";
        return "text";
    }
  };

  const language = getLanguageFromPath(filePath);

  /**
   * @returns React Element
   */
  const highlightSyntax = (str: string | undefined | null) => {
    if (str === null || str === undefined) {
      return <span style={{ display: "inline" }}></span>;
    }

    if (typeof str !== "string") {
      console.warn(
        "highlightSyntax received non-string value:",
        typeof str,
        str
      );
      return <span style={{ display: "inline" }}>{String(str)}</span>;
    }

    if (str.length === 0) {
      return <span style={{ display: "inline" }}></span>;
    }

    if (language === "text") {
      return <span style={{ display: "inline" }}>{str}</span>;
    }

    try {
      const prismLanguage =
        language === "typescript"
          ? "typescript"
          : language === "javascript"
          ? "javascript"
          : language === "python"
          ? "python"
          : language === "rust"
          ? "rust"
          : language === "json"
          ? "json"
          : language === "css"
          ? "css"
          : language === "scss"
          ? "scss"
          : language === "bash"
          ? "bash"
          : "markup";

      const lang = Prism.languages[prismLanguage];
      if (!lang) {
        console.warn(
          `Prism language '${prismLanguage}' not found, falling back to plain text`
        );
        return <span style={{ display: "inline" }}>{str}</span>;
      }

      const trimmedStr = str.trim();
      if (trimmedStr.length === 0) {
        return <span style={{ display: "inline" }}>{str}</span>;
      }

      const highlightedHtml = Prism.highlight(str, lang, prismLanguage);
      return (
        <span
          style={{ display: "inline" }}
          dangerouslySetInnerHTML={{
            __html: highlightedHtml,
          }}
        />
      );
    } catch (error) {
      console.warn(
        "Syntax highlighting failed:",
        error,
        "for text:",
        str.substring(0, 50) + "..."
      );
      return <span style={{ display: "inline" }}>{str}</span>;
    }
  };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className={`${layout.smallText} font-medium text-muted-foreground`}>
          {t("diffViewer.changes")}
        </div>
        <div className="flex items-center space-x-2">
          {renderCopyButton(
            newText,
            `diff-new-${filePath || "content"}`,
            t("diffViewer.copyAfterCode")
          )}

          {showAdvancedDiff && (
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setViewMode("visual")}
                className={`px-2 py-1 ${layout.smallText} rounded transition-colors ${
                  viewMode === "visual"
                    ? "bg-accent text-accent-foreground font-medium"
                    : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {t("diffViewer.visualView")}
              </button>
              <button
                onClick={() => setViewMode("advanced")}
                className={`px-2 py-1 ${layout.smallText} rounded transition-colors ${
                  viewMode === "advanced"
                    ? "bg-accent text-accent-foreground font-medium"
                    : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {t("diffViewer.advancedAnalysis")}
              </button>
            </div>
          )}
          {viewMode === "visual" && (
            <TooltipButton
              onClick={() => setSplitView(!splitView)}
              className={`flex items-center space-x-1 px-2 py-1 ${layout.smallText} bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors`}
              content={
                splitView
                  ? t("diffViewer.switchToUnified")
                  : t("diffViewer.switchToSplit")
              }
            >
              {splitView ? (
                <>
                  <AlignLeft className="w-3 h-3" />
                  <span>{t("diffViewer.unified")}</span>
                </>
              ) : (
                <>
                  <Columns className="w-3 h-3" />
                  <span>{t("diffViewer.split")}</span>
                </>
              )}
            </TooltipButton>
          )}
        </div>
      </div>

      {viewMode === "visual" ? (
        <div className="border rounded-lg overflow-x-auto max-h-96">
          <ReactDiffViewer
            oldValue={oldText}
            newValue={newText}
            splitView={splitView}
            leftTitle={t("diffViewer.before")}
            rightTitle={t("diffViewer.after")}
            hideLineNumbers={false}
            renderContent={language !== "text" ? highlightSyntax : undefined}
            styles={{
              contentText: {
                fontSize: "13px",
              },
            }}
          />
        </div>
      ) : (
        <AdvancedTextDiff
          oldText={oldText}
          newText={newText}
          title={t("diffViewer.advancedTextAnalysis")}
        />
      )}
    </div>
  );
};
