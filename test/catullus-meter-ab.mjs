#!/usr/bin/env node
/**
 * M-023m meter A/B probe: for every file in the gold `iambic/` bin, scan it
 * once per candidate meter template and count incomplete scans. If a file
 * fails hard as 'iambic' but nearly all-lines-pass as 'hendecasyllable',
 * the bin label is wrong and every blocker reported for it is noise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
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
globalThis.window = globalThis; globalThis.self = globalThis;
const realFactory = require(path.join(ROOT, 'public/wasm/rftagger.js'));
const rvd = Object.getOwnPropertyDescriptor(process, 'versions');
globalThis.RFTaggerModule = (cfg = {}) => {
  Object.defineProperty(process, 'versions', { configurable: true, value: {} });
  try { return realFactory({ ...cfg, wasmBinary: fs.readFileSync(path.join(ROOT, 'public/wasm/rftagger.wasm')) }); }
  finally { Object.defineProperty(process, 'versions', rvd); }
};
const { Macronizer } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Macronizer.js');

const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y',
  'ă':'a','ĕ':'e','ĭ':'i','ŏ':'o','ŭ':'u','Ă':'A','Ĕ':'E','Ĭ':'I','Ŏ':'O','Ŭ':'U' };
function stripMarks(s) { return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch]); }

function isIncompleteScan(feet, meter) {
  if (feet === undefined || feet === '') return true;
  switch (meter) {
    case 'hendecasyllable': return feet.length < 11;
    case 'iambic': return feet.length < 12;
    default: return false;
  }
}

const BINS = process.argv[2] ? [process.argv[2]] : ['iambic', 'hendecasyllable'];
const GOLD = path.join(ROOT, 'test/data/gold/catullus');
for (const bin of BINS) {
  const dir = path.join(GOLD, bin);
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.txt'))) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8').split('\n');
    if (raw.length && raw[raw.length - 1].trim() === '') raw.pop();
    const lines = raw.map(l => l.trim());
    const verse = [];
    for (const l of lines) if (/[a-zA-Z]/.test(l)) verse.push(l);
    const text = verse.join('\n');
    const out = {};
    const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
    m.morpheusAnalyzer = null;
    m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })) });
    await m.initialize();
    for (const meter of ['iambic', 'hendecasyllable']) {
      let fails = 0;
      try {
        const res = await m.macronize(stripMarks(text), { macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter });
        const feet = res.scannedFeet || [];
        for (let i = 0; i < verse.length; i++) if (isIncompleteScan(feet[i], meter)) fails++;
      } catch (e) { out[meter] = `ERR:${e.message}`; continue; }
      out[meter] = `${fails}/${verse.length}`;
    }
    m.destroy();
    const flag = out.iambic !== out.hendecasyllable ? '  <-- meter-dependent' : '';
    console.log(`${bin}/${file}: as-iambic ${out.iambic}  as-hendec ${out.hendecasyllable}${flag}`);
  }
}
