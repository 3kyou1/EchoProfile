import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const packageJsonPath = path.join(process.cwd(), 'package.json');
const cargoLockPath = path.join(process.cwd(), 'src-tauri', 'Cargo.lock');

function readPackageVersion(pkg: string): string {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return packageJson.dependencies?.[pkg] ?? packageJson.devDependencies?.[pkg] ?? '';
}

function readCargoVersion(crateName: string): string {
  const cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
  const match = cargoLock.match(new RegExp(`name = "${crateName}"\\nversion = "([^"]+)"`));
  if (!match) {
    throw new Error(`Could not find ${crateName} in Cargo.lock`);
  }
  return match[1];
}

function majorMinor(version: string): string {
  const clean = version.replace(/^[^\d]*/, '');
  const [major = '', minor = ''] = clean.split('.');
  return `${major}.${minor}`;
}

describe('Tauri package parity', () => {
  it('keeps JS packages on the same major/minor as resolved Rust crates', () => {
    const pairs = [
      ['@tauri-apps/api', 'tauri'],
      ['@tauri-apps/plugin-dialog', 'tauri-plugin-dialog'],
      ['@tauri-apps/plugin-updater', 'tauri-plugin-updater'],
      ['@tauri-apps/cli', 'tauri'],
    ] as const;

    for (const [jsPackage, rustCrate] of pairs) {
      expect(majorMinor(readPackageVersion(jsPackage))).toBe(majorMinor(readCargoVersion(rustCrate)));
    }
  });
});
