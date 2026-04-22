#!/usr/bin/env node

/**
 * i18n validation script (namespace-based)
 * - duplicate key detection
 * - cross-language key count mismatch detection
 * - untranslated string detection (same as English)
 *
 * Usage: node scripts/validate-i18n.mjs
 */

import fs, { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { NAMESPACES, BASE_LANG } from './i18n-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "../src/i18n/locales");

let hasErrors = false;

function error(msg) {
  console.error(`❌ ${msg}`);
  hasErrors = true;
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
}

const INTENTIONAL_UNTRANSLATED_KEY_PATTERNS = [
  /^common\.appName$/,
  /^common\.provider\.(claude|codex|opencode)$/,
  /^error\.copyTemplate\.separator$/,
  /^messageViewer\.(codex|opencode)$/,
  /^progressRenderer\.types\.bash$/,
  /^rendererLabels\.glob$/,
  /^terminalExecutionResultRenderer\.(stderr|stdout)$/,
  /^settingsManager\.mcp\.(argsPlaceholder|serverNamePlaceholder)$/,
  /^settingsManager\.mcp\.source\.[^.]+\.file$/,
  /^settingsManager\.mcp\.(sourceProjectMcp|sourceSettings|sourceUserMcp)$/,
  /^settingsManager\.permissions\.directoryPlaceholder$/,
  /^settingsManager\.presets\.badge\.mcpCount$/,
  /^settingsManager\.scope\.(local|project|user)\.file$/,
  /^settingsManager\.unified\.env\.keyPlaceholder$/,
];

function isIntentionallyUntranslated(key, value) {
  if (
    INTENTIONAL_UNTRANSLATED_KEY_PATTERNS.some((pattern) => pattern.test(key))
  ) {
    return true;
  }

  // CLI args, file paths, env vars, and command tokens are intentionally kept as-is.
  if (
    /^[A-Z0-9_]+$/.test(value) ||
    /(^~\/|\/|\\|\.json|\.jsonl|->|→)/.test(value)
  ) {
    return true;
  }

  return false;
}

// 1. Duplicate key detection (JSON.parse overwrites duplicates silently, so parse directly)
function findDuplicateKeys(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const keyRegex = /^\s*"([^"]+)"\s*:/gm;
  const seen = new Map();
  const duplicates = [];
  let match;

  while ((match = keyRegex.exec(content)) !== null) {
    const key = match[1];
    if (seen.has(key)) {
      duplicates.push(key);
    }
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return duplicates;
}

// 2. Collect keys
function getKeys(langDir) {
  const allKeys = new Set();
  for (const ns of NAMESPACES) {
    const filePath = join(langDir, `${ns}.json`);
    if (!existsSync(filePath)) continue;
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    for (const key of Object.keys(content)) {
      allKeys.add(key);
    }
  }
  return allKeys;
}

// 3. Load namespace data
function loadNamespaceData(langDir) {
  const data = {};
  for (const ns of NAMESPACES) {
    const filePath = join(langDir, `${ns}.json`);
    if (!existsSync(filePath)) continue;
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    Object.assign(data, content);
  }
  return data;
}

// 4. Detect untranslated entries (same value as en)
function findUntranslated(baseData, targetData) {
  const untranslated = [];

  for (const [key, value] of Object.entries(targetData)) {
    if (
      baseData[key] === value &&
      typeof value === "string" &&
      value.length > 3 &&
      !isIntentionallyUntranslated(key, value) &&
      // Ignore proper nouns and technical terms
      !/^(Claude|GitHub|Tauri|JSON|MCP|JSONL|API|URL|ID|CSV|PDF|HTML|CSS|TypeScript|JavaScript|Rust|React|Vite|ESLint|Zustand)$/i.test(
        value
      ) &&
      // Ignore keys whose values are intended labels
      !key.startsWith("tools.") &&
      !key.endsWith(".name")
    ) {
      untranslated.push(key);
    }
  }
  return untranslated;
}

console.log("🔍 Starting i18n validation (namespace-based)...\n");

const langDirs = readdirSync(LOCALES_DIR).filter((f) => {
  const fullPath = join(LOCALES_DIR, f);
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) return false;
    return readdirSync(fullPath).some((file) => file.endsWith(".json"));
  } catch {
    return false;
  }
});

const baseDir = join(LOCALES_DIR, BASE_LANG);
const baseKeys = getKeys(baseDir);
const baseData = loadNamespaceData(baseDir);

console.log(`📁 Detected languages: ${langDirs.join(", ")}`);
console.log(`📊 Base language (${BASE_LANG})) key count: ${baseKeys.size}\n`);

// === Step 1: Duplicate key check ===
console.log("📋 1. Duplicate key check");
for (const lang of langDirs) {
  const langDir = join(LOCALES_DIR, lang);
  let langHasDupes = false;

  for (const ns of NAMESPACES) {
    const filePath = join(langDir, `${ns}.json`);
    if (!existsSync(filePath)) continue;

    const dupes = findDuplicateKeys(filePath);
    if (dupes.length > 0) {
      error(`${lang}/${ns}.json: duplicate keys ${dupes.length} -> ${dupes.join(", ")}`);
      langHasDupes = true;
    }
  }

  if (!langHasDupes) {
    console.log(`  ✅ ${lang}: no duplicates`);
  }
}

// === Step 2: Key count sync check ===
console.log("\n📋 2. Key count sync check");
for (const lang of langDirs) {
  if (lang === BASE_LANG) continue;

  const langDir = join(LOCALES_DIR, lang);
  const targetKeys = getKeys(langDir);

  const missingInTarget = [...baseKeys].filter((k) => !targetKeys.has(k));
  const extraInTarget = [...targetKeys].filter((k) => !baseKeys.has(k));

  if (missingInTarget.length > 0) {
    error(
      `${lang}: missing keys vs en: ${missingInTarget.length} -> ${missingInTarget.slice(0, 5).join(", ")}${missingInTarget.length > 5 ? "..." : ""}`
    );
  }
  if (extraInTarget.length > 0) {
    warn(
      `${lang}: extra keys not in en: ${extraInTarget.length} -> ${extraInTarget.slice(0, 5).join(", ")}${extraInTarget.length > 5 ? "..." : ""}`
    );
  }
  if (missingInTarget.length === 0 && extraInTarget.length === 0) {
    console.log(`  ✅ ${lang}: ${targetKeys.size} keys synced`);
  }
}

// === Step 3: Untranslated string check (excluding en) ===
console.log("\n📋 3. Untranslated string check");
for (const lang of langDirs) {
  if (lang === BASE_LANG) continue;

  const langDir = join(LOCALES_DIR, lang);
  const targetData = loadNamespaceData(langDir);
  const untranslated = findUntranslated(baseData, targetData);

  if (untranslated.length > 0) {
    warn(
      `${lang}: potentially untranslated: ${untranslated.length} -> ${untranslated.slice(0, 5).join(", ")}${untranslated.length > 5 ? "..." : ""}`
    );
  } else {
    console.log(`  ✅ ${lang}: no untranslated strings`);
  }
}

console.log(
  `\n${hasErrors ? "❌ Validation failed - fix the errors above." : "✅ All checks passed!"}`
);
process.exit(hasErrors ? 1 : 0);
