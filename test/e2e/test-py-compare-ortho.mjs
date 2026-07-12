#!/usr/bin/env node
/**
 * Byte-level comparison of TS vs Python (Docker) for all orthography flag combos.
 * Uses the real WASM+IDB pipeline, same as parity-node.mjs.
 *
 * Usage: node test/e2e/test-py-compare-ortho.mjs
 * Requires: Docker image macronizer-py-compare built
 *   (docker build -t macronizer-py-compare -f native/build/Dockerfile.py-compare .)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
require('fake-indexeddb/auto');

// fetch shim (same as parity-node.mjs)
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

const TEXT = fs.readFileSync(path.join(ROOT, 'test/data/caesar.txt'), 'utf8');

const COMBOS = [
  { label: 'default',           args: '',                     m: true, a: false, u: false, j: false },
  { label: 'utov',              args: '--utov',               m: true, a: false, u: true,  j: false },
  { label: 'itoj',              args: '--itoj',               m: true, a: false, u: false, j: true  },
  { label: 'utov+itoj',         args: '--utov --itoj',        m: true, a: false, u: true,  j: true  },
  { label: 'maius',             args: '--maius',              m: true, a: true,  u: false, j: false },
  { label: 'nomacrons',         args: '--nomacrons',          m: false,a: false, u: false, j: false },
  { label: 'nomacrons+utov',    args: '--nomacrons --utov',   m: false,a: false, u: true,  j: false },
];

function runPython(text, args) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'py-comp-'));
  const inFile = path.join(tmp, 'in.txt');
  const outFile = path.join(tmp, 'out.txt');
  fs.writeFileSync(inFile, text, 'utf8');
  execSync(`docker run --rm -i macronizer-py-compare ${args} < "${inFile}" > "${outFile}"`, { timeout: 300000, maxBuffer: 10*1024*1024 });
  const out = fs.readFileSync(outFile, 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

async function runTS(text, opts) {
  const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
  m.morpheusAnalyzer = null;
  m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: w => w.map(x => ({ word: x, success: false, analyses: [] })) });
  await m.initialize();
  const r = await m.macronize(text, { macronize: opts.m, alsomaius: opts.a, performutov: opts.u, performitoj: opts.j, scan: 'prose' });
  m.destroy();
  return r.macronized;
}

const norm = s => s.replace(/\r/g, '').replace(/\n+$/, '');
let pass = 0, fail = 0;

for (const combo of COMBOS) {
  process.stderr.write(`[${combo.label}] Python... `);
  let pyOut;
  try { pyOut = runPython(TEXT, combo.args); } catch (e) { process.stderr.write(`ERROR: ${e.message.slice(0,60)}\n`); fail++; continue; }
  process.stderr.write(`TS... `);
  let tsOut;
  try { tsOut = await runTS(TEXT, combo); } catch (e) { process.stderr.write(`ERROR: ${e.message.slice(0,60)}\n`); fail++; continue; }

  const pn = norm(pyOut);
  const tn = norm(tsOut);

  if (pn === tn) {
    process.stderr.write(`MATCH (${pn.length} chars)\n`);
    console.log(`  ✓ ${combo.label}`);
    pass++;
  } else {
    process.stderr.write(`MISMATCH\n`);
    console.log(`  ✗ ${combo.label}`);
    const minLen = Math.min(pn.length, tn.length);
    let diffAt = 0;
    for (let i = 0; i < minLen; i++) { if (pn[i] !== tn[i]) { diffAt = i; break; } }
    if (diffAt === 0 && pn.length !== tn.length) diffAt = minLen;
    console.log(`    Python len=${pn.length} TS len=${tn.length}, first diff at ${diffAt}`);
    console.log(`    Python: ...${JSON.stringify(pn.slice(Math.max(0,diffAt-15), diffAt+25))}`);
    console.log(`    TS:     ...${JSON.stringify(tn.slice(Math.max(0,diffAt-15), diffAt+25))}`);
    fail++;
  }
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
