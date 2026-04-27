import { describe, expect, it } from "vitest";

import { initialAnalyticsState } from "@/types/analytics";

describe("initialAnalyticsState", () => {
  it("defaults the startup view to CoPA Profile", () => {
    expect(initialAnalyticsState.currentView).toBe("copaProfile");
  });
});
