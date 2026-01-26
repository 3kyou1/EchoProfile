import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClaudeCodeSettings, SettingsScope, AllSettingsResponse } from "@/types";

interface ExportImportProps {
  allSettings: AllSettingsResponse | null;
  projectPath?: string;
  onImport?: () => void;
}

export const ExportImport: React.FC<ExportImportProps> = ({
  allSettings,
  projectPath,
  onImport,
}) => {
  const { t } = useTranslation();
  const [exportScope, setExportScope] = useState<SettingsScope>("user");
  const [excludeSensitive, setExcludeSensitive] = useState(true);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [importedSettings, setImportedSettings] = useState<ClaudeCodeSettings | null>(null);
  const [importScope, setImportScope] = useState<SettingsScope>("user");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Get settings for selected export scope
  const getExportSettings = (): ClaudeCodeSettings => {
    if (!allSettings) return {};
    const content = allSettings[exportScope];
    if (!content) return {};
    try {
      return JSON.parse(content) as ClaudeCodeSettings;
    } catch {
      return {};
    }
  };

  // Remove sensitive data from settings
  const sanitizeSettings = (settings: ClaudeCodeSettings): ClaudeCodeSettings => {
    const sanitized = { ...settings };

    // Remove API keys from MCP servers
    if (sanitized.mcpServers) {
      sanitized.mcpServers = Object.fromEntries(
        Object.entries(sanitized.mcpServers).map(([name, config]) => {
          if (config.env) {
            const sanitizedEnv = Object.fromEntries(
              Object.entries(config.env).map(([key, value]) => {
                // Mask values that look like API keys
                if (key.toLowerCase().includes("key") ||
                    key.toLowerCase().includes("token") ||
                    key.toLowerCase().includes("secret")) {
                  return [key, "YOUR_" + key.toUpperCase() + "_HERE"];
                }
                return [key, value];
              })
            );
            return [name, { ...config, env: sanitizedEnv }];
          }
          return [name, config];
        })
      );
    }

    return sanitized;
  };

  // Check if export scope has settings
  const hasExportSettings = allSettings?.[exportScope] !== null;

  const handleExport = async () => {
    if (!hasExportSettings) return;

    setIsExporting(true);
    try {
      const currentSettings = getExportSettings();
      const settingsToExport = excludeSensitive
        ? sanitizeSettings(currentSettings)
        : currentSettings;

      const filePath = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: `claude-settings-${exportScope}.json`,
      });

      if (filePath) {
        await invoke("write_text_file", {
          path: filePath,
          content: JSON.stringify(settingsToExport, null, 2),
        });
      }
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const filePath = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });

      if (filePath && typeof filePath === "string") {
        const content = await invoke<string>("read_text_file", {
          path: filePath,
        });
        const parsed = JSON.parse(content) as ClaudeCodeSettings;
        setImportedSettings(parsed);
        setIsImportPreviewOpen(true);
      }
    } catch (error) {
      console.error("Import failed:", error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleApplyImport = async () => {
    if (!importedSettings) return;

    try {
      await invoke("save_settings", {
        scope: importScope,
        content: JSON.stringify(importedSettings, null, 2),
        projectPath: importScope !== "user" ? projectPath : undefined,
      });

      onImport?.();
      setIsImportPreviewOpen(false);
      setImportedSettings(null);
    } catch (error) {
      console.error("Apply import failed:", error);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("settingsManager.exportImport.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export Section */}
          <div className="space-y-3">
            <div>
              <Label>{t("settingsManager.exportImport.export")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settingsManager.exportImport.exportDescription")}
              </p>
            </div>

            {/* Export Scope Selection */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label className="text-sm">{t("settingsManager.exportImport.exportScope")}</Label>
                <Select value={exportScope} onValueChange={(v) => setExportScope(v as SettingsScope)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user" disabled={allSettings?.user === null}>
                      {t("settingsManager.scope.user")} {allSettings?.user === null && "(empty)"}
                    </SelectItem>
                    <SelectItem value="project" disabled={allSettings?.project === null}>
                      {t("settingsManager.scope.project")} {allSettings?.project === null && "(empty)"}
                    </SelectItem>
                    <SelectItem value="local" disabled={allSettings?.local === null}>
                      {t("settingsManager.scope.local")} {allSettings?.local === null && "(empty)"}
                    </SelectItem>
                    <SelectItem value="managed" disabled={allSettings?.managed === null}>
                      {t("settingsManager.scope.managed")} {allSettings?.managed === null && "(empty)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleExport}
                disabled={isExporting || !hasExportSettings}
                className="mt-6"
              >
                {isExporting ? t("common.loading") : t("settingsManager.exportImport.exportButton")}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={excludeSensitive}
                onCheckedChange={setExcludeSensitive}
              />
              <Label className="text-sm">
                {t("settingsManager.exportImport.excludeSensitive")}
              </Label>
            </div>
          </div>

          <div className="border-t pt-4" />

          {/* Import Section */}
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("settingsManager.exportImport.import")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settingsManager.exportImport.importDescription")}
              </p>
            </div>
            <Button variant="outline" onClick={handleImport} disabled={isImporting}>
              {isImporting ? t("common.loading") : t("settingsManager.exportImport.importButton")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Import Preview Dialog */}
      <Dialog open={isImportPreviewOpen} onOpenChange={setIsImportPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("settingsManager.exportImport.previewTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden">
            <div>
              <Label>{t("settingsManager.exportImport.targetScope")}</Label>
              <Select value={importScope} onValueChange={(v) => setImportScope(v as SettingsScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("settingsManager.scope.user")}</SelectItem>
                  <SelectItem value="project">{t("settingsManager.scope.project")}</SelectItem>
                  <SelectItem value="local">{t("settingsManager.scope.local")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 overflow-auto">
              <Label>{t("settingsManager.exportImport.preview")}</Label>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-[300px] font-mono">
                {importedSettings ? JSON.stringify(importedSettings, null, 2) : ""}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportPreviewOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleApplyImport}>
              {t("settingsManager.exportImport.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
