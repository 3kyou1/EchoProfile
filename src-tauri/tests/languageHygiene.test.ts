import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const FORBIDDEN_SCRIPT_RE = /[\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af]/u;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
  ".next",
  ".turbo",
]);
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".icns",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".dmg",
  ".exe",
]);

function collectMatches(targetPath: string, matches: string[]): void {
  const stat = fs.statSync(targetPath);
  const relativePath = path.relative(REPO_ROOT, targetPath);

  if (stat.isDirectory()) {
    const directoryName = path.basename(targetPath);
    if (IGNORED_DIRECTORIES.has(directoryName)) {
      return;
    }

    for (const entry of fs.readdirSync(targetPath)) {
      collectMatches(path.join(targetPath, entry), matches);
    }
    return;
  }

  if (BINARY_EXTENSIONS.has(path.extname(targetPath).toLowerCase())) {
    return;
  }

  const content = fs.readFileSync(targetPath, "utf8");
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    if (FORBIDDEN_SCRIPT_RE.test(lines[index])) {
      matches.push(`${relativePath}:${index + 1}: ${lines[index].trim()}`);
    }
  }
}

describe("language hygiene", () => {
  it("keeps the repository free of Korean and Japanese text", () => {
    const matches: string[] = [];
    collectMatches(REPO_ROOT, matches);

    expect(matches).toEqual([]);
  });
});
