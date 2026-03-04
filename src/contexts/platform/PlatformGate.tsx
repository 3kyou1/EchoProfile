import type { ReactNode } from "react";
import { usePlatform } from "./context";

export function DesktopOnly({ children }: { children: ReactNode }) {
  const { isDesktop } = usePlatform();
  return isDesktop ? <>{children}</> : null;
}

export function MobileOnly({ children }: { children: ReactNode }) {
  const { isMobile } = usePlatform();
  return isMobile ? <>{children}</> : null;
}
