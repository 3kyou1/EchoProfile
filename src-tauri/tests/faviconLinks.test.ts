import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const indexHtml = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf8");

describe("favicon links", () => {
  it("declares explicit favicon assets for browser tabs", () => {
    expect(indexHtml).toContain('href="/favicon.ico?v=echoprofile"');
    expect(indexHtml).toContain('href="/favicon-32x32.png?v=echoprofile"');
    expect(indexHtml).toContain('href="/apple-touch-icon.png?v=echoprofile"');
  });
});
