import { create } from 'zustand';

type ExpandRegistryState = {
  states: Record<string, boolean>;
  setExpanded: (key: string, expanded: boolean) => void;
  clearAll: () => void;
};

export const useExpandRegistry = create<ExpandRegistryState>((set) => ({
  states: {},
  setExpanded: (key, expanded) =>
    set((state) => ({ states: { ...state.states, [key]: expanded } })),
  clearAll: () => set({ states: {} }),
}));
