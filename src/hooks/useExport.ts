/**
 * useExport Hook
 *
 * Triggers conversation export in the selected format.
 * Handles file save dialog and toast notifications.
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ExportFormat } from "@/types/export";
import type { ClaudeMessage } from "@/types";

export function useExport(messages: ClaudeMessage[], sessionName: string) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const exportConversation = useCallback(
    async (format: ExportFormat) => {
      if (messages.length === 0) return;
      setIsExporting(true);

      try {
        let content: string;
        let defaultPath: string;
        let mimeType: string;

        switch (format) {
          case "markdown": {
            const { exportToMarkdown } = await import("@/services/export/markdownExporter");
            content = exportToMarkdown(messages, sessionName);
            defaultPath = `${sessionName}.md`;
            mimeType = "text/markdown";
            break;
          }
          case "json": {
            const { exportToJson } = await import("@/services/export/jsonExporter");
            content = exportToJson(messages, sessionName);
            defaultPath = `${sessionName}.json`;
            mimeType = "application/json";
            break;
          }
          case "html": {
            const { exportToHtml } = await import("@/services/export/htmlExporter");
            content = exportToHtml(messages, sessionName);
            defaultPath = `${sessionName}.html`;
            mimeType = "text/html";
            break;
          }
        }

        const { saveFileDialog } = await import("@/utils/fileDialog");
        const saved = await saveFileDialog(content, {
          defaultPath,
          mimeType,
          filters: [{ name: format.toUpperCase(), extensions: [defaultPath.split(".").pop() ?? format] }],
        });

        if (saved) {
          toast.success(t("session.export.success"));
        }
      } catch (error) {
        console.error("[useExport] export failed:", error);
        toast.error(t("session.export.error"));
      } finally {
        setIsExporting(false);
      }
    },
    [messages, sessionName, t],
  );

  return { isExporting, exportConversation };
}
