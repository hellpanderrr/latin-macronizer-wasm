#!/usr/bin/env node
/**
 * Direct Python vs TS macronizer comparison.
 *
 * Reads Python output saved by Docker and TS output from a Node.js run,
 * does character-by-character comparison.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const CAESAR = join(ROOT, 'test', 'data', 'caesar.txt');
const PY_OUT = join(ROOT, 'test', 'data', 'py-output.txt');
const TS_OUT = join(ROOT, 'test', 'data', 'ts-output.txt');

// --- Load Python output ---
const pyText = readFileSync(PY_OUT, 'utf-8').replace(/\r/g, '').replace(/\n$/, '');
const inputText = readFileSync(CAESAR, 'utf-8').replace(/\r/g, '').replace(/\n$/, '').trim();

console.log(`Python output: ${pyText.length} chars`);
console.log(`Input text:    ${inputText.length} chars`);

// --- Load and run TS macronizer ---
// Patch fetch for Node.js
const lemmaPath = join(ROOT, 'dist', 'data', 'lemmas.json');
const endingPath = join(ROOT, 'dist', 'data', 'endings.json');
const macronsPath = join(ROOT, 'public', 'macrons.txt');

const lemmaData = JSON.parse(readFileSync(lemmaPath, 'utf-8'));
const endingData = JSON.parse(readFileSync(endingPath, 'utf-8'));
const macronsText = readFileSync(macronsPath, 'utf-8');

// Patch global fetch for data files
const originalFetch = globalThis.fetch;
globalThis.fetch = async function(url) {
  const urlStr = typeof url === 'string' ? url : url?.href || url?.toString() || '';
  if (urlStr.includes('lemmas.json')) {
    return { ok: true, json: async () => lemmaData };
  }
  if (urlStr.includes('endings.json')) {
    return { ok: true, json: async () => endingData };
  }
  // Fall through — will fail
  throw new Error(`fetch not mocked for: ${urlStr}`);
};

// Patch indexedDB for Node
if (!globalThis.indexedDB) {
  globalThis.indexedDB = {
    open: () => {
      const request = {
        onerror: null, onsuccess: null, onupgradeneeded: null,
        result: {
          objectStoreNames: { contains: () => false },
          createObjectStore: () => ({}),
          close: () => {},
        },
        error: null,
      };
      // Reject immediately — WordlistEngine will use in-memory fallback
      setTimeout(() => { if (request.onerror) request.onerror({target: {error: new Error('No IndexedDB')}}); }, 0);
      return request;
    }
  };
}

// Run TS
console.error('Loading TS Macronizer...');
const { Macronizer } = await import(
  pathToFileURL(join(ROOT, 'dist', 'core', 'Macronizer.js')).href
);

const macronizer = new Macronizer({
  useWasm: false,
  enableCache: false,
  confidenceThreshold: 0.80,
  wordlistUrl: 'file://fake', // Won't be loaded since we inject manually
});

// Don't inject data directly — use the mocked fetch path instead.
// The fetch path handles the format correctly (lemmas.json only has lemma+frequency,
// whereas the direct-data path expects macronized+tags too).

// Now initialize (will skip Morpheus since WASM not available, wordlist empty)
try {
  await macronizer.initialize(() => {});
} catch (e) {
  console.error('Init error (expected in Node):', e.message?.slice(0, 100));
}

// Load wordlist directly
console.error('Loading wordlist...');
const wordlistEngine = macronizer.wordlistEngine || macronizer['wordlistEngine'];
if (wordlistEngine && wordlistEngine.loadFromText) {
  await wordlistEngine.loadFromText(macronsText);
}

// Run macronization
console.error('Macronizing...');
const start = performance.now();
const result = await macronizer.macronize(inputText, { scan: 'prose' });
const elapsed = (performance.now() - start).toFixed(0);

const tsText = result.macronized.replace(/\r/g, '').replace(/\n$/, '');
writeFileSync(TS_OUT, tsText, 'utf-8');
console.log(`TS completed in ${elapsed}ms (${tsText.length} chars)`);

// --- COMPARISON ---
console.log('\n' + '='.repeat(70));
console.log('CHARACTER-BY-CHARACTER COMPARISON: Python vs TypeScript');
console.log('='.repeat(70));

const maxLen = Math.max(pyText.length, tsText.length);
let match = 0, totalCompared = 0;
let macronMismatches = [];
let nonMacronDiffs = [];

for (let i = 0; i < maxLen; i++) {
  const pc = pyText[i] || '';
  const tc = tsText[i] || '';
  if (!pc || !tc) {
    nonMacronDiffs.push({ pos: i, py: JSON.stringify(pc), ts: JSON.stringify(tc), type: 'length' });
    continue;
  }
  totalCompared++;
  if (pc === tc) { match++; continue; }

  if (/[āēīōūȳĀĒĪŌŪȲ]/.test(pc) || /[āēīōūȳĀĒĪŌŪȲ]/.test(tc)) {
    const startCtx = Math.max(0, i - 30);
    const endCtx = Math.min(pyText.length, i + 30);
    let ctx = pyText.slice(startCtx, endCtx).replace(/\n/g, '↵');
    if (startCtx > 0) ctx = '…' + ctx;
    if (endCtx < pyText.length) ctx += '…';
    macronMismatches.push({ pos: i, py: pc, ts: tc, ctx });
  } else {
    nonMacronDiffs.push({ pos: i, py: pc, ts: tc });
  }
}

console.log(`\nLengths:     Python=${pyText.length}  TS=${tsText.length}`);
console.log(`Compared:    ${totalCompared} chars`);
console.log(`Exact match: ${match}/${totalCompared} = ${(match/totalCompared*100).toFixed(2)}%`);
console.log(`Macron diffs: ${macronMismatches.length}`);
console.log(`Other diffs:  ${nonMacronDiffs.length}`);

if (macronMismatches.length > 0) {
  console.log(`\n--- MACRON MISMATCHES (first 40) ---`);
  for (const d of macronMismatches.slice(0, 40)) {
    console.log(`  [${String(d.pos).padStart(4)}] Py='${d.py}' TS='${d.ts}'  "${d.ctx}"`);
  }
  if (macronMismatches.length > 40) console.log(`  ... and ${macronMismatches.length - 40} more`);
}

if (nonMacronDiffs.length > 0) {
  console.log(`\n--- NON-MACRON DIFFS ---`);
  // Group by type
  const byType = {};
  for (const d of nonMacronDiffs) {
    const key = d.type || `${d.py}→${d.ts}`;
    if (!byType[key]) byType[key] = [];
    byType[key].push(d);
  }
  for (const [key, diffs] of Object.entries(byType)) {
    console.log(`  ${diffs.length}x: ${key}`);
    if (diffs.length <= 5) {
      for (const d of diffs) console.log(`    [${d.pos}] Py=${d.py} TS=${d.ts}`);
    }
  }
}

// --- Summary stats ---
const pyWords = pyText.split(/[^a-zA-ZāēīōūȳĀĒĪŌŪȲ]+/).filter(Boolean);
const tsWords = tsText.split(/[^a-zA-ZāēīōūȳĀĒĪŌŪȲ]+/).filter(Boolean);
let wordMatch = 0;
for (let i = 0; i < Math.min(pyWords.length, tsWords.length); i++) {
  if (pyWords[i] === tsWords[i]) wordMatch++;
}
console.log(`\n--- WORD-LEVEL ---`);
console.log(`Python words: ${pyWords.length}  TS words: ${tsWords.length}`);
console.log(`Word match:   ${wordMatch}/${Math.min(pyWords.length, tsWords.length)} = ${(wordMatch/Math.min(pyWords.length, tsWords.length)*100).toFixed(1)}%`);

// Restore
globalThis.fetch = originalFetch;
macronizer.destroy();
