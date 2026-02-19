/**
 * Provider Slice
 *
 * Manages multi-provider detection and filtering state.
 */

import { invoke } from "@tauri-apps/api/core";
import type { ProviderId, ProviderInfo } from "../../types";
import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";

// ============================================================================
// State Interface
// ============================================================================

export interface ProviderSliceState {
  providers: ProviderInfo[];
  activeProviders: ProviderId[];
  isDetectingProviders: boolean;
}

export interface ProviderSliceActions {
  detectProviders: () => Promise<void>;
  toggleProvider: (id: ProviderId) => void;
  setActiveProviders: (ids: ProviderId[]) => void;
}

export type ProviderSlice = ProviderSliceState & ProviderSliceActions;

// ============================================================================
// Initial State
// ============================================================================

const initialProviderState: ProviderSliceState = {
  providers: [],
  activeProviders: ["claude", "codex", "opencode"],
  isDetectingProviders: false,
};

// ============================================================================
// Slice Creator
// ============================================================================

export const createProviderSlice: StateCreator<
  FullAppStore,
  [],
  [],
  ProviderSlice
> = (set) => ({
  ...initialProviderState,

  detectProviders: async () => {
    set({ isDetectingProviders: true });
    try {
      const providers = await invoke<ProviderInfo[]>("detect_providers");
      const activeProviders = providers
        .filter((p) => p.is_available)
        .map((p) => p.id as ProviderId);
      set({ providers, activeProviders });
    } catch (error) {
      console.error("Failed to detect providers:", error);
    } finally {
      set({ isDetectingProviders: false });
    }
  },

  toggleProvider: (id: ProviderId) => {
    set((state) => {
      const current = state.activeProviders;
      const next = current.includes(id)
        ? current.filter((p) => p !== id)
        : [...current, id];
      // Ensure at least one provider is active
      return { activeProviders: next.length > 0 ? next : current };
    });
  },

  setActiveProviders: (ids: ProviderId[]) => {
    set({ activeProviders: ids });
  },
});
