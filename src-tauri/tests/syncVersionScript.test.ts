import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function makeTempProject(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echo-profile-sync-version-"));
  tempDirs.push(tempDir);

  fs.mkdirSync(path.join(tempDir, "src-tauri"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ version: "9.9.9" }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(tempDir, "src-tauri", "Cargo.toml"),
    [
      "[package]",
      'name = "echo-profile"',
      'version = "1.0.0"',
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(tempDir, "src-tauri", "tauri.conf.json"),
    JSON.stringify({ version: "1.0.0" }, null, 2) + "\n",
  );

  return tempDir;
}

describe("sync-version script", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints English-only status messages", () => {
    const tempDir = makeTempProject();
    const scriptPath = path.resolve(__dirname, "../../scripts/sync-version.cjs");

    const output = execFileSync(process.execPath, [scriptPath], {
      cwd: tempDir,
      encoding: "utf8",
    });

    expect(output).toContain("[sync-version] package.json version: 9.9.9");
    expect(output).toContain("[sync-version] All files synced to version 9.9.9.");
    expect(output).not.toMatch(/[\uac00-\ud7af]/u);
  });
});
