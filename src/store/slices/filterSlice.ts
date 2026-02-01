import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";
import type { DateFilter } from "../../types/board.types";

export interface FilterSliceState {
    dateFilter: DateFilter;
}

export interface FilterSliceActions {
    setDateFilter: (filter: DateFilter) => void;
    clearDateFilter: () => void;
}

export type FilterSlice = FilterSliceState & FilterSliceActions;

const getInitialDateFilter = () => {
    const end = new Date();
    // Set to end of day
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setDate(end.getDate() - 7);
    start.setHours(0, 0, 0, 0);

    return { start, end };
};

const initialFilterState: FilterSliceState = {
    dateFilter: getInitialDateFilter(),
};

export const createFilterSlice: StateCreator<
    FullAppStore,
    [],
    [],
    FilterSlice
> = (set) => ({
    ...initialFilterState,

    setDateFilter: (dateFilter) => {
        set({ dateFilter });
    },

    clearDateFilter: () => {
        set({ dateFilter: { start: null, end: null } });
    },
});
