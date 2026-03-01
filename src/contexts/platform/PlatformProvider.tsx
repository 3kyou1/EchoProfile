import { useMemo, type ReactNode } from "react";
import { isTauri } from "@/utils/platform";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PlatformContext, type PlatformContextValue, type PlatformType } from "./context";

export function PlatformProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();

  const platformBase = useMemo(() => {
    const desktop = isTauri();
    return {
      platform: (desktop ? "desktop" : "web") as PlatformType,
      isDesktop: desktop,
      isWeb: !desktop,
    };
  }, []);

  const value = useMemo<PlatformContextValue>(
    () => ({ ...platformBase, isMobile }),
    [platformBase, isMobile]
  );

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}
