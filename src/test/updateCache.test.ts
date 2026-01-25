import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the config before importing the module
vi.mock("../config/update.config", () => ({
  UPDATE_CACHE_DURATION_MS: 1000, // 1 second for testing
  UPDATE_CACHE_SCHEMA_VERSION: 2,
}));

// Mock the logger
vi.mock("../utils/logger", () => ({
  updateLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  getCachedUpdateResult,
  setCachedUpdateResult,
  clearUpdateCache,
} from "../utils/updateCache";

describe("updateCache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("setCachedUpdateResult", () => {
    it("should store cache result in localStorage", () => {
      const releaseInfo = {
        tag_name: "v1.0.0",
        name: "Release 1.0.0",
        body: "Release notes",
        published_at: "2024-01-01T00:00:00Z",
        html_url: "https://github.com/test/releases/v1.0.0",
        assets: [],
      };

      setCachedUpdateResult(true, releaseInfo, "1.0.0");

      const stored = localStorage.getItem("update_check_cache");
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.hasUpdate).toBe(true);
      expect(parsed.releaseInfo).toEqual(releaseInfo);
      expect(parsed.currentVersion).toBe("1.0.0");
      expect(parsed.schemaVersion).toBe(2);
    });

    it("should store null releaseInfo", () => {
      setCachedUpdateResult(false, null, "1.0.0");

      const stored = localStorage.getItem("update_check_cache");
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.hasUpdate).toBe(false);
      expect(parsed.releaseInfo).toBeNull();
    });
  });

  describe("getCachedUpdateResult", () => {
    it("should return null when no cache exists", () => {
      const result = getCachedUpdateResult("1.0.0");
      expect(result).toBeNull();
    });

    it("should return cached result for matching version", () => {
      const releaseInfo = {
        tag_name: "v1.1.0",
        name: "Release 1.1.0",
        body: "New features",
        published_at: "2024-01-01T00:00:00Z",
        html_url: "https://github.com/test/releases/v1.1.0",
        assets: [],
      };

      setCachedUpdateResult(true, releaseInfo, "1.0.0");
      const result = getCachedUpdateResult("1.0.0");

      expect(result).not.toBeNull();
      expect(result!.hasUpdate).toBe(true);
      expect(result!.releaseInfo).toEqual(releaseInfo);
    });

    it("should return null for different version", () => {
      setCachedUpdateResult(true, null, "1.0.0");
      const result = getCachedUpdateResult("1.1.0");

      expect(result).toBeNull();
    });

    it("should return null for expired cache", async () => {
      setCachedUpdateResult(true, null, "1.0.0");

      // Wait for cache to expire (1 second based on mock)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = getCachedUpdateResult("1.0.0");
      expect(result).toBeNull();
    });

    it("should return null for invalid cache data", () => {
      localStorage.setItem("update_check_cache", "invalid json");
      const result = getCachedUpdateResult("1.0.0");
      expect(result).toBeNull();
    });

    it("should return null for cache with wrong schema version", () => {
      const cache = {
        hasUpdate: true,
        releaseInfo: null,
        timestamp: Date.now(),
        currentVersion: "1.0.0",
        schemaVersion: 1, // Old schema version
      };
      localStorage.setItem("update_check_cache", JSON.stringify(cache));

      const result = getCachedUpdateResult("1.0.0");
      expect(result).toBeNull();
    });

    it("should return null for cache missing required fields", () => {
      const invalidCaches = [
        { releaseInfo: null, timestamp: Date.now(), currentVersion: "1.0.0" }, // missing hasUpdate
        { hasUpdate: true, timestamp: Date.now(), currentVersion: "1.0.0" }, // missing releaseInfo is OK (nullable)
        { hasUpdate: true, releaseInfo: null, currentVersion: "1.0.0" }, // missing timestamp
        { hasUpdate: true, releaseInfo: null, timestamp: Date.now() }, // missing currentVersion
      ];

      for (const cache of invalidCaches) {
        localStorage.setItem("update_check_cache", JSON.stringify(cache));
        const result = getCachedUpdateResult("1.0.0");
        expect(result).toBeNull();
      }
    });
  });

  describe("clearUpdateCache", () => {
    it("should remove cache from localStorage", () => {
      setCachedUpdateResult(true, null, "1.0.0");
      expect(localStorage.getItem("update_check_cache")).not.toBeNull();

      clearUpdateCache();
      expect(localStorage.getItem("update_check_cache")).toBeNull();
    });

    it("should not throw when cache does not exist", () => {
      expect(() => clearUpdateCache()).not.toThrow();
    });
  });
});
