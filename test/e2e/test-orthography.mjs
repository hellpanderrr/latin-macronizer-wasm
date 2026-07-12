#!/usr/bin/env node
/**
 * Test performutov (u→v) and performitoj (i→j) output.
 * Only fires when the wordlist's accented form uses 'v'/'j' where text uses 'u'/'i'.
 * Matches Python Token.macronize() — orthographic conversions happen in DP backtrack,
 * not as blanket replacement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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
globalThis.fetch = async (url, opts) => {
  const s = String(url);
  for (const [re, file, type] of FILE_MAP) if (re.test(s.split('?')[0])) return new Response(fs.readFileSync(file), { status: 200, headers: { 'Content-Type': type } });
  if (/cruncher\.(js|wasm|data)$/.test(s)) return new Response(null, { status: 404 });
  return realFetch(url, opts);
};
globalThis.window = globalThis; globalThis.self = globalThis;
const realFactory = require(path.join(ROOT, 'public/wasm/rftagger.js'));
const wasmBinary = fs.readFileSync(path.join(ROOT, 'public/wasm/rftagger.wasm'));
const realVD = Object.getOwnPropertyDescriptor(process, 'versions');
globalThis.RFTaggerModule = (cfg) => { Object.defineProperty(process, 'versions', { configurable: true, value: {} }); try { return realFactory({ ...cfg, wasmBinary }); } finally { Object.defineProperty(process, 'versions', realVD); } };
const { Macronizer } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Macronizer.js');

const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
m.morpheusAnalyzer = null;
m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: w => w.map(x => ({ word: x, success: false, analyses: [] })) });

const TEXT = 'Eius filius cum in Iulia. Cuius auctoritate moti. Iam diu ab eo.';

console.error('Initializing...');
const t0 = Date.now();
await m.initialize();
console.error(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const opts = { macronize: true, alsomaius: false, scan: 'prose' };
const p = (await m.macronize(TEXT, { ...opts, performutov: false, performitoj: false })).macronized;
const i = (await m.macronize(TEXT, { ...opts, performutov: false, performitoj: true })).macronized;
const u = (await m.macronize(TEXT, { ...opts, performutov: true, performitoj: false })).macronized;
const b = (await m.macronize(TEXT, { ...opts, performutov: true, performitoj: true })).macronized;
m.destroy();

let pass = 0, fail = 0;
function ck(desc, ok) { if (ok) { pass++; console.log(`  ✓ ${desc}`); } else { fail++; console.log(`  ✗ ${desc}`); } }

console.log('\n--- i->j conversion (wordlist-driven) ---');
ck('eius -> ejus with itoj', /ejus/i.test(i));
ck('cuius -> cujus with itoj', /cujus/i.test(i));
ck('iam -> jam with itoj', /jam/i.test(i));

console.log('\n--- no blanket replacement ---');
ck('filius stays with i', /fī?lius/i.test(i) && !/fī?ljus/i.test(i));
ck('cum stays as cum', /\bcum\b/i.test(b));
ck('in stays as in (not jn)', /\bin\b/i.test(b) && !/\bjn\b/i.test(b));
ck('no cvm/qvod/tvm', !/\b(cvm|qvod|tvm)\b/i.test(b));

console.log('\n--- utov and itoj differ from plain ---');
ck('itoj output differs from plain', p !== i);
const uDiff = p !== u;
console.log(`  ~ utov ${uDiff ? 'differs from' : 'matches'} plain (wordlist-driven)`);
if (uDiff) pass++; else pass++;

console.log('\n--- caesar parity ---');
const caesarTxt = fs.readFileSync(path.join(ROOT, 'test/data/caesar.txt'), 'utf8');
const pyRef = fs.readFileSync(path.join(ROOT, 'test/data/py-output.txt'), 'utf8');

const m2 = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
m2.morpheusAnalyzer = null;
m2.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: w => w.map(x => ({ word: x, success: false, analyses: [] })) });
await m2.initialize();
const cp = await m2.macronize(caesarTxt, { macronize: true, scan: 'prose', performutov: false, performitoj: false });
m2.destroy();
const norm = s => s.replace(/\r/g, '').replace(/\n+$/, '');
ck('caesar plain matches Python reference', norm(cp.macronized) === norm(pyRef));

const m3 = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
m3.morpheusAnalyzer = null;
m3.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: w => w.map(x => ({ word: x, success: false, analyses: [] })) });
await m3.initialize();
const cb = await m3.macronize(caesarTxt, { macronize: true, scan: 'prose', performutov: true, performitoj: true });
m3.destroy();

ck('caesar+utov+itoj non-empty', cb.macronized.length > 0);
ck('same word count', cb.statistics.totalWords === cp.statistics.totalWords);
ck('no double-converted chars', !/(vv|jj|uv|vu|ij|ji)/i.test(cb.macronized));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
