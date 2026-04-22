#!/usr/bin/env node
/**
 * i18n key sync script (namespace-based)
 * Adds missing keys to other languages based on English (en).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LANGUAGES, NAMESPACES } from './i18n-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');

// Exclude 'en' because it is the source language
const TARGET_LANGUAGES = LANGUAGES.filter(lang => lang !== 'en');

function main() {
  console.log('Starting i18n key sync (namespace-based)...\n');

  const enDir = path.join(LOCALES_DIR, 'en');

  // Sync each namespace
  for (const ns of NAMESPACES) {
    const enPath = path.join(enDir, `${ns}.json`);
    if (!fs.existsSync(enPath)) {
      console.warn(`⚠️ ${ns}: en/${ns}.json missing, skipping`);
      continue;
    }

    const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    const enKeys = new Set(Object.keys(en));

    console.log(`\n📦 ${ns} (${enKeys.size} keys)`);

    for (const lang of TARGET_LANGUAGES) {
      const langDir = path.join(LOCALES_DIR, lang);
      const langPath = path.join(langDir, `${ns}.json`);

      // Create the language directory
      if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
      }

      let langData = {};
      if (fs.existsSync(langPath)) {
        langData = JSON.parse(fs.readFileSync(langPath, 'utf-8'));
      }

      const langKeys = new Set(Object.keys(langData));

      // Find keys missing from the target language
      const missingKeys = [...enKeys].filter(k => !langKeys.has(k));

      // Find extra keys that do not exist in English
      const extraKeys = [...langKeys].filter(k => !enKeys.has(k));

      if (missingKeys.length > 0) {
        console.log(`  ${lang}: +${missingKeys.length} keys added`);
        for (const key of missingKeys) {
          langData[key] = en[key]; // Fallback to the English value
        }
      }

      if (extraKeys.length > 0) {
        console.log(`  ${lang}: -${extraKeys.length} extra keys removed`);
        for (const key of extraKeys) {
          delete langData[key];
        }
      }

      if (missingKeys.length === 0 && extraKeys.length === 0) {
        console.log(`  ${lang}: ✅ Synced`);
      }

      // Sort keys in English key order
      const sorted = {};
      for (const key of Object.keys(en)) {
        if (langData[key] !== undefined) {
          sorted[key] = langData[key];
        }
      }

      // Save the file
      fs.writeFileSync(langPath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    }
  }

  console.log('\n=== Sync complete ===');

  // Final verification
  console.log('\nFinal key counts:');
  for (const lang of ['en', ...TARGET_LANGUAGES]) {
    const langDir = path.join(LOCALES_DIR, lang);
    let total = 0;
    for (const ns of NAMESPACES) {
      const nsPath = path.join(langDir, `${ns}.json`);
      if (fs.existsSync(nsPath)) {
        const data = JSON.parse(fs.readFileSync(nsPath, 'utf-8'));
        total += Object.keys(data).length;
      }
    }
    console.log(`  ${lang}: ${total}`);
  }
}

main();
