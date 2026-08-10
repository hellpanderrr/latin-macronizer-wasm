#!/usr/bin/env node
/**
 * Gold-diag: side-by-side gold per-word pattern vs engine token candidates
 * (with the engine's own followingSegment context) for each failing line.
 *
 * Usage: node test/gold-diag.mjs [--file aeneid-1.txt] [--needle videt]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
require('fake-indexeddb/auto');
const args = process.argv.slice(2);
function argVal(name) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; }
const onlyFile = argVal('--file');
const needle = argVal('--needle');
const goldPath = argVal('--gold') || 'C:/Users/HELLPA~1/AppData/Local/Temp/hypotactic_data_6_17_2025/vergil.json';

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
  if (/cruncher/.test(s)) return new Response(null, { status: 404 });
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
const { possibleScans } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Scansion.js');

const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y' };
function stripMacrons(s) { return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch] || 'aeiouy'['AEIOUY'.indexOf(ch)] || ch); }
const PUNCT = /[^a-z ]/g;
function norm(s) { return stripMacrons(s).toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim(); }

// gold index
const gold = JSON.parse(fs.readFileSync(goldPath, 'utf8'));
const BOOKMAP = {
  'Aeneid 1': 'aeneid-1.txt', 'Aeneid 2': 'aeneid-2.txt', 'Aeneid 3': 'aeneid-3.txt',
  'Aeneid 4': 'aeneid-4.txt', 'Aeneid 5': 'aeneid-5.txt', 'Aeneid 6': 'aeneid-6.txt',
};
const goldLines = [];
for (const book of Object.keys(gold['Vergil']['Aeneid'])) {
  const fn = BOOKMAP[book]; if (!fn) continue;
  const poem = gold['Vergil']['Aeneid'][book][0]['poem content'];
  for (const entry of poem) {
    const words = [];
    for (const seg of entry.segments) for (const w of seg.words) words.push(w);
    goldLines.push({ file: fn, lineNum: entry['line number'], norm: norm(words.map(w => w.text).join(' ')), words });
  }
}
const catPath = goldPath.replace('vergil.json', 'catullus.json');
if (fs.existsSync(catPath)) {
  const cg = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  const poem = cg['Catullus'][0]['poem content'];
  for (const entry of poem) {
    const words = [];
    for (const seg of entry.segments) for (const w of seg.words) words.push(w);
    goldLines.push({ file: 'catullus-LXIV.txt', lineNum: entry['line number'], norm: norm(words.map(w => w.text).join(' ')), words });
  }
}
const byNorm = new Map(); for (const l of goldLines) byNorm.set(l.norm, l);
const byLineNum = new Map(); for (const l of goldLines) byLineNum.set(`${l.file}:${l.lineNum}`, l);

function wordPattern(w) {
  return w.syllables.map(sy => ({ long: 'L', short: 'S', anceps: 'X', longum: 'L', breve: 'S' }[sy.length] || '?')).join('');
}

async function createMacronizer() {
  const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
  m.morpheusAnalyzer = null;
  m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })) });
  await m.initialize();
  return m;
}

function engineSegment(tokens, index, isHyperEnclitic) {
  let followingText = '';
  let nextIndex = index;
  while (true) {
    nextIndex++;
    if (nextIndex === tokens.length) break;
    if (tokens[nextIndex].text.includes('\n')) {
      if (!isHyperEnclitic) break;
      continue;
    }
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

const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/data/scansion-failures-snapshot.json'), 'utf8'));
const m = await createMacronizer();

for (const fail of snapshot) {
  if (onlyFile && fail.file !== onlyFile) continue;
  if (needle && !fail.line.toLowerCase().includes(needle)) continue;
  let g = byNorm.get(norm(fail.norm));
  if (!g) {
    // fallback: match by line number within the book (gold text is OCR-corrupted)
    const fileLines = fs.readFileSync(path.join(ROOT, `test/data/corpus/dactylichexameter/${fail.file}`), 'utf8')
      .split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const li = fileLines.findIndex(l => norm(l) === norm(fail.line));
    if (li !== -1) g = byLineNum.get(`${fail.file}:${li + 1}`);
  }
  console.log(`\n=== ${fail.file}: ${fail.line}`);
  if (!g) { console.log('  (no gold match)'); continue; }

  const file = fs.readFileSync(path.join(ROOT, `test/data/corpus/dactylichexameter/${fail.file}`), 'utf8');
  const lines = file.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const joined = lines.join('\n');
  const res = await m.macronize(stripMacrons(joined), { macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: 'dactylichexameter' });
  const tokens = res.taggedTokens || res.tokens || [];

  // locate the target line's token span: tokens whose text contributes to that corpus line
  // corpus line index = count of newlines before token
  const lineOf = new Map(); let nl = 0;
  for (let ti = 0; ti < tokens.length; ti++) {
    lineOf.set(ti, nl);
    nl += (tokens[ti].text.match(/\n/g) || []).length;
  }
  // find which corpus line index matches fail.line
  let li = lines.findIndex(l => norm(l) === norm(fail.line));
  if (li === -1) { console.log('  (line not found in corpus)'); continue; }

  // collect word tokens of this line in order
  const lineWords = [];
  for (let ti = 0; ti < tokens.length; ti++) {
    if (lineOf.get(ti) !== li || !tokens[ti].isWord) continue;
    lineWords.push(ti);
  }

  // Align token words to gold words by order (gold may have elided/short words the engine merged or split).
  // Do a simple two-pointer: match when norms are equal; else emit best-effort side-by-side.
  let gi = 0;
  for (let wi = 0; wi < lineWords.length; wi++) {
    const ti = lineWords[wi];
    const t = tokens[ti];
    const tN = norm(t.text || '');
    let gw = gi < g.words.length ? g.words[gi] : null;
    if (gw && norm(gw.text) !== tN) {
      // engine split a gold word (e.g. hominēsne → homines ne) or gold split engine word
      // find next gold word equal to tN
      let k = gi;
      while (k < g.words.length && norm(g.words[k].text) !== tN) k++;
      if (k < g.words.length) {
        while (gi < k) { console.log(`  ${'(gold)'.padEnd(14)} gold=${norm(g.words[gi].text).padEnd(14)}=${wordPattern(g.words[gi])}`); gi++; }
        gw = g.words[gi];
      }
    }
    const isHyper = (t.accented?.[0] || t.text || '').toLowerCase().replace(/[^a-z]/g, '').endsWith('que');
    const seg = engineSegment(tokens, ti, isHyper);
    const cands = [...(t.accented || [''])];
    const scans = possibleScans(cands, seg);
    const gp = gw ? wordPattern(gw) : '';
    const mark = (gw && gp !== '?' && !scans.some(s => s.scansion === gp)) ? '  <<< NO MATCH' : '';
    console.log(`  ${tN.padEnd(14)} gold=${gp.padEnd(6)} seg=${seg} cands=${scans.map(s => `${s.accented}[${s.scansion}]`).join(' | ')}${mark}`);
    if (gw && norm(gw.text) === tN) gi++;
  }
}
m.destroy();
