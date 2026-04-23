import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const zhCommon = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "i18n/locales/zh-CN/common.json"), "utf8")
) as Record<string, string>;
const enCommon = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "i18n/locales/en/common.json"), "utf8")
) as Record<string, string>;

describe("thought echoes naming", () => {
  it("uses the approved zh-CN naming for the resonance panel", () => {
    expect(zhCommon["common.copa.resonance.title"]).toBe("思想回响");
    expect(zhCommon["common.copa.resonance.generate"]).toBe("生成思想回响");
    expect(zhCommon["common.copa.resonance.longTerm"]).toBe("长期回响");
    expect(zhCommon["common.copa.resonance.primary"]).toBe("主回响");
    expect(zhCommon["common.copa.resonance.secondary"]).toBe("次回响");
  });

  it("uses the approved English naming for the resonance panel", () => {
    expect(enCommon["common.copa.resonance.title"]).toBe("Thought Echoes");
    expect(enCommon["common.copa.resonance.generateLong"]).toBe("Generate Thought Echoes");
    expect(enCommon["common.copa.resonance.longTerm"]).toBe("Long-term echoes");
  });
});
