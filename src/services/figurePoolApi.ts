import { api } from "@/services/api";

export interface FigurePoolRepoEntry {
  directoryName: string;
  poolJson: string;
}

export interface FigurePoolPortraitInput {
  relativePath: string;
  dataBase64: string;
}

export interface SaveFigurePoolInput {
  requestedName: string;
  poolJson: string;
  previousDirectoryName?: string;
  portraits?: FigurePoolPortraitInput[];
  removePortraitPaths?: string[];
}

export interface SaveFigurePoolResult {
  directoryName: string;
  poolJson: string;
}

export interface ReadFigurePoolPortraitInput {
  directoryName: string;
  relativePath: string;
}

export interface FigurePoolPortraitOutput {
  dataBase64: string;
}

export const figurePoolApi = {
  listEntries: () => api<FigurePoolRepoEntry[]>("list_figure_pool_entries"),
  savePool: (input: SaveFigurePoolInput) =>
    api<SaveFigurePoolResult>("save_figure_pool", { input }),
  deletePool: (directoryName: string) =>
    api<void>("delete_figure_pool", { directoryName }),
  readPortrait: (input: ReadFigurePoolPortraitInput) =>
    api<FigurePoolPortraitOutput>("read_figure_pool_portrait", { input }),
};
