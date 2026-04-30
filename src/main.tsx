import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OverlayScrollbars } from "overlayscrollbars";
import "overlayscrollbars/overlayscrollbars.css";
import "./fonts.css";
import "./index.css";
import "./scrollbar.css";
import BootApp from "./BootApp.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./i18n";
import { PlatformProvider } from "./contexts/platform";
import { ThemeProvider } from "./contexts/theme/ThemeProvider.tsx";
import { ModalProvider } from "./contexts/modal/ModalProvider.tsx";
import { Toaster } from "sonner";
import { initAuthToken, recoverAuthFromErrorQuery } from "./utils/platform";

// Initialise WebUI auth token from URL before anything else.
// (No-op in Tauri desktop mode.)
initAuthToken();
// If startup hit `?auth_error=1`, prompt for token and reload once recovered.
recoverAuthFromErrorQuery();

// Apply OverlayScrollbars globally to body. This is non-critical; never let it
// prevent the first loading shell from painting.
try {
  OverlayScrollbars(document.body, {
    scrollbars: {
      theme: "os-theme-custom",
      autoHide: "leave",
      autoHideDelay: 400,
    },
  });
} catch {
  // Ignore startup-only scrollbar failures.
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <PlatformProvider>
        <ThemeProvider>
          <ModalProvider>
            <BootApp />
            <Toaster />
          </ModalProvider>
        </ThemeProvider>
      </PlatformProvider>
    </ErrorBoundary>
  </StrictMode>
);
