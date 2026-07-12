// Full-pipeline parity test vs the Python macronizer — pure Node, no browser.
//
// Runs the real built pipeline (dist/): WASM RFTagger + IndexedDB wordlist
// (via fake-indexeddb) on test/data/caesar.txt and requires the output to be
// byte-identical to the Python reference test/data/py-output.txt
// (produced by `python macronize.py` on the same input, Morpheus available).
//
// Usage: node test/e2e/parity-node.mjs   (or: npm run test:parity)
// Exit code 0 = exact match, 1 = mismatch or error.
// Takes ~1 min: 812k wordlist rows are loaded into an in-memory IndexedDB.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
require('fake-indexeddb/auto'); // registers globalThis.indexedDB / IDBKeyRange

// ---------- fetch shim: serve local files for the URLs the engines request ----------
const FILE_MAP = [
  [/rftagger-ldt\.model$/, path.join(ROOT, 'public/wasm/rftagger-ldt.model'), 'application/octet-stream'],
  [/rftagger\.wasm$/, path.join(ROOT, 'public/wasm/rftagger.wasm'), 'application/wasm'],
  [/macrons\.txt$/, path.join(ROOT, 'public/macrons.txt'), 'text/plain'],
  [/lemma-data\.json$/, path.join(ROOT, 'src/data/lemma-data.json'), 'application/json'],
  [/lemmas\.json$/, path.join(ROOT, 'src/data/lemmas.json'), 'application/json'],
  [/endings\.json$/, path.join(ROOT, 'src/data/endings.json'), 'application/json'],
  [/meters\.json$/, path.join(ROOT, 'src/data/meters.json'), 'application/json'],
];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const s = String(url);
  for (const [re, file, type] of FILE_MAP) {
    if (re.test(s.split('?')[0])) {
      const buf = fs.readFileSync(file);
      return new Response(buf, { status: 200, headers: { 'Content-Type': type } });
    }
  }
  if (/cruncher\.(js|wasm|data)$/.test(s)) {
    return new Response(null, { status: 404 }); // Morpheus WASM is web-only
  }
  return realFetch(url, opts);
};

// ---------- browser-ish shims for the web-only Emscripten glue ----------
globalThis.window = globalThis;
globalThis.self = globalThis;

// The web-only glue can't resolve the .wasm URL under Node (no location);
// inject wasmBinary directly and hide process.versions.node ONLY while the
// glue's environment detection runs — Node's own fetch/Response (undici)
// lazily reads process.versions.node and crashes if it stays hidden.
const realFactory = require(path.join(ROOT, 'public/wasm/rftagger.js'));
const wasmBinary = fs.readFileSync(path.join(ROOT, 'public/wasm/rftagger.wasm'));
const realVersionsDesc = Object.getOwnPropertyDescriptor(process, 'versions');
globalThis.RFTaggerModule = (cfg = {}) => {
  Object.defineProperty(process, 'versions', { configurable: true, value: {} });
  try {
    return realFactory({ ...cfg, wasmBinary });
  } finally {
    Object.defineProperty(process, 'versions', realVersionsDesc);
  }
};

const { Macronizer } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Macronizer.js');

const caesar = fs.readFileSync(path.join(ROOT, 'test/data/caesar.txt'), 'utf8');
const pyRef = fs.readFileSync(path.join(ROOT, 'test/data/py-output.txt'), 'utf8');

const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
// Benchmark words missing from macrons.txt: que (enclitic — the accent path
// short-circuits, wordlist never consulted), m/ccxl/clxxx (no vowels, nothing
// to mark). Python inserts a NULL row for Morpheus-unknown words → unknown
// path, identical to returning zero analyses here.
m.morpheusAnalyzer = null;
m.wordlistEngine.setMorpheusAnalyzer({
  isInitialized: () => true,
  analyzeBatch: (words) => words.map((w) => ({ word: w, success: false, analyses: [] })),
});

console.error('initializing (WASM + wordlist into fake-indexeddb)...');
const t0 = Date.now();
await m.initialize();
console.error(`initialized in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const t1 = Date.now();
const result = await m.macronize(caesar, {
  macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: 'prose'
});
console.error(`macronized in ${Date.now() - t1}ms`);

// ---------- compare ----------
const norm = (s) => s.replace(/\r/g, '').replace(/\n+$/, '');
const a = norm(pyRef);
const b = norm(result.macronized);
if (a === b) {
  console.log('=== E2E PARITY: EXACT MATCH ===');
  console.log(`${a.length} characters identical`);
  process.exit(0);
} else {
  const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'macronizer-parity-')), 'ts-out.txt');
  fs.writeFileSync(outFile, result.macronized, 'utf8');
  console.log('=== E2E MISMATCH ===');
  console.log(`py len=${a.length} ts len=${b.length}; TS output saved to ${outFile}`);
  // word-level diff (first 30 divergences)
  const wa = a.match(/[^\s]+|\s+/g) ?? [];
  const wb = b.match(/[^\s]+|\s+/g) ?? [];
  let i = 0, j = 0, shown = 0;
  while ((i < wa.length || j < wb.length) && shown < 30) {
    if (wa[i] === wb[j]) { i++; j++; continue; }
    let found = false;
    for (let d = 1; d <= 4 && !found; d++) {
      if (wa[i + d] === wb[j]) { console.log(`  py extra: ${JSON.stringify(wa.slice(i, i + d).join(''))}`); i += d; found = true; }
      else if (wa[i] === wb[j + d]) { console.log(`  ts extra: ${JSON.stringify(wb.slice(j, j + d).join(''))}`); j += d; found = true; }
    }
    if (!found) { console.log(`  py=${JSON.stringify(wa[i])} ts=${JSON.stringify(wb[j])}`); i++; j++; }
    shown++;
  }
  process.exit(1);
}
