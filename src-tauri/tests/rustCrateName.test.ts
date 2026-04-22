import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const cargoTomlPath = path.join(process.cwd(), 'src-tauri', 'Cargo.toml');
const mainPath = path.join(process.cwd(), 'src-tauri', 'src', 'main.rs');
const benchesDir = path.join(process.cwd(), 'src-tauri', 'benches');

function getLibCrateName(): string {
  const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
  const libSection = cargoToml.match(/\[lib\][\s\S]*?name\s*=\s*"([^"]+)"/);
  if (!libSection) {
    throw new Error('Could not find [lib] name in Cargo.toml');
  }
  return libSection[1];
}

describe('Rust crate naming', () => {
  it('uses the renamed library crate in the Rust entrypoints', () => {
    const libCrateName = getLibCrateName();
    const mainRs = fs.readFileSync(mainPath, 'utf8');
    expect(mainRs).toContain(`${libCrateName}::run();`);
    expect(mainRs).not.toContain('claude_code_history_viewer_lib::');

    for (const file of fs.readdirSync(benchesDir)) {
      if (!file.endsWith('.rs')) continue;
      const benchSource = fs.readFileSync(path.join(benchesDir, file), 'utf8');
      expect(benchSource).not.toContain('claude_code_history_viewer_lib::');
    }
  });
});
