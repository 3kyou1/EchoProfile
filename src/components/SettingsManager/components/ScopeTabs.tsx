/**
 * ScopeTabs Component
 *
 * Tab navigation for settings scopes with visual indicators
 */

import * as React from "react";
import { useTranslation } from "react-i18next";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SCOPE_PRIORITY, type SettingsScope } from "@/types";
import { cn } from "@/lib/utils";

interface ScopeTabsProps {
  availableScopes: Record<SettingsScope, boolean>;
}

const scopes: SettingsScope[] = ["user", "project", "local", "managed"];

export const ScopeTabs: React.FC<ScopeTabsProps> = ({
  availableScopes,
}) => {
  const { t } = useTranslation();

  return (
    <TabsList className="grid w-full grid-cols-4">
      {scopes.map((scope) => {
        const hasSettings = availableScopes[scope];
        const priority = SCOPE_PRIORITY[scope];
        const isHighPriority = priority >= SCOPE_PRIORITY.local;

        return (
          <TabsTrigger
            key={scope}
            value={scope}
            className={cn(
              "relative",
              !hasSettings && "opacity-50"
            )}
          >
            {t(`settingsManager.scope.${scope}`)}
            {hasSettings && isHighPriority && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
            )}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
};
