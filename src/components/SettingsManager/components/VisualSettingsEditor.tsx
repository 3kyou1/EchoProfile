import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ClaudeCodeSettings,
  SettingsScope,
  ClaudeModel,
} from "@/types/claudeSettings";

interface VisualSettingsEditorProps {
  settings: ClaudeCodeSettings;
  scope: SettingsScope;
  projectPath?: string;
  onSave?: (settings: ClaudeCodeSettings) => void;
}

export const VisualSettingsEditor: React.FC<VisualSettingsEditorProps> = ({
  settings,
  scope,
  projectPath,
  onSave,
}) => {
  const { t } = useTranslation();
  const [model, setModel] = useState<ClaudeModel | undefined>(settings.model);
  const [apiKeyAcknowledged, setApiKeyAcknowledged] = useState(
    settings.customApiKeyResponsibleUseAcknowledged ?? false
  );
  const [allowList, setAllowList] = useState<string[]>(
    settings.permissions?.allow ?? []
  );
  const [denyList, setDenyList] = useState<string[]>(
    settings.permissions?.deny ?? []
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const newSettings: ClaudeCodeSettings = {
      ...settings,
      model,
      customApiKeyResponsibleUseAcknowledged: apiKeyAcknowledged,
      permissions: {
        allow: allowList,
        deny: denyList,
        ask: settings.permissions?.ask ?? [],
      },
    };

    try {
      await invoke("save_settings", {
        scope,
        content: JSON.stringify(newSettings, null, 2),
        projectPath,
      });
      onSave?.(newSettings);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settingsManager.visual.model")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={model}
            onValueChange={(v) => setModel(v as ClaudeModel)}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t("settingsManager.visual.selectModel")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opus">Opus (Maximum capability)</SelectItem>
              <SelectItem value="sonnet">Sonnet (Balanced)</SelectItem>
              <SelectItem value="haiku">Haiku (Fast)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* API Key Acknowledgment */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settingsManager.visual.apiKey")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Switch
              checked={apiKeyAcknowledged}
              onCheckedChange={setApiKeyAcknowledged}
            />
            <Label>{t("settingsManager.visual.apiKeyAcknowledge")}</Label>
          </div>
        </CardContent>
      </Card>

      {/* Permissions Editor */}
      <PermissionListEditor
        title={t("settingsManager.visual.allowList")}
        items={allowList}
        onItemsChange={setAllowList}
        placeholder="e.g., Bash(rg:*), Read(/path/**)"
      />

      <PermissionListEditor
        title={t("settingsManager.visual.denyList")}
        items={denyList}
        onItemsChange={setDenyList}
        placeholder="e.g., Write(/sensitive/**)"
      />

      {/* Save Button */}
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? t("common.loading") : t("common.save")}
      </Button>
    </div>
  );
};

// Helper component for permission lists
interface PermissionListEditorProps {
  title: string;
  items: string[];
  onItemsChange: (items: string[]) => void;
  placeholder?: string;
}

const PermissionListEditor: React.FC<PermissionListEditorProps> = ({
  title,
  items,
  onItemsChange,
  placeholder,
}) => {
  const [newItem, setNewItem] = useState("");
  const { t } = useTranslation();

  const addItem = () => {
    if (newItem.trim()) {
      onItemsChange([...items, newItem.trim()]);
      setNewItem("");
    }
  };

  const removeItem = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-2 py-1 rounded text-sm">
              {item}
            </code>
            <Button variant="ghost" size="sm" onClick={() => removeItem(index)}>
              ✕
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <Button onClick={addItem}>
            {t("settingsManager.visual.addPermission")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
