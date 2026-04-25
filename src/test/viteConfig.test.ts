// @vitest-environment node

import { describe, expect, it } from "vitest";
import viteConfigFactory from "../../vite.config";

describe("vite dev server config", () => {
  it("proxies web api requests to the local webui server during dev", async () => {
    const config =
      typeof viteConfigFactory === "function" ? await viteConfigFactory() : viteConfigFactory;

    expect(config.server?.proxy?.["/api"]).toMatchObject({
      target: "http://127.0.0.1:3727",
      changeOrigin: true,
    });
  });
});
