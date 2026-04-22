#!/usr/bin/env node
/**
 * i18n merge and flatten script
 *
 * Previous structure: locales/{lang}/{common,components,messages}.json
 * New structure: locales/{lang}.json (flattened with dot notation)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LANGUAGES } from './i18n-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');

// Namespace prefix mapping
const NAMESPACE_PREFIX = {
  common: '', // keep common keys in place while adding a prefix
  components: '', // component keys are already structured
  messages: 'messages.' // messages namespace
};

/**
 * Flatten nested objects into dot notation
 */
function flattenObject(obj, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, newKey, result);
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

/**
 * Add the 'common.' prefix to common.json keys
 * while leaving already structured keys unchanged
 */
function processCommonKeys(obj) {
  const flattened = flattenObject(obj);
  const result = {};

  for (const [key, value] of Object.entries(flattened)) {
    // Add the 'common.' prefix to every common namespace key
    result[`common.${key}`] = value;
  }

  return result;
}

/**
 * Process component.json keys
 * These keys are already structured, so flatten them as-is
 */
function processComponentsKeys(obj) {
  return flattenObject(obj);
}

/**
 * Process messages.json keys
 */
function processMessagesKeys(obj) {
  const flattened = flattenObject(obj);
  const result = {};

  for (const [key, value] of Object.entries(flattened)) {
    result[`messages.${key}`] = value;
  }

  return result;
}

/**
 * Sort keys alphabetically while keeping prefix groups together
 */
function sortKeys(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort((a, b) => {
    // Extract prefixes
    const prefixA = a.split('.')[0];
    const prefixB = b.split('.')[0];

    // Prefix priority order
    const prefixOrder = [
      'common', 'analytics', 'session', 'project', 'message', 'messageViewer',
      'tools', 'toolResult', 'toolUseRenderer', 'error', 'status', 'settings',
      'update', 'updateModal', 'updateSettingsModal', 'updateIntroModal',
      'feedback', 'time', 'folderPicker', 'diffViewer', 'advancedTextDiff',
      'structuredPatch', 'contentArray', 'fileContent', 'fileEditRenderer',
      'messageContentDisplay', 'codebaseContextRenderer', 'fileListRenderer',
      'mcpRenderer', 'gitWorkflowRenderer', 'assistantMessageDetails',
      'claudeSessionHistoryRenderer', 'terminalStreamRenderer', 'webSearchRenderer',
      'thinkingRenderer', 'copyButton', 'imageRenderer', 'upToDateNotification',
      'commandRenderer', 'taskNotification', 'recentEdits', 'messages'
    ];

    const orderA = prefixOrder.indexOf(prefixA);
    const orderB = prefixOrder.indexOf(prefixB);

    if (orderA !== -1 && orderB !== -1) {
      if (orderA !== orderB) return orderA - orderB;
    } else if (orderA !== -1) {
      return -1;
    } else if (orderB !== -1) {
      return 1;
    }

    return a.localeCompare(b);
  });

  for (const key of keys) {
    sorted[key] = obj[key];
  }

  return sorted;
}

/**
 * Merge and flatten files for each language
 */
function processLanguage(lang) {
  const langDir = path.join(LOCALES_DIR, lang);

  // Read files
  const commonPath = path.join(langDir, 'common.json');
  const componentsPath = path.join(langDir, 'components.json');
  const messagesPath = path.join(langDir, 'messages.json');

  let common = {};
  let components = {};
  let messages = {};

  if (fs.existsSync(commonPath)) {
    common = JSON.parse(fs.readFileSync(commonPath, 'utf-8'));
  }
  if (fs.existsSync(componentsPath)) {
    components = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
  }
  if (fs.existsSync(messagesPath)) {
    messages = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
  }

  // Process each namespace
  const processedCommon = processCommonKeys(common);
  const processedComponents = processComponentsKeys(components);
  const processedMessages = processMessagesKeys(messages);

  // Merge results
  const merged = {
    ...processedCommon,
    ...processedComponents,
    ...processedMessages
  };

  // Sort keys
  const sorted = sortKeys(merged);

  return sorted;
}

/**
 * Main entry point
 */
function main() {
  console.log('Starting i18n merge and flatten...\n');

  const stats = {};

  for (const lang of LANGUAGES) {
    console.log(`Processing: ${lang}`);

    const flattened = processLanguage(lang);
    const keyCount = Object.keys(flattened).length;

    // Save to the new output file
    const outputPath = path.join(LOCALES_DIR, `${lang}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(flattened, null, 2) + '\n', 'utf-8');

    stats[lang] = keyCount;
    console.log(`  → ${outputPath} (${keyCount} keys)`);
  }

  console.log('\n=== Summary ===');
  for (const [lang, count] of Object.entries(stats)) {
    console.log(`${lang}: ${count} keys`);
  }

  // Verify that key counts match
  const counts = Object.values(stats);
  const allEqual = counts.every(c => c === counts[0]);

  if (allEqual) {
    console.log('\n✅ All languages have matching key counts.');
  } else {
    console.log('\n⚠️ Warning: key counts differ by language!');
    console.log('   Some translations may be missing.');
  }
}

main();
