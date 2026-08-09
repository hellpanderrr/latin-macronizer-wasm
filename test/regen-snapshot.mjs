#!/usr/bin/env node
/**
 * Regenerate test/data/scansion-failures-snapshot.json from current state.
 * Run after an INTENDED engine improvement that fixes failing lines.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SNAPSHOT = path.join(ROOT, 'test/data/scansion-failures-snapshot.json');
const require = createRequire(import.meta.url);
require('fake-indexeddb/auto');

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
globalThis.fetch = async (url) => {
  const s = String(url);
  for (const [re, file, type] of FILE_MAP) {
    if (re.test(s.split('?')[0])) return new Response(fs.readFileSync(file), { status: 200, headers: { 'Content-Type': type } });
  }
  if (/cruncher\.(js|wasm|data)$/.test(s)) return new Response(null, { status: 404 });
  return realFetch(url);
};
globalThis.window = globalThis;
globalThis.self = globalThis;
const realFactory = require(path.join(ROOT, 'public/wasm/rftagger.js'));
const realVersionsDesc = Object.getOwnPropertyDescriptor(process, 'versions');
globalThis.RFTaggerModule = (cfg = {}) => {
  Object.defineProperty(process, 'versions', { configurable: true, value: {} });
  try { return realFactory({ ...cfg, wasmBinary: fs.readFileSync(path.join(ROOT, 'public/wasm/rftagger.wasm')) }); }
  finally { Object.defineProperty(process, 'versions', realVersionsDesc); }
};
const { Macronizer } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Macronizer.js');

const CORPUS = path.join(ROOT, 'test/data/corpus');
const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y' };
function stripMacrons(s) {
  return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch] || 'aeiouy'['AEIOUY'.indexOf(ch)] || ch);
}
function normalizeLine(line) {
  return stripMacrons(line).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function createMacronizer() {
  const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
  m.morpheusAnalyzer = null;
  m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })) });
  await m.initialize();
  return m;
}

async function main() {
  const m = await createMacronizer();
  const failures = [];
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
        result = await m.macronize(stripMacrons(joined), { macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter });
      } catch (e) {
        failures.push({ file, meter, line: `[ERROR: ${e.message}]`, norm: `__error_${file}__` });
        continue;
      }
      const feet = result.scannedFeet || [];
      for (let i = 0; i < lines.length; i++) {
        if (feet[i] === undefined || feet[i] === '') {
          failures.push({ file, meter, line: lines[i], norm: normalizeLine(lines[i]) });
        }
      }
    }
  }
  fs.writeFileSync(SNAPSHOT, JSON.stringify(failures, null, 1));
  console.log(`Wrote ${failures.length} failing lines to ${SNAPSHOT}`);
  m.destroy();
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
