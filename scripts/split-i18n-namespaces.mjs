#!/usr/bin/env node
/**
 * i18n namespace split script
 *
 * Previous structure: locales/{lang}.json (single file, 1392 keys)
 * New structure: locales/{lang}/{namespace}.json (one file per namespace)
 *
 * Groups 63 prefixes into logical namespaces for easier maintenance.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LANGUAGES, NAMESPACES } from './i18n-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');

/**
 * Prefix -> namespace mapping
 *
 * Groups 63 prefixes into 12 logical namespaces
 * Each namespace stays within a manageable 2-12K token range
 */
const PREFIX_TO_NAMESPACE = {
  // common: shared UI (~80 keys)
  common: 'common',
  status: 'common',
  time: 'common',
  copyButton: 'common',

  // analytics: dashboard (~132 keys)
  analytics: 'analytics',

  // session: sessions and projects (~116 keys)
  session: 'session',
  project: 'session',

  // settings: settings manager (~500 keys)
  settingsManager: 'settings',
  settings: 'settings',
  folderPicker: 'settings',

  // tools: tools and results (~58 keys)
  tools: 'tools',
  toolResult: 'tools',
  toolUseRenderer: 'tools',
  collapsibleToolResult: 'tools',

  // error: error messages (~37 keys)
  error: 'error',

  // message: message viewer (~80 keys)
  message: 'message',
  messages: 'message',
  messageViewer: 'message',
  messageContentDisplay: 'message',

  // renderers: renderer components (~200 keys)
  advancedTextDiff: 'renderers',
  agentProgressGroup: 'renderers',
  agentTaskGroup: 'renderers',
  assistantMessageDetails: 'renderers',
  bashCodeExecutionToolResultRenderer: 'renderers',
  captureMode: 'renderers',
  citationRenderer: 'renderers',
  claudeContentArrayRenderer: 'renderers',
  claudeSessionHistoryRenderer: 'renderers',
  claudeToolUseDisplay: 'renderers',
  codebaseContextRenderer: 'renderers',
  codeExecutionToolResultRenderer: 'renderers',
  commandOutputDisplay: 'renderers',
  commandRenderer: 'renderers',
  contentArray: 'renderers',
  diffViewer: 'renderers',
  fileContent: 'renderers',
  fileEditRenderer: 'renderers',
  fileHistorySnapshotRenderer: 'renderers',
  fileListRenderer: 'renderers',
  gitWorkflowRenderer: 'renderers',
  globalSearch: 'renderers',
  imageRenderer: 'renderers',
  mcpRenderer: 'renderers',
  progressRenderer: 'renderers',
  queueOperationRenderer: 'renderers',
  structuredPatch: 'renderers',
  summaryMessageRenderer: 'renderers',
  systemMessageRenderer: 'renderers',
  taskNotification: 'renderers',
  taskOperation: 'renderers',
  terminalStreamRenderer: 'renderers',
  textEditorCodeExecutionToolResultRenderer: 'renderers',
  thinkingRenderer: 'renderers',
  toolSearchToolResultRenderer: 'renderers',
  webFetchToolResultRenderer: 'renderers',
  webSearchRenderer: 'renderers',

  // update: update flow (~70 keys)
  updateModal: 'update',
  updateSettingsModal: 'update',
  updateIntroModal: 'update',
  simpleUpdateModal: 'update',
  upToDateNotification: 'update',

  // feedback: feedback (~32 keys)
  feedback: 'feedback',

  // recentEdits: recent edits (~20 keys)
  recentEdits: 'recentEdits',
};

/**
 * Resolve a namespace from a prefix
 */
function getNamespace(key) {
  const prefix = key.split('.')[0];
  return PREFIX_TO_NAMESPACE[prefix] || 'misc';
}

/**
 * Optionally remove the namespace prefix from a key
 * Currently disabled to preserve the existing key format
 */
function getKeyWithinNamespace(key) {
  // Keep the full key for backward compatibility
  return key;
}

/**
 * Split one language file into namespace files
 */
function splitLanguage(lang) {
  const inputPath = path.join(LOCALES_DIR, `${lang}.json`);
  const outputDir = path.join(LOCALES_DIR, lang);

  // Load the legacy single-file locale
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  // Create the output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Bucket entries by namespace
  const namespaceData = {};
  for (const ns of [...NAMESPACES, 'misc']) {
    namespaceData[ns] = {};
  }

  for (const [key, value] of Object.entries(data)) {
    const ns = getNamespace(key);
    const nsKey = getKeyWithinNamespace(key);
    namespaceData[ns][nsKey] = value;
  }

  // Write one file per namespace
  const stats = {};
  for (const [ns, nsData] of Object.entries(namespaceData)) {
    const keyCount = Object.keys(nsData).length;
    if (keyCount === 0) continue;

    const outputPath = path.join(outputDir, `${ns}.json`);

    // Sort keys
    const sorted = {};
    for (const key of Object.keys(nsData).sort()) {
      sorted[key] = nsData[key];
    }

    fs.writeFileSync(outputPath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    stats[ns] = keyCount;
  }

  return stats;
}

/**
 * Main entry point
 */
function main() {
  console.log('Starting i18n namespace split...\n');
  console.log(`Target languages: ${LANGUAGES.join(', ')}`);
  console.log(`Namespace count: ${NAMESPACES.length + 1} (including misc)\n`);

  const allStats = {};

  for (const lang of LANGUAGES) {
    console.log(`\n=== ${lang} ===`);
    const stats = splitLanguage(lang);
    allStats[lang] = stats;

    for (const [ns, count] of Object.entries(stats)) {
      console.log(`  ${ns}: ${count} keys`);
    }
  }

  // Validate consistency
  console.log('\n=== Consistency check ===');
  const baseStats = allStats['en'];
  let consistent = true;

  for (const lang of LANGUAGES) {
    if (lang === 'en') continue;

    for (const ns of Object.keys(baseStats)) {
      const enCount = baseStats[ns] || 0;
      const langCount = allStats[lang][ns] || 0;

      if (enCount !== langCount) {
        console.log(`⚠️ ${lang}/${ns}: ${langCount} keys (en: ${enCount})`);
        consistent = false;
      }
    }
  }

  if (consistent) {
    console.log('✅ All languages have matching namespace key counts.');
  }

  // Print a summary
  console.log('\n=== Summary ===');
  let total = 0;
  for (const [ns, count] of Object.entries(baseStats)) {
    console.log(`${ns}: ${count} keys`);
    total += count;
  }
  console.log(`\nTotal ${total} keys → ${Object.keys(baseStats).length} namespaces`);
}

main();
