#!/usr/bin/env node

/**
 * Sync the package.json version to src-tauri/Cargo.toml and src-tauri/tauri.conf.json.
 *
 * Single Source of Truth: package.json
 *
 * Sync targets:
 *   - src-tauri/Cargo.toml (Rust backend version)
 *   - src-tauri/tauri.conf.json (Tauri app version used by the updater)
 *
 * Usage:
 *   node scripts/sync-version.cjs
 *   just sync-version
 */

const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(process.cwd(), "package.json");
const cargoTomlPath = path.join(process.cwd(), "src-tauri", "Cargo.toml");
const tauriConfPath = path.join(process.cwd(), "src-tauri", "tauri.conf.json");

// 1. Read the version from package.json (Single Source of Truth)
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;

console.log(`[sync-version] package.json version: ${version}`);

// 2. Sync Cargo.toml
let cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
const versionRegex = /^version\s*=\s*"[^\"]*"/m;

if (!versionRegex.test(cargoToml)) {
  console.error("[sync-version] Could not find a version line in Cargo.toml.");
  process.exit(1);
}

cargoToml = cargoToml.replace(versionRegex, `version = "${version}"`);
fs.writeFileSync(cargoTomlPath, cargoToml);
console.log(`[sync-version] ✓ Cargo.toml → ${version}`);

// 3. Sync tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
const oldTauriVersion = tauriConf.version;
tauriConf.version = version;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
console.log(`[sync-version] ✓ tauri.conf.json → ${version} (previous: ${oldTauriVersion})`);

console.log(`[sync-version] All files synced to version ${version}.`);
