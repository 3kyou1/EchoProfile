/**
 * WslSection Component
 *
 * Settings section for configuring WSL (Windows Subsystem for Linux) scanning.
 * Only renders on Windows Tauri app. Allows users to enable WSL scanning and
 * select which distributions to include.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Terminal } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/services/api";
import { isWindows, isTauri } from "@/utils/platform";

// ============================================================================
// Types
// ============================================================================

interface WslDistro {
  name: string;
  isDefault: boolean;
}

interface WslSectionProps {
  isExpanded: boolean;
  onToggle: (open: boolean) => void;
}

// ============================================================================
// Inner component (rendered only when WSL is available on Windows Tauri)
// ============================================================================

function WslSectionInner({ isExpanded, onToggle }: WslSectionProps) {
  const { t } = useTranslation();
  const { userMetadata, setWslEnabled, toggleWslDistro } = useAppStore();

  const wslSettings = userMetadata?.settings?.wsl ?? {
    enabled: false,
    excludedDistros: [],
  };

  const [distros, setDistros] = useState<WslDistro[]>([]);
  const [isLoadingDistros, setIsLoadingDistros] = useState(false);

  useEffect(() => {
    if (!wslSettings.enabled) return;

    let cancelled = false;

    const loadDistros = async () => {
      setIsLoadingDistros(true);
      try {
        const list = await api<WslDistro[]>("list_wsl_distros");
        if (!cancelled) {
          setDistros(list);
        }
      } catch {
        if (!cancelled) {
          setDistros([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDistros(false);
        }
      }
    };

    loadDistros();
    return () => {
      cancelled = true;
    };
  }, [wslSettings.enabled]);

  const handleToggleEnabled = async () => {
    try {
      await setWslEnabled(!wslSettings.enabled);
    } catch (err) {
      console.error("Failed to toggle WSL enabled:", err);
    }
  };

  const handleToggleDistro = async (distroName: string) => {
    try {
      await toggleWslDistro(distroName);
    } catch (err) {
      console.error("Failed to toggle WSL distro:", err);
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors">
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{t("settings.wsl.title")}</span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3 px-3 pb-3">
          <p className="text-xs text-muted-foreground">
            {t("settings.wsl.description")}
          </p>

          {/* Enable toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={wslSettings.enabled}
              onChange={handleToggleEnabled}
              aria-label={t("settings.wsl.enable")}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm">{t("settings.wsl.enable")}</span>
          </label>

          {/* Distros list (only shown when enabled) */}
          {wslSettings.enabled && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("settings.wsl.distros")}
              </p>

              {isLoadingDistros ? (
                <p className="text-xs text-muted-foreground italic">
                  {t("settings.wsl.scanning")}
                </p>
              ) : distros.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {t("settings.wsl.noDistros")}
                </p>
              ) : (
                <>
                  {distros.map((distro) => {
                    const isExcluded = wslSettings.excludedDistros.includes(
                      distro.name
                    );
                    return (
                      <label
                        key={distro.name}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => handleToggleDistro(distro.name)}
                          aria-label={distro.name}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="text-sm font-mono">{distro.name}</span>
                        {distro.isDefault && (
                          <span className="text-xs rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                            default
                          </span>
                        )}
                      </label>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">
                    {t("settings.wsl.slowWarning")}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Gate component — checks availability before rendering inner component
// ============================================================================

export function WslSection(props: WslSectionProps) {
  const [wslAvailable, setWslAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    // Only run availability check on Windows Tauri
    if (!isTauri() || !isWindows()) {
      setWslAvailable(false);
      return;
    }

    let cancelled = false;

    const checkAvailability = async () => {
      try {
        const available = await api<boolean>("is_wsl_available");
        if (!cancelled) {
          setWslAvailable(available);
        }
      } catch {
        if (!cancelled) {
          setWslAvailable(false);
        }
      }
    };

    checkAvailability();
    return () => {
      cancelled = true;
    };
  }, []);

  // Not on Windows Tauri, or WSL not available, or still loading
  if (!wslAvailable) {
    return null;
  }

  return <WslSectionInner {...props} />;
}
