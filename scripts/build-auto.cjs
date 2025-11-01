#!/usr/bin/env node

/**
 * Auto-detect platform and run the appropriate build command
 */

const { execSync } = require('child_process');
const os = require('os');

const platform = os.platform();

console.log(`🔍 Detected platform: ${platform}`);

let buildCommand;

switch (platform) {
  case 'darwin':
    console.log('🍎 Building for macOS (universal binary)...');
    buildCommand = 'pnpm tauri:build';
    break;
  case 'linux':
    console.log('🐧 Building for Linux...');
    buildCommand = 'pnpm tauri:build:linux';
    break;
  case 'win32':
    console.log('🪟 Building for Windows...');
    buildCommand = 'pnpm run sync-version && tauri build';
    break;
  default:
    console.error(`❌ Unsupported platform: ${platform}`);
    process.exit(1);
}

try {
  execSync(buildCommand, { stdio: 'inherit' });
  console.log('✅ Build completed successfully!');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
