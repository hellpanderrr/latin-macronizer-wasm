#!/usr/bin/env node
/**
 * Gold-blocker: for each corpus line that fails to scan completely, compare
 * the GOLD per-syllable L/S pattern (hypotactic) against the engine's candidate
 * patterns, and report the FIRST word whose gold pattern the engine cannot
 * produce (the blocker). Also reports words whose gold pattern the engine CAN
 * produce but only at penalty (needs a completion bonus or override).
 *
 * This is the triage tool for the Aeneid 7-12 expansion: it turns 131 empty
 * failures into a list of "add override for X" actions.
 *
 * Usage: node test/gold-blocker.mjs [--file aeneid-7.txt] [--limit 200]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
require('fake-indexeddb/auto');
const GOLD = 'C:/Users/HELLPA~1/AppData/Local/Temp/hypotactic_data_6_17_2025';

const args = process.argv.slice(2);
function argVal(n) { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : undefined; }
const onlyFile = argVal('--file');
const limit = parseInt(argVal('--limit') || '200', 10);

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
const { possibleScans, allVowelsAmbiguous } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Scansion.js');
const meters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/meters.json'), 'utf8'));
const automaton = meters['dactylichexameter'];
const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y' };
function stripMacrons(s) { return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch] || 'aeiouy'['AEIOUY'.indexOf(ch)] || ch); }
function norm(s) { return stripMacrons(s).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); }

// ---------- gold index ----------
const vergil = JSON.parse(fs.readFileSync(path.join(GOLD, 'vergil.json'), 'utf8'));
const catullus = JSON.parse(fs.readFileSync(path.join(GOLD, 'catullus.json'), 'utf8'));
const BOOKS = {};
for (let b = 1; b <= 12; b++) BOOKS[`aeneid-${b}.txt`] = `Aeneid ${b}`;
const goldByNorm = new Map();
const goldByLine = new Map();
for (const [file, book] of Object.entries(BOOKS)) {
  const pc = vergil['Vergil']['Aeneid'][book][0]['poem content'];
  for (let i = 0; i < pc.length; i++) {
    const e = pc[i];
    const words = [];
    for (const seg of e.segments) for (const w of seg.words) words.push(w);
    const n = norm(words.map(w => w.text).join(' '));
    const goldWords = words.map(w => ({
      text: w.text,
      pattern: w.syllables.map(s => ({ long: 'L', short: 'S', anceps: 'X', longum: 'L', breve: 'S' }[s.length] || '?')).join(''),
    }));
    goldByNorm.set(n, goldWords);
    goldByLine.set(`${file}:${i + 1}`, goldWords);
  }
}
// All Catullus poems — map poem number → corpus file name.
// 64 (hexameter) → catullus-LXIV.txt in dactylichexameter/
// elegy → catullus-<ROMAN>.txt in elegiacdistichs/ (78b/95b get a b suffix)
const ROMAN = ['', 'I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX',
  'XXI','XXII','XXIII','XXIV','XXV','XXVI','XXVII','XXVIII','XXIX','XXX','XXXI','XXXII','XXXIII','XXXIV','XXXV','XXXVI','XXXVII','XXXVIII','XXXIX','XL',
  'XLI','XLII','XLIII','XLIV','XLV','XLVI','XLVII','XLVIII','XLIX','L','LI','LII','LIII','LIV','LV','LVI','LVII','LVIII','LIX','LX',
  'LXI','LXII','LXIII','LXIV','LXV','LXVI','LXVII','LXVIII','LXIX','LXX','LXXI','LXXII','LXXIII','LXXIV','LXXV','LXXVI','LXXVII','LXXVIII','LXXIX','LXXX',
  'LXXXI','LXXXII','LXXXIII','LXXXIV','LXXXV','LXXXVI','LXXXVII','LXXXVIII','LXXXIX','XC','XCI','XCII','XCIII','XCIV','XCV','XCVI','XCVII','XCVIII','XCIX','C',
  'CI','CII','CIII','CIV','CV','CVI','CVII','CVIII','CIX','CX','CXI','CXII','CXIII','CXIV','CXV','CXVI','CXVII','CXVIII'];
function catFileName(po) {
  const pn = String(po['poem number']);
  const num = parseInt(pn, 10);
  const roman = ROMAN[num] || `P${num}`;
  const suffix = /b$/.test(pn) ? 'b' : '';
  const metre = String(po['poem metre']);
  const sub = metre === 'elegy' ? 'elegiacdistichs' : 'dactylichexameter';
  return `${sub}/${metre === 'elegy' ? 'catullus-' + roman + suffix + '.txt' : 'catullus-' + roman + '.txt'}`;
}
for (const po of catullus['Catullus']['Poems']['poems']) {
  const metre = String(po['poem metre']);
  if (metre !== 'elegy' && String(po['poem number']) !== '64') continue;
  const pc = po['poem content'];
  for (let i = 0; i < pc.length; i++) {
    const e = pc[i];
    const words = [];
    for (const seg of e.segments) for (const w of seg.words) words.push(w);
    const n = norm(words.map(w => w.text).join(' '));
    goldByNorm.set(n, words.map(w => ({ text: w.text, pattern: w.syllables.map(s => ({ long: 'L', short: 'S', anceps: 'X' }[s.length] || '?')).join('') })));
  }
}

function wordPattern(gw) {
  return gw.pattern;
}

// ---------- main ----------
const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
m.morpheusAnalyzer = null;
m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })) });
await m.initialize();

const CORPUS = path.join(ROOT, 'test/data/corpus');
const out = [];
let analyzed = 0;

for (const meter of fs.readdirSync(CORPUS)) {
  const meterDir = path.join(CORPUS, meter);
  if (!fs.statSync(meterDir).isDirectory()) continue;
  if (!['dactylichexameter'].includes(meter)) continue;
  for (const file of fs.readdirSync(meterDir)) {
    if (!file.endsWith('.txt')) continue;
    if (onlyFile && file !== onlyFile) continue;
    const text = fs.readFileSync(path.join(meterDir, file), 'utf8');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const res = await m.macronize(stripMacrons(lines.join('\n')), { macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter });
    const tokens = res.taggedTokens || res.tokens || [];
    const lineOf = new Map(); let nl = 0;
    for (let ti = 0; ti < tokens.length; ti++) { lineOf.set(ti, nl); nl += (tokens[ti].text.match(/\n/g) || []).length; }
    const feet = res.scannedFeet || [];
    for (let i = 0; i < lines.length; i++) {
      const n = norm(lines[i]);
      if (!n) continue;
      const f = feet[i] || '';
      if (f !== '' && f.length === 6) continue; // scans fine
      const gws = goldByNorm.get(n);
      if (!gws) continue;
      if (analyzed >= limit) break;
      analyzed++;
      // Build engine verse for this line, find first gold-vs-engine mismatch.
      // Find the line's token span.
      const li = lines.findIndex(l => norm(l) === n);
      if (li === -1) continue;
      function engineSegment(tokens, index, isHyperEnclitic) {
        let ft = ''; let nx = index;
        while (true) {
          nx++;
          if (nx === tokens.length) break;
          if (tokens[nx].text.includes('\n')) { if (!isHyperEnclitic) break; continue; }
          if (tokens[nx].isSpace) ft += ' ';
          else if (tokens[nx].isWord) { ft += tokens[nx].accented?.[0] || ''; if (/[aeiouy]/.test(ft)) break; }
        }
        ft = ft.toLowerCase().replace(/h/g, '');
        if (ft === '') return '#';
        if (/^ *[aeiouy]/.test(ft)) return 'V';
        if (/^ *([bcdfgjklmnpqrstv] *|[tpcdbgf][lr])[aeiouy]/.test(ft)) return 'C';
        return 'CC';
      }
      const verse = [];
      for (let ti = 0; ti < tokens.length; ti++) {
        if (lineOf.get(ti) !== li || !tokens[ti].isWord) continue;
        const t = tokens[ti];
        const isHyper = (t.accented?.[0] || t.text || '').toLowerCase().replace(/[^a-z]/g, '').endsWith('que');
        const seg = engineSegment(tokens, ti, isHyper);
        const cands = [...(t.accented || [''])];
        if (t.isUnknown) cands.push(allVowelsAmbiguous(t.text.toLowerCase()));
        let scans = possibleScans(cands, seg);
        if (isHyper) {
          const canElide = seg === 'V';
          const extra = canElide ? possibleScans(cands, seg === 'V' ? '#' : 'V') : [];
          const seen = new Set(); const merged = [];
          for (const s of [...scans, ...extra]) {
            const key = s.scansion + '|' + s.accented;
            if (!seen.has(key)) { seen.add(key); merged.push(s); }
          }
          merged.sort((a, b) => a.penalty - b.penalty);
          scans = merged;
        }
        verse.push({ text: t.text, seg, scans });
      }
      // Walk gold words against engine words (align by order).
      const blockers = [];
      let gi = 0;
      for (const v of verse) {
        if (gi >= gws.length) break;
        let gw = gws[gi];
        const vN = norm(v.text);
        if (norm(gw.text) !== vN) {
          let k = gi;
          while (k < gws.length && norm(gws[k].text) !== vN) k++;
          if (k >= gws.length) continue;
          gi = k; gw = gws[gi];
        }
        const gp = wordPattern(gw);
        const reachable = gp === '?' || v.scans.some(s => s.scansion === gp);
        if (!reachable) {
          blockers.push({ word: v.text, goldPattern: gp, engine: v.scans.map(s => `${s.accented}[${s.scansion}]`).slice(0, 5).join(' | ') });
          break;
        }
        gi++;
      }
      out.push(`${file}|${li + 1}|${f === '' ? 'EMPTY' : f}| ${lines[i]}`);
      if (blockers.length) {
        out.push(`  BLOCKER: ${blockers[0].word} needs gold ${blockers[0].goldPattern} (engine: ${blockers[0].engine})`);
      } else {
        out.push(`  (no word-level blocker — penalty/ordering issue, gold path may need completion bonus)`);
      }
    }
    if (analyzed >= limit) break;
  }
  if (analyzed >= limit) break;
}
fs.writeFileSync('C:/Users/HELLPA~1/AppData/Local/Temp/gold-blocker.txt', out.join('\n'));
console.log(`wrote ${out.length} lines`);
m.destroy();
