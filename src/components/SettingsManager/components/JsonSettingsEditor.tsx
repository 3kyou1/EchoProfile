import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SettingsScope } from "@/types";

interface JsonSettingsEditorProps {
  initialContent: string;
  scope: SettingsScope;
  projectPath?: string;
  onSave?: (content: string) => void;
  readOnly?: boolean;
}

export const JsonSettingsEditor: React.FC<JsonSettingsEditorProps> = ({
  initialContent,
  scope,
  projectPath,
  onSave,
  readOnly = false,
}) => {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setContent(initialContent);
    setIsDirty(false);
    setError(null);
  }, [initialContent]);

  const validateJson = useCallback((json: string): boolean => {
    if (!json.trim()) {
      setError(null);
      return true;
    }
    try {
      JSON.parse(json);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
      return false;
    }
  }, []);

  const handleChange = (value: string) => {
    setContent(value);
    setIsDirty(value !== initialContent);
    validateJson(value);
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      setContent(formatted);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const handleSave = async () => {
    if (!validateJson(content)) return;

    setIsSaving(true);
    try {
      await invoke("save_settings", {
        scope,
        content,
        projectPath,
      });
      setIsDirty(false);
      onSave?.(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        className="font-mono text-sm min-h-[400px] resize-y"
        placeholder="{}"
        readOnly={readOnly}
        spellCheck={false}
      />

      {!readOnly && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleFormat} disabled={!!error}>
            {t("settingsManager.json.format")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!!error || !isDirty || isSaving}
          >
            {isSaving ? t("common.loading") : t("common.save")}
          </Button>
          {isDirty && (
            <span className="text-sm text-muted-foreground self-center">
              {t("settingsManager.json.unsavedChanges")}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
