#!/usr/bin/env node
/**
 * Catullus gold diagnostic (M-023m): find WORDLIST QUANTITY BUGS using the
 * negenborn full-Catullus scansion gold.
 *
 * Method (the M-013 gold-quantity experiment, adapted to the macron/breve gold):
 *  1. Scan each corpus line with the engine. Lines that scan to FULL meter are
 *     metrically satisfied — not actionable.
 *  2. For each line that FAILS to scan (incomplete feet), compare each word's
 *     GOLD syllable pattern (macron=long, breve=short on the marked vowels)
 *     against the engine's ACHIEVABLE patterns (possibleScans(cands, seg)).
 *  3. A word whose gold pattern is NOT achievable by any engine candidate is a
 *     WORDLIST QUANTITY BUG — the engine lacks the reading the meter needs.
 *     These are the actionable fixes (ACCENT_OVERRIDES / wordlist edits).
 *
 * Usage (per-file process, memory-safe):
 *   node test/catullus-gold-diag.mjs <meter> <file>
 * Emits JSON to stdout: { file, meter, failing: [ {line, idx, blockers:[{word, gold, achv}]} ] }
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
const { possibleScans } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Scansion.js');

const LONG = new Set(['ā','ē','ī','ō','ū','ȳ','Ā','Ē','Ī','Ō','Ū','Ȳ']);
const SHORT = new Set(['ă','ĕ','ĭ','ŏ','ŭ','Ă','Ĕ','Ĭ','Ŏ','Ŭ']);
const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y',
  'ă':'a','ĕ':'e','ĭ':'i','ŏ':'o','ŭ':'u','Ă':'A','Ĕ':'E','Ĭ':'I','Ŏ':'O','Ŭ':'U' };
function stripMarks(s) { return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch]); }
// gold syllable pattern of a word: sequence of marked-vowel quantities (1 marked vowel per syllable)
function goldPattern(word) {
  let pat = '';
  for (const ch of word) {
    if (LONG.has(ch)) pat += 'L';
    else if (SHORT.has(ch)) pat += 'S';
  }
  return pat;
}
function isIncompleteScan(feet, meter) {
  if (feet === undefined || feet === '') return true;
  switch (meter) {
    case 'dactylichexameter': return feet.length === 5;
    case 'hendecasyllable': return feet.length < 11;
    case 'elegiacdistichs': return feet.length < 6;
    default: return false;
  }
}
function engineSegment(tokens, index, isHyperEnclitic) {
  let followingText = '';
  let nextIndex = index;
  while (true) {
    nextIndex++;
    if (nextIndex === tokens.length) break;
    if (tokens[nextIndex].text.includes('\n')) { if (!isHyperEnclitic) break; continue; }
    if (tokens[nextIndex].isSpace) followingText += ' ';
    else if (tokens[nextIndex].isWord) {
      followingText += tokens[nextIndex].accented?.[0] || '';
      if (/[aeiouy]/.test(followingText)) break;
    }
  }
  followingText = followingText.toLowerCase().replace(/h/g, '');
  if (followingText === '') return '#';
  if (/^ *[aeiouy]/.test(followingText)) return 'V';
  if (/^ *([bcdfgjklmnpqrstv] *|[tpcdbgf][lr])[aeiouy]/.test(followingText)) return 'C';
  return 'CC';
}

const meter = process.argv[2];
const file = process.argv[3];
const dir = path.join(ROOT, 'test/data/corpus', meter);
const text = fs.readFileSync(path.join(dir, file), 'utf-8');
const raw = text.split('\n');
if (raw.length > 0 && raw[raw.length - 1].trim() === '') raw.pop();
const lines = raw.map(l => l.trim());
const joined = lines.join('\n');

const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
m.morpheusAnalyzer = null;
m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: (w) => w.map(x => ({ word: x, success: false, analyses: [] })) });
await m.initialize();
let result;
try {
  result = await m.macronize(stripMarks(joined), { macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter });
} catch (e) {
  console.log(JSON.stringify({ file, meter, error: e.message }));
  m.destroy();
  process.exit(0);
}
const feet = result.scannedFeet || [];
const tokens = result.taggedTokens || result.tokens || [];

// map each token index -> corpus line index (count newlines before it)
const lineOf = new Map(); let nl = 0;
for (let ti = 0; ti < tokens.length; ti++) {
  lineOf.set(ti, nl);
  nl += (tokens[ti].text.match(/\n/g) || []).length;
}

const failing = [];
for (let li = 0; li < lines.length; li++) {
  if (isIncompleteScan(feet[li], meter)) {
    // collect this line's word tokens
    const lineWords = [];
    for (let ti = 0; ti < tokens.length; ti++) {
      if (lineOf.get(ti) !== li || !tokens[ti].isWord) continue;
      lineWords.push(ti);
    }
    const blockers = [];
    // gold words: split the marked line, strip punctuation
    const goldWords = lines[li].split(/\s+/).map(w => w.replace(/[.,;:?!—–…'’"()[\]]/g, '')).filter(Boolean);
    if (process.env.DEBUG) {
      console.error(`DEBUG line ${li}: goldWords=${JSON.stringify(goldWords)}`);
      console.error(`DEBUG tokens: ${lineWords.map(ti => `${JSON.stringify(tokens[ti].text)}=${JSON.stringify(tokens[ti].accented)}`).join(' | ')}`);
    }
    for (let wi = 0; wi < Math.min(goldWords.length, lineWords.length); wi++) {
      const ti = lineWords[wi];
      const t = tokens[ti];
      const gp = goldPattern(goldWords[wi]);
      if (!gp) continue;
      const isHyper = (t.accented?.[0] || t.text || '').toLowerCase().replace(/[^a-z]/g, '').endsWith('que');
      const seg = engineSegment(tokens, ti, isHyper);
      const cands = [...(t.accented || [''])];
      const achv = possibleScans(cands, seg).map(s => s.scansion);
      if (!achv.includes(gp)) {
        blockers.push({ word: goldWords[wi], gold: gp, achv: [...new Set(achv)], acc: cands });
      }
    }
    failing.push({ line: lines[li], idx: li, blockers });
  }
}
console.log(JSON.stringify({ file, meter, failing }));
m.destroy();
