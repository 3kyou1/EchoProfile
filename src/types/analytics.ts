/**
 */

import type { ProjectStatsSummary, SessionComparison, RecentEditsResult } from './index';
import type { RecentEditsPaginationState } from '../utils/pagination';
import type { MetricMode, StatsMode } from "./stats.types";

/**
 * Pagination state for recent edits
 * Re-exported from pagination utilities for backwards compatibility
 */
export type RecentEditsPagination = RecentEditsPaginationState;

/**
 */
export type AnalyticsView = 'messages' | 'tokenStats' | 'analytics' | 'recentEdits' | 'settings' | 'board' | 'archive' | 'copaProfile';
export type AnalyticsViewType = AnalyticsView;

/**
 */
export interface AnalyticsState {
  currentView: AnalyticsView;
  statsMode: StatsMode;
  metricMode: MetricMode;

  projectSummary: ProjectStatsSummary | null;
  projectConversationSummary: ProjectStatsSummary | null;
  sessionComparison: SessionComparison | null;
  recentEdits: RecentEditsResult | null;
  recentEditsPagination: RecentEditsPagination;

  recentEditsSearchQuery: string;

  isLoadingProjectSummary: boolean;
  isLoadingSessionComparison: boolean;
  isLoadingRecentEdits: boolean;

  projectSummaryError: string | null;
  sessionComparisonError: string | null;
  recentEditsError: string | null;
}

/**
 */
export interface AnalyticsActions {
  setCurrentView: (view: AnalyticsView) => void;

  setProjectSummary: (summary: ProjectStatsSummary | null) => void;
  setProjectConversationSummary: (summary: ProjectStatsSummary | null) => void;
  setSessionComparison: (comparison: SessionComparison | null) => void;
  setRecentEdits: (edits: RecentEditsResult | null) => void;
  setRecentEditsSearchQuery: (query: string) => void;

  setLoadingProjectSummary: (loading: boolean) => void;
  setLoadingSessionComparison: (loading: boolean) => void;
  setLoadingRecentEdits: (loading: boolean) => void;

  setProjectSummaryError: (error: string | null) => void;
  setSessionComparisonError: (error: string | null) => void;
  setRecentEditsError: (error: string | null) => void;

  switchToMessages: () => void;
  switchToTokenStats: () => void;
  switchToAnalytics: () => void;
  switchToRecentEdits: () => void;
  setStatsMode: (mode: StatsMode, options?: { isViewingGlobalStats?: boolean }) => Promise<void>;
  setMetricMode: (mode: MetricMode) => void;

  resetAnalytics: () => void;
  clearErrors: () => void;
}

/**
 */
import { createInitialRecentEditsPagination } from '../utils/pagination';

export const initialRecentEditsPagination: RecentEditsPagination =
  createInitialRecentEditsPagination();

export const initialAnalyticsState: AnalyticsState = {
  currentView: 'messages',
  statsMode: "billing_total",
  metricMode: "tokens",
  projectSummary: null,
  projectConversationSummary: null,
  sessionComparison: null,
  recentEdits: null,
  recentEditsPagination: initialRecentEditsPagination,
  recentEditsSearchQuery: "",
  isLoadingProjectSummary: false,
  isLoadingSessionComparison: false,
  isLoadingRecentEdits: false,
  projectSummaryError: null,
  sessionComparisonError: null,
  recentEditsError: null,
};

/**
 */
export interface UseAnalyticsReturn {
  readonly state: AnalyticsState;

  readonly actions: {
    switchToMessages: () => void;
    switchToTokenStats: () => Promise<void>;
    switchToAnalytics: () => Promise<void>;
    switchToRecentEdits: () => Promise<void>;
    switchToSettings: () => void;
    switchToBoard: () => Promise<void>;
    switchToArchive: () => void;
    switchToCopaProfile: () => void;
    setStatsMode: (mode: StatsMode, options?: { isViewingGlobalStats?: boolean }) => Promise<void>;
    setMetricMode: (mode: MetricMode) => void;
    refreshAnalytics: () => Promise<void>;
    clearAll: () => void;
  };

  readonly computed: {
    isTokenStatsView: boolean;
    isAnalyticsView: boolean;
    isMessagesView: boolean;
    isRecentEditsView: boolean;
    isSettingsView: boolean;
    isBoardView: boolean;
    isArchiveView: boolean;
    isCopaProfileView: boolean;
    hasAnyError: boolean;
    isLoadingAnalytics: boolean;
    isLoadingTokenStats: boolean;
    isLoadingRecentEdits: boolean;
    isAnyLoading: boolean;
  };
}

/**
 */
export interface AnalyticsContext {
  selectedProject: {
    name: string;
    path: string;
  } | null;
  selectedSession: {
    session_id: string;
    file_path: string;
  } | null;
}
