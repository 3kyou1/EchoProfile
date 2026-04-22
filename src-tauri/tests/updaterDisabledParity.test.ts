import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const configPath = path.join(process.cwd(), 'src-tauri', 'tauri.conf.json');
const libPath = path.join(process.cwd(), 'src-tauri', 'src', 'lib.rs');

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    plugins?: {
      updater?: {
        active?: boolean;
      };
    };
  };
}

describe('disabled updater wiring', () => {
  it('does not register the updater plugin when updater config is inactive', () => {
    const config = readConfig();
    const libRs = fs.readFileSync(libPath, 'utf8');

    expect(config.plugins?.updater?.active).toBe(false);
    expect(libRs).not.toContain('.plugin(tauri_plugin_updater::Builder::new().build())');
  });
});
