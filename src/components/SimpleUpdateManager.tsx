import { useState, useEffect, useRef, useCallback } from "react";
import type { UseUpdaterReturn } from "../hooks/useUpdater";
import { SimpleUpdateModal } from "./SimpleUpdateModal";
import { UpToDateNotification } from "./UpToDateNotification";
import { UpdateCheckingNotification } from "./UpdateCheckingNotification";
import { UpdateErrorNotification } from "./UpdateErrorNotification";
import { useAppStore } from "@/store/useAppStore";

const AUTO_CHECK_DELAY_MS = 5_000; // 5 seconds after app start
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

interface SimpleUpdateManagerProps {
  updater: UseUpdaterReturn;
}

export function SimpleUpdateManager({ updater }: SimpleUpdateManagerProps) {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const loadUpdateSettings = useAppStore((state) => state.loadUpdateSettings);
  const setUpdateSetting = useAppStore((state) => state.setUpdateSetting);
  const postponeUpdate = useAppStore((state) => state.postponeUpdate);
  const skipVersion = useAppStore((state) => state.skipVersion);

  const [showUpToDate, setShowUpToDate] = useState(false);
  const [showChecking, setShowChecking] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isManualCheck, setIsManualCheck] = useState(false);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [lastCheckWasManual, setLastCheckWasManual] = useState(false);
  const hasAutoCheckedRef = useRef(false);

  const shouldRunAutoCheck = useCallback(() => {
    if (!updateSettings.autoCheck) return false;
    if (updateSettings.checkInterval === "never") return false;
    if (updateSettings.respectOfflineStatus && !navigator.onLine) return false;

    const now = Date.now();

    if (
      updateSettings.lastPostponedAt &&
      now - updateSettings.lastPostponedAt < updateSettings.postponeInterval
    ) {
      return false;
    }

    if (updateSettings.checkInterval === "daily" && updateSettings.lastCheckedAt) {
      return now - updateSettings.lastCheckedAt >= DAY_MS;
    }

    if (updateSettings.checkInterval === "weekly" && updateSettings.lastCheckedAt) {
      return now - updateSettings.lastCheckedAt >= WEEK_MS;
    }

    return true;
  }, [updateSettings]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      await loadUpdateSettings();
      if (mounted) setIsSettingsLoaded(true);
    })();

    return () => {
      mounted = false;
    };
  }, [loadUpdateSettings]);

  // Auto check on app start (production only)
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!isSettingsLoaded) return;
    if (hasAutoCheckedRef.current) return;

    hasAutoCheckedRef.current = true;

    if (!shouldRunAutoCheck()) return;

    setLastCheckWasManual(false);

    const timer = setTimeout(() => {
      void updater
        .checkForUpdates()
        .finally(() => setUpdateSetting("lastCheckedAt", Date.now()));
    }, AUTO_CHECK_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isSettingsLoaded, shouldRunAutoCheck, updater, setUpdateSetting]);

  // Show checking notification during manual check
  useEffect(() => {
    if (updater.state.isChecking && isManualCheck) {
      setShowChecking(true);
    } else {
      setShowChecking(false);
    }
  }, [updater.state.isChecking, isManualCheck]);

  // Handle manual check results
  useEffect(() => {
    if (!updater.state.isChecking && isManualCheck) {
      if (updater.state.error) {
        setErrorMessage(updater.state.error);
        setShowError(true);
      } else if (!updater.state.hasUpdate) {
        setShowUpToDate(true);
        setTimeout(() => setShowUpToDate(false), 3000);
      }
      setIsManualCheck(false);
    }
  }, [
    updater.state.isChecking,
    updater.state.hasUpdate,
    updater.state.error,
    isManualCheck,
  ]);

  // Suppress auto-check update modal for postponed/skipped versions
  useEffect(() => {
    if (updater.state.isChecking) return;
    if (!updater.state.hasUpdate) return;
    if (lastCheckWasManual) return;

    const version = updater.state.newVersion;
    if (!version) return;

    const now = Date.now();
    const isPostponed =
      !!updateSettings.lastPostponedAt &&
      now - updateSettings.lastPostponedAt < updateSettings.postponeInterval;
    const isSkipped = updateSettings.skippedVersions.includes(version);

    if (isPostponed || isSkipped) {
      updater.dismissUpdate();
    }
  }, [
    updater,
    updater.state.isChecking,
    updater.state.hasUpdate,
    updater.state.newVersion,
    lastCheckWasManual,
    updateSettings.lastPostponedAt,
    updateSettings.postponeInterval,
    updateSettings.skippedVersions,
  ]);

  // Listen for manual update check events
  useEffect(() => {
    const handleManualCheck = () => {
      if (updater.state.isChecking) return;

      setLastCheckWasManual(true);
      setIsManualCheck(true);
      setShowError(false);
      setShowUpToDate(false);

      void updater
        .checkForUpdates()
        .finally(() => setUpdateSetting("lastCheckedAt", Date.now()));
    };

    window.addEventListener("manual-update-check", handleManualCheck);
    return () => {
      window.removeEventListener("manual-update-check", handleManualCheck);
    };
  }, [updater, setUpdateSetting]);

  const handleCloseUpdateModal = () => {
    updater.dismissUpdate();
  };

  const handleRemindLater = async () => {
    await postponeUpdate();
    updater.dismissUpdate();
  };

  const handleSkipVersion = async () => {
    if (updater.state.newVersion) {
      await skipVersion(updater.state.newVersion);
    }
    updater.dismissUpdate();
  };

  return (
    <>
      {/* Update Modal */}
      <SimpleUpdateModal
        updater={updater}
        isVisible={updater.state.hasUpdate}
        onClose={handleCloseUpdateModal}
        onRemindLater={handleRemindLater}
        onSkipVersion={handleSkipVersion}
      />

      {/* Checking notification (manual check) */}
      <UpdateCheckingNotification
        onClose={() => {
          setShowChecking(false);
          setIsManualCheck(false);
        }}
        isVisible={showChecking}
      />

      {/* Up to date notification (manual check) */}
      <UpToDateNotification
        currentVersion={updater.state.currentVersion}
        onClose={() => setShowUpToDate(false)}
        isVisible={showUpToDate}
      />

      {/* Error notification (manual check) */}
      <UpdateErrorNotification
        error={errorMessage}
        onClose={() => setShowError(false)}
        onRetry={() => {
          if (updater.state.isChecking) return;

          setLastCheckWasManual(true);
          setIsManualCheck(true);

          void updater
            .checkForUpdates()
            .finally(() => setUpdateSetting("lastCheckedAt", Date.now()));
        }}
        isVisible={showError}
      />
    </>
  );
}
