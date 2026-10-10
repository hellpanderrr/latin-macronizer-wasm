#!/usr/bin/env node
/**
 * Latin Macronizer — Node.js CLI
 *
 * Uses FallbackTagger (pure JS suffix-rule POS tagging) + memory wordlist.
 * No browser, no WASM needed — works entirely in Node.js.
 *
 * Usage:
 *   node cli.mjs "Gallia est omnis divisa in partes tres"
 *   echo "Gallia est omnis divisa" | node cli.mjs
 *   node cli.mjs --scan hexameter < input.txt
 *   node cli.mjs --help
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The WordlistEngine persists to IndexedDB; in Node that store must be shimmed
// (same shim the parity test uses).
const require = createRequire(join(__dirname, 'package.json'));
require('fake-indexeddb/auto');

// Dynamic import the dist module (ESM-compatible with our package.json "type": "module")
const { Macronizer } = await import(
  pathToFileURL(join(__dirname, 'dist', 'core', 'Macronizer.js')).href
);

// ─── Parse args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Latin Macronizer — CLI

  node cli.mjs [options] ["Latin text"]

Options:
  --scan <meter>  Scan verse meter (hexameter, pentameter, elegiac,
                  hendecasyllable, iambic, or 'prose' for no scansion)
  --accent        Mark the stress accent (liturgical prose rules). Output is
                  accent-only (sanctificétur) unless --macrons is also given.
  --macrons       Keep the macrons in the output (with --accent: both marks,
                  sānctificḗtur; without: plain macronized text)
  --help, -h      Show this help

Examples:
  node cli.mjs "Gallia est omnis divisa in partes tres"
  node cli.mjs --accent "sanctificetur nomen tuum"
  node cli.mjs --accent --macrons "sanctificetur nomen tuum"
  cat input.txt | node cli.mjs --scan hexameter
`);
  process.exit(0);
}

let scanMode = 'prose';
let accent = false;
let macrons = false;
let inputArg = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scan' && i + 1 < args.length) {
    scanMode = args[++i];
  } else if (args[i] === '--accent') {
    accent = true;
  } else if (args[i] === '--macrons') {
    macrons = true;
  } else if (!args[i].startsWith('--')) {
    inputArg = args[i];
  }
}

// ─── Read input ───────────────────────────────────────────────────────
let text;
if (inputArg) {
  text = inputArg;
} else {
  try {
    text = readFileSync(0, 'utf-8');
  } catch {
    console.error('Provide text as argument or pipe to stdin.');
    process.exit(1);
  }
}
text = text.trim();
if (!text) process.exit(0);

// ─── Initialize macronizer ────────────────────────────────────────────
console.error('Initializing (FallbackTagger + memory wordlist)...');

// Pre-load JSON data to avoid file:// fetch on Windows Node.js
const dataDir = join(__dirname, 'dist', 'data');
let lemmaData, endingData;
try {
  lemmaData = JSON.parse(readFileSync(join(dataDir, 'lemmas.json'), 'utf-8'));
  endingData = JSON.parse(readFileSync(join(dataDir, 'endings.json'), 'utf-8'));
} catch (e) {
  console.error(`Could not load data files: ${e.message}`);
  process.exit(1);
}

const macronizer = new Macronizer({
  useWasm: false,
  enableCache: true,
});

// The Morpheus analyzer is browser-only (its WASM glue needs `document`), so
// under Node it is disabled exactly like the parity test does. Without this,
// initialize() throws before any text is processed. The WordlistEngine still
// needs a stub: words missing from macrons.txt go through ensureAnalyzed(),
// which throws when the analyzer is null. The stub reports no analyses, which
// is exactly Python's NULL-row behavior for Morpheus-unknown words.
macronizer.morpheusAnalyzer = null;
macronizer.wordlistEngine.setMorpheusAnalyzer({
  isInitialized: () => true,
  analyzeBatch: (words) => words.map((w) => ({ word: w, success: false, analyses: [] })),
});

const startTime = Date.now();
await macronizer.initialize((pct, msg) => {
  console.error(`  ${pct}% — ${msg}`);
});

// ─── Load wordlist from file ──────────────────────────────────────────
// Directly on the engine's wordlist (the wrapper method is browser-oriented:
// it fetches over HTTP). TypeScript's `private` is erased at runtime.
const wordlistPath = join(__dirname, 'public', 'macrons.txt');
const wordlistText = readFileSync(wordlistPath, 'utf-8');
console.error('Loading wordlist...');
await macronizer.wordlistEngine.loadFromText(wordlistText);
console.error(
  `Wordlist: ${macronizer.wordlistEngine.size().toLocaleString()} entries`
);

// ─── Process ──────────────────────────────────────────────────────────
console.error('Processing...');

// --accent alone means the liturgical use case: the acute WITHOUT macrons
// (sanctificétur), as the help describes. --macrons keeps them, and with
// --accent the engine composes both on one vowel (sānctificḗtur).
const result = await macronizer.macronize(text, {
  scan: scanMode,
  accent,
  macronize: accent ? macrons : true,
});

// Output macronized (or stressed) text to stdout (pipe-friendly)
process.stdout.write((accent ? result.stressed : result.macronized) + '\n');

// Metadata to stderr (doesn't interfere with pipe)
if (result.scannedFeet?.length) {
  console.error('\nScansion:');
  result.scannedFeet.forEach((f, i) => console.error(`  Line ${i + 1}: ${f}`));
}

const elapsed = Date.now() - startTime;
console.error(
  `\nDone: ${elapsed}ms ` +
  `(${result.processingTime.toFixed(0)}ms process) ` +
  `| ${result.statistics.totalWords} words ` +
  `| ${(result.confidence * 100).toFixed(0)}% confidence`
);

macronizer.destroy();
