import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { MCPServerConfig } from "@/types";

interface MCPServerManagerProps {
  servers: Record<string, MCPServerConfig>;
  onUpdate: (servers: Record<string, MCPServerConfig>) => void;
  readOnly?: boolean;
}

export const MCPServerManager: React.FC<MCPServerManagerProps> = ({
  servers,
  onUpdate,
  readOnly = false,
}) => {
  const { t } = useTranslation();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // New server form state
  const [newServerName, setNewServerName] = useState("");
  const [newServerCommand, setNewServerCommand] = useState("npx");
  const [newServerArgs, setNewServerArgs] = useState("");
  const [newServerEnv, setNewServerEnv] = useState<Array<{ key: string; value: string }>>([]);

  const serverEntries = Object.entries(servers);

  const maskValue = (value: string): string => {
    if (value.length <= 8) return "••••••••";
    return value.slice(0, 4) + "••••" + value.slice(-4);
  };

  const handleAddServer = () => {
    if (!newServerName.trim() || !newServerCommand.trim()) return;

    const newServer: MCPServerConfig = {
      command: newServerCommand.trim(),
      args: newServerArgs.trim() ? newServerArgs.split(/\s+/) : undefined,
      env:
        newServerEnv.length > 0
          ? Object.fromEntries(newServerEnv.filter((e) => e.key).map((e) => [e.key, e.value]))
          : undefined,
    };

    onUpdate({
      ...servers,
      [newServerName.trim()]: newServer,
    });

    // Reset form
    setNewServerName("");
    setNewServerCommand("npx");
    setNewServerArgs("");
    setNewServerEnv([]);
    setIsAddOpen(false);
  };

  const handleRemoveServer = (name: string) => {
    const { [name]: _, ...rest } = servers;
    onUpdate(rest);
    setDeleteConfirmId(null);
  };

  const addEnvVar = () => {
    setNewServerEnv([...newServerEnv, { key: "", value: "" }]);
  };

  const updateEnvVar = (index: number, field: "key" | "value", value: string) => {
    const updated = [...newServerEnv];
    const item = updated[index];
    if (item) {
      item[field] = value;
      setNewServerEnv(updated);
    }
  };

  const removeEnvVar = (index: number) => {
    setNewServerEnv(newServerEnv.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{t("settingsManager.mcp.title")}</h3>
        {!readOnly && (
          <Button onClick={() => setIsAddOpen(true)}>{t("settingsManager.mcp.add")}</Button>
        )}
      </div>

      {/* Server List */}
      {serverEntries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("settingsManager.mcp.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {serverEntries.map(([name, config]) => (
            <Card key={name}>
              <Collapsible
                open={expandedServer === name}
                onOpenChange={(open) => setExpandedServer(open ? name : null)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{name}</CardTitle>
                        <Badge variant="outline">{config.command}</Badge>
                        {config.type && <Badge>{config.type}</Badge>}
                      </div>
                      <div className="flex gap-2">
                        {!readOnly &&
                          (deleteConfirmId === name ? (
                            <>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveServer(name);
                                }}
                              >
                                {t("common.delete")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(null);
                                }}
                              >
                                {t("common.cancel")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(name);
                              }}
                            >
                              {t("common.delete")}
                            </Button>
                          ))}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Command</Label>
                      <code className="block bg-muted px-2 py-1 rounded text-sm">
                        {config.command} {config.args?.join(" ")}
                      </code>
                    </div>
                    {config.description && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <p className="text-sm">{config.description}</p>
                      </div>
                    )}
                    {config.env && Object.keys(config.env).length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Environment</Label>
                        <div className="space-y-1">
                          {Object.entries(config.env).map(([key, value]) => (
                            <div key={key} className="flex gap-2 text-sm">
                              <code className="bg-muted px-1 rounded">{key}</code>
                              <span>=</span>
                              <code className="bg-muted px-1 rounded">{maskValue(value)}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {config.url && (
                      <div>
                        <Label className="text-xs text-muted-foreground">URL</Label>
                        <code className="block bg-muted px-2 py-1 rounded text-sm">
                          {config.url}
                        </code>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      {/* Add Server Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("settingsManager.mcp.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("settingsManager.mcp.serverName")}</Label>
              <Input
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                placeholder="my-mcp-server"
              />
            </div>
            <div>
              <Label>{t("settingsManager.mcp.command")}</Label>
              <Input
                value={newServerCommand}
                onChange={(e) => setNewServerCommand(e.target.value)}
                placeholder="npx"
              />
            </div>
            <div>
              <Label>{t("settingsManager.mcp.args")}</Label>
              <Input
                value={newServerArgs}
                onChange={(e) => setNewServerArgs(e.target.value)}
                placeholder="-y @modelcontextprotocol/server-name"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>{t("settingsManager.mcp.envVars")}</Label>
                <Button variant="outline" size="sm" onClick={addEnvVar}>
                  + Add
                </Button>
              </div>
              {newServerEnv.map((env, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <Input
                    placeholder="KEY"
                    value={env.key}
                    onChange={(e) => updateEnvVar(index, "key", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="value"
                    value={env.value}
                    onChange={(e) => updateEnvVar(index, "value", e.target.value)}
                    type="password"
                    className="flex-1"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeEnvVar(index)}>
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleAddServer} disabled={!newServerName.trim()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
