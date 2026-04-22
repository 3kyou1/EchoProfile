import { describe, expect, test } from "vitest";
import {
  createMockGlobalStatsSummary,
  createMockProjectStatsSummary,
  createMockSessionTokenStats,
} from "../../dev-mock-server";

describe("dev mock server data", () => {
  test("global stats summary includes iterable distributions", () => {
    const summary = createMockGlobalStatsSummary();

    expect(Array.isArray(summary.model_distribution)).toBe(true);
    expect(Array.isArray(summary.provider_distribution)).toBe(true);
    expect(Array.isArray(summary.daily_stats)).toBe(true);
    expect(summary.model_distribution[0]?.model_name).toBeTruthy();
  });

  test("project stats summary includes analytics fields used by the dashboard", () => {
    const summary = createMockProjectStatsSummary();

    expect(summary.project_name).toBeTruthy();
    expect(Array.isArray(summary.daily_stats)).toBe(true);
    expect(Array.isArray(summary.activity_heatmap)).toBe(true);
    expect(summary.token_distribution.input).toBeGreaterThan(0);
  });

  test("session token stats mock contains aggregate token fields", () => {
    const stats = createMockSessionTokenStats();

    expect(stats.total_tokens).toBeGreaterThan(0);
    expect(stats.total_input_tokens).toBeGreaterThan(0);
    expect(stats.total_output_tokens).toBeGreaterThan(0);
  });
});
