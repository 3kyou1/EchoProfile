/**
 * Project Analytics Calculations
 *
 * Utility functions for project-level analytics calculations.
 */

import type { ProjectStatsSummary, DailyStats } from "../../../types";
import type { DailyStatData } from "../types";
import { calculateGrowthRate } from "./calculations";

// ============================================================================
// Daily Stats Processing
// ============================================================================

/**
 * Generate full trend data from project stats
 * Maps the available daily stats to trend data
 */
export const generateTrendData = (dailyStats: DailyStats[] | undefined): DailyStatData[] => {
  if (!dailyStats) return [];

  return dailyStats.map((stat) => ({
    date: stat.date,
    total_tokens: stat.total_tokens || 0,
    message_count: stat.message_count || 0,
    session_count: stat.session_count || 0,
    active_hours: stat.active_hours || 0,
  }));
};

// ============================================================================
// Growth Metrics
// ============================================================================

export interface GrowthMetrics {
  tokenGrowth: number;
  messageGrowth: number;
}

/**
 * Calculate day-over-day growth rates for tokens and messages
 */
export const calculateDailyGrowth = (dailyStats: DailyStats[]): GrowthMetrics => {
  if (dailyStats.length < 2) {
    return { tokenGrowth: 0, messageGrowth: 0 };
  }

  const lastDayStats = dailyStats[dailyStats.length - 1];
  const prevDayStats = dailyStats[dailyStats.length - 2];

  if (!lastDayStats || !prevDayStats) {
    return { tokenGrowth: 0, messageGrowth: 0 };
  }

  return {
    tokenGrowth: calculateGrowthRate(lastDayStats.total_tokens, prevDayStats.total_tokens),
    messageGrowth: calculateGrowthRate(lastDayStats.message_count, prevDayStats.message_count),
  };
};

/**
 * Extract growth metrics from project summary
 */
export const extractProjectGrowth = (projectSummary: ProjectStatsSummary): GrowthMetrics => {
  return calculateDailyGrowth(projectSummary.daily_stats);
};
