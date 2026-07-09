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

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  --help, -h      Show this help

Examples:
  node cli.mjs "Gallia est omnis divisa in partes tres"
  cat input.txt | node cli.mjs --scan hexameter
`);
  process.exit(0);
}

let scanMode = 'prose';
let inputArg = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scan' && i + 1 < args.length) {
    scanMode = args[++i];
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
  useMorpheus: false,
  enableCache: true,
  wordlistMode: 'memory',
  lemmaData,
  endingData,
});

const startTime = Date.now();
await macronizer.initialize((pct, msg) => {
  console.error(`  ${pct}% — ${msg}`);
});

// ─── Load wordlist from file ──────────────────────────────────────────
const wordlistPath = join(__dirname, 'public', 'macrons.txt');
const wordlistText = readFileSync(wordlistPath, 'utf-8');
console.error('Loading wordlist...');
await macronizer.loadWordlistFromText(wordlistText, (progress) => {
  console.error(`  ${progress.phase}: ${progress.current}/${progress.total}`);
});
console.error(
  `Wordlist: ${macronizer.getWordlistEngine().size().toLocaleString()} entries`
);

// ─── Process ──────────────────────────────────────────────────────────
console.error('Processing...');

const result = await macronizer.macronize(text, { scan: scanMode });

// Output macronized text to stdout (pipe-friendly)
process.stdout.write(result.macronized + '\n');

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
