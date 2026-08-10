#!/usr/bin/env node
/**
 * Brute-force line scanner: for each failing line, enumerate ALL `_`/`^`
 * accent forms per word and DP through the meter automaton to find which
 * combination makes the whole line scan. Outputs the chosen (word → form,
 * pattern) so the fix can be verified against gold/edition and added as an
 * ACCENT_OVERRIDE.
 *
 * Usage: node test/brute-line.mjs [--file aeneid-1.txt] [--needle videt] [--limit N]
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
const limit = parseInt(argVal('--limit') || '3', 10);

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
const { possibleScans, separateAmbiguousVowels } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Scansion.js');
const meters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/meters.json'), 'utf8'));

const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y' };
function stripMacrons(s) { return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch] || 'aeiouy'['AEIOUY'.indexOf(ch)] || ch); }
const PUNCT = /[^a-z ]/g;
function norm(s) { return stripMacrons(s).toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim(); }

async function createMacronizer() {
  const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
  m.morpheusAnalyzer = null;
  m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })) });
  await m.initialize();
  return m;
}

// Enumerate all `_`/`^` accent forms for a word: every vowel gets _ or ^
// (but a vowel already in a diphthong context stays). Returns forms like
// "religio" → re_li^gi^o_, etc. Also tries leaving vowels UNMARKED? No —
// unmarked means the engine decides via context; for brute force we mark all.
function enumerateAccentForms(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return [];
  // find vowel positions (treat qu as q)
  const chars = w.split('');
  const vowelIdx = [];
  for (let i = 0; i < chars.length; i++) {
    if ('aeiouy'.includes(chars[i])) vowelIdx.push(i);
  }
  if (vowelIdx.length === 0) return [w];
  if (vowelIdx.length > 9) return []; // too big
  const forms = [];
  for (let mask = 0; mask < (1 << vowelIdx.length); mask++) {
    let out = '';
    let vi = 0;
    for (let i = 0; i < chars.length; i++) {
      out += chars[i];
      if (vi < vowelIdx.length && vowelIdx[vi] === i) {
        out += (mask & (1 << vi)) ? '_' : '^';
        vi++;
      }
    }
    forms.push(out);
  }
  return forms;
}

// Compute engine followingSegment (mirrors scanVerses)
function computeFollowingSegment(tokens, index, isHyperEnclitic) {
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

// Get candidate scansions for a token, adding brute-force forms
function tokenCandidates(tokens, ti, automatonStateNames) {
  const t = tokens[ti];
  const isHyper = (t.accented?.[0] || t.text || '').toLowerCase().replace(/[^a-z]/g, '').endsWith('que');
  const seg = computeFollowingSegment(tokens, ti, isHyper);
  const cands = [...(t.accented || [''])];
  // add brute-force forms
  const forms = enumerateAccentForms(t.text || '');
  for (const f of forms) if (!cands.includes(f)) cands.push(f);
  const scans = possibleScans(cands, seg);
  return { seg, isHyper, scans, text: t.text };
}

function bruteScan(lineTokens) {
  // DP: state after processing words up to index i is an automaton node.
  // best[i][node] = { form, pattern, prevNode, prevIdx, penalty }
  // Enforces the REAL scanVerse guard: passing through state 0 (finished) is
  // only allowed on the LAST word; intermediate words must never touch state 0.
  const automaton = meters['dactylichexameter'];
  const best = [];
  best.push(new Map()); // after 0 words: node 0
  best[0].set(0, { penalty: 0, prevIdx: -1, prevNode: -1, form: null, pattern: null });
  for (let i = 0; i < lineTokens.length; i++) {
    const cur = best[i];
    const nxt = new Map();
    const isLast = i === lineTokens.length - 1;
    for (const [node, info] of cur) {
      for (const scan of lineTokens[i].scans) {
        let ni = node;
        let ok = true;
        let hitZero = false;
        for (const syl of scan.scansion) {
          const key = `(${ni}, '${syl}')`;
          const trans = automaton[key];
          if (!trans) { ok = false; break; }
          const [n, , pen] = trans;
          if (n === -1) { ok = false; break; }
          ni = n;
          if (ni === 0) hitZero = true;
        }
        if (!ok) continue;
        // real guard: if we passed through state 0 it must be the last word,
        // and the last word must END at state 0.
        if (hitZero && !isLast) continue;
        if (isLast && ni !== 0) continue;
        const totalPenalty = info.penalty + scan.penalty;
        const existing = nxt.get(ni);
        if (!existing || totalPenalty < existing.penalty) {
          nxt.set(ni, { penalty: totalPenalty, prevIdx: i - 1, prevNode: node, form: scan.accented, pattern: scan.scansion, seg: lineTokens[i].seg });
        }
      }
    }
    best.push(nxt);
  }
  // find end state 0
  const final = best[lineTokens.length].get(0);
  if (!final) return null;
  // reconstruct
  const path = [];
  let idx = lineTokens.length - 1;
  let node = 0;
  let info = final;
  while (idx >= 0) {
    path.push({ word: lineTokens[idx].text, form: info.form, pattern: info.pattern, seg: info.seg });
    node = info.prevNode;
    idx = info.prevIdx;
    info = best[idx + 1].get(node);
  }
  path.reverse();
  return path;
}

const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/data/scansion-failures-snapshot.json'), 'utf8'));
const m = await createMacronizer();

for (const fail of snapshot) {
  if (onlyFile && fail.file !== onlyFile) continue;
  if (needle && !fail.line.toLowerCase().includes(needle)) continue;
  const file = fs.readFileSync(path.join(ROOT, `test/data/corpus/dactylichexameter/${fail.file}`), 'utf8');
  const lines = file.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const joined = lines.join('\n');
  const res = await m.macronize(stripMacrons(joined), { macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: 'dactylichexameter' });
  const tokens = res.taggedTokens || res.tokens || [];
  const lineOf = new Map(); let nl = 0;
  for (let ti = 0; ti < tokens.length; ti++) {
    lineOf.set(ti, nl);
    nl += (tokens[ti].text.match(/\n/g) || []).length;
  }
  const li = lines.findIndex(l => norm(l) === norm(fail.line));
  if (li === -1) { console.log(`\n=== ${fail.file}: ${fail.line}\n   (line not in corpus)`); continue; }
  const lineTokens = [];
  for (let ti = 0; ti < tokens.length; ti++) {
    if (lineOf.get(ti) !== li || !tokens[ti].isWord) continue;
    lineTokens.push({ ...tokenCandidates(tokens, ti), ti });
  }
  console.log(`\n=== ${fail.file}: ${fail.line}`);
  // Original engine candidates (what the gate sees)
  console.log('  [engine]');
  for (const lt of lineTokens) {
    console.log(`    ${lt.text.padEnd(16)} seg=${lt.seg} ${lt.scans.map(s => `${s.accented}[${s.scansion}]`).join(' | ')}`);
  }
  // Brute-force
  const bf = bruteScan(lineTokens);
  if (!bf) {
    console.log('  [brute] NO full-line scansion found with arbitrary vowel quantities');
  } else {
    const formsByWord = {};
    for (const p of bf) formsByWord[p.word] = formsByWord[p.word] || [];
    for (const p of bf) {
      if (!formsByWord[p.word].some(f => f.form === p.form)) formsByWord[p.word].push(p);
    }
    console.log('  [brute] SOLUTION (word → form[pattern]):');
    for (const p of bf) {
      console.log(`    ${p.word.padEnd(16)} ${p.form}[${p.pattern}]  seg=${p.seg}`);
    }
  }
}
m.destroy();
