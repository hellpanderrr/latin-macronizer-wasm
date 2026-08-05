#!/usr/bin/env node
/**
 * Wordlist-gap miner (Phase 1).
 *
 * Feeds a corpus of real Latin verse (plain text, known meter) through the
 * macronizer. Any NON-BLANK line whose scansion comes back empty is a
 * candidate wordlist gap — a real verse MUST scan, so an empty result means
 * one of the word quantities is wrong or missing (the italorum case).
 *
 * For each failing line, re-runs the single line and dumps per-word accented
 * candidates so the culprit word is easy to spot.
 *
 * Usage: node test/miner-scansion.mjs
 * Corpus: test/data/corpus/<meter>/<file>.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
require('fake-indexeddb/auto');

// ---------- fetch shim ----------
const FILE_MAP = [
  [/rftagger-ldt\.model$/, path.join(ROOT, 'public/wasm/rftagger-ldt.model'), 'application/octet-stream'],
  [/rftagger\.wasm$/,     path.join(ROOT, 'public/wasm/rftagger.wasm'),     'application/wasm'],
  [/macrons\.txt$/,       path.join(ROOT, 'public/macrons.txt'),             'text/plain'],
  [/lemma-data\.json$/,   path.join(ROOT, 'src/data/lemma-data.json'),       'application/json'],
  [/lemmas\.json$/,       path.join(ROOT, 'src/data/lemmas.json'),           'application/json'],
  [/endings\.json$/,      path.join(ROOT, 'src/data/endings.json'),          'application/json'],
  [/meters\.json$/,       path.join(ROOT, 'src/data/meters.json'),           'application/json'],
];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const s = String(url);
  for (const [re, file, type] of FILE_MAP) {
    if (re.test(s.split('?')[0])) {
      return new Response(fs.readFileSync(file), { status: 200, headers: { 'Content-Type': type } });
    }
  }
  if (/cruncher\.(js|wasm|data)$/.test(s)) return new Response(null, { status: 404 });
  return realFetch(url);
};
globalThis.window = globalThis;
globalThis.self = globalThis;

const realFactory = require(path.join(ROOT, 'public/wasm/rftagger.js'));
globalThis.RFTaggerModule = (cfg = {}) => {
  Object.defineProperty(process, 'versions', { configurable: true, value: {} });
  try { return realFactory({ ...cfg, wasmBinary: fs.readFileSync(path.join(ROOT, 'public/wasm/rftagger.wasm')) }); }
  finally { Object.defineProperty(process, 'versions', realVersionsDesc); }
};
const realVersionsDesc = Object.getOwnPropertyDescriptor(process, 'versions');

const { Macronizer } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Macronizer.js');

// ---------- helpers ----------
// Strip macrons/breves → the engine expects unmarked text and re-derives quantity.
const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y' };
function stripMacrons(s) {
  return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch] || 'aeiouy'['AEIOUY'.indexOf(ch)] || ch);
}

const CORPUS = path.join(ROOT, 'test/data/corpus');

async function createMacronizer() {
  const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
  m.morpheusAnalyzer = null;
  m.wordlistEngine.setMorpheusAnalyzer({
    isInitialized: () => true,
    analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })),
  });
  await m.initialize();
  return m;
}

function runLine(m, line, meter) {
  return m.macronize(stripMacrons(line) + '\n', {
    macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter,
  });
}

async function main() {
  const m = await createMacronizer();
  const failures = [];

  // Walk corpus: <meter>/<file>.txt
  for (const meter of fs.readdirSync(CORPUS)) {
    const meterDir = path.join(CORPUS, meter);
    if (!fs.statSync(meterDir).isDirectory()) continue;
    if (!['dactylichexameter', 'hendecasyllable', 'elegiacdistichs', 'iambic'].includes(meter)) continue;

    for (const file of fs.readdirSync(meterDir)) {
      if (!file.endsWith('.txt')) continue;
      const text = fs.readFileSync(path.join(meterDir, file), 'utf-8');
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const joined = lines.join('\n');

      let result;
      try {
        result = await m.macronize(stripMacrons(joined), {
          macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter,
        });
      } catch (e) {
        console.log(`[ERROR] ${file}: ${e.message}`);
        continue;
      }

      const feet = result.scannedFeet || [];
      // scannedFeet aligns to the newline structure of the *joined* text (each line = 1 verse).
      for (let i = 0; i < lines.length; i++) {
        const foot = feet[i];
        if (foot === undefined || foot === '') {
          failures.push({ file, meter, lineIdx: i, line: lines[i] });
        }
      }
    }
  }

  // Per-file summary
  const byFile = {};
  for (const f of failures) byFile[f.file] = (byFile[f.file] || 0) + 1;
  console.log('\n=== Failure count by file ===');
  for (const [file, n] of Object.entries(byFile).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${n.toString().padStart(4)}  ${file}`);
  }

  // Report + deep-dive each failure
  console.log(`\n=== ${failures.length} failing lines across corpus ===\n`);
  for (const f of failures) {
    console.log(`--- ${f.file} (${f.meter}) line ${f.lineIdx + 1} ---`);
    console.log(`    ${f.line}`);
    // Re-run single line and dump per-word accents (taggedTokens carries accented forms)
    try {
      const r = await runLine(m, f.line, f.meter);
      const words = [];
      for (const t of (r.taggedTokens || [])) {
        if (t.isWord) {
          words.push(`"${t.text}" → [${(t.accented || []).join(', ')}]${t.isUnknown ? ' (UNKNOWN)' : ''}`);
        }
      }
      console.log(`    words: ${words.join('  ')}`);
    } catch (e) {
      console.log(`    (re-run failed: ${e.message})`);
    }
  }

  m.destroy();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
