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
const snapshotFile = argVal('--snapshot');
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
function goldWordsOf(e) {
  const words = [];
  for (const seg of e.segments) for (const w of seg.words) words.push(w);
  return words.map(w => ({ text: w.text, pattern: w.syllables.map(s => ({ long: 'L', short: 'S', anceps: 'X', longum: 'L', breve: 'S' }[s.length] || '?')).join('') }));
}
// Per-file gold index: file basename → array (per line) of goldWords.
// Built lazily so a --snapshot run only loads the books with failures.
const goldLinesCache = new Map();
function goldLinesFor(file) {
  const base = file.split(/[\\/]/).pop();
  if (goldLinesCache.has(base)) return goldLinesCache.get(base);
  let out = null;
  const aeneid = BOOKS[base];
  if (aeneid) {
    const pc = vergil['Vergil']['Aeneid'][aeneid][0]['poem content'];
    out = pc.map(e => goldWordsOf(e));
  } else if (base.startsWith('georgics-')) {
    const book = 'Georgics ' + base.match(/georgics-(\d+)/)[1];
    const pc = vergil['Vergil']['Georgics'][book][0]['poem content'];
    out = pc.map(e => goldWordsOf(e));
  } else if (base.startsWith('eclogue-')) {
    const poem = 'Eclogue ' + base.match(/eclogue-(\d+)/)[1];
    const pc = vergil['Vergil']['Eclogues'][poem][0]['poem content'];
    out = pc.map(e => goldWordsOf(e));
  } else if (base.startsWith('catullus-')) {
    for (const po of catullus['Catullus']['Poems']['poems']) {
      if (catFileName(po).split('/').pop() === base) {
        out = po['poem content'].map(e => goldWordsOf(e));
        break;
      }
    }
  }
  goldLinesCache.set(base, out);
  return out;
}

function wordPattern(gw) {
  return gw.pattern;
}

// A `?` in gold marks a syllable the gold annotator was unsure of — treat it
// as a wildcard: the engine need only match the definite positions.
function matchesGold(enginePat, goldPat) {
  if (goldPat === '?' || goldPat === enginePat) return true;
  if (enginePat.length !== goldPat.length || !goldPat.includes('?')) return false;
  for (let k = 0; k < goldPat.length; k++) if (goldPat[k] !== '?' && goldPat[k] !== enginePat[k]) return false;
  return true;
}

// Brute-force `_` (long) / `^` (short) markings on every vowel of the bare word
// and return the forms whose possibleScans (in the actual following segment)
// include the gold pattern. Sorted by fewest markers → fewest marks → alpha.
// This is the actionable output: each form is a candidate ACCENT_OVERRIDE entry.
function bruteForceForms(bare, goldPattern, seg) {
  if (!bare || bare.length === 0 || bare.length > 24) return [];
  const vowelIdx = [];
  for (let i = 0; i < bare.length; i++) if ('aeiouy'.includes(bare[i])) vowelIdx.push(i);
  if (vowelIdx.length === 0 || vowelIdx.length > 8) return [];
  const found = [];
  const combos = Math.pow(3, vowelIdx.length);
  for (let mask = 0; mask < combos; mask++) {
    let m = mask;
    const markers = new Map();
    for (const vi of vowelIdx) {
      const choice = m % 3; m = Math.floor(m / 3);
      if (choice === 1) markers.set(vi, '_');
      else if (choice === 2) markers.set(vi, '^');
    }
    let form = '';
    for (let i = 0; i < bare.length; i++) {
      form += bare[i];
      if (markers.has(i)) form += markers.get(i);
    }
    if (possibleScans([form], seg).some(s => matchesGold(s.scansion, goldPattern))) {
      found.push({ form, markers: markers.size });
    }
  }
  found.sort((a, b) => a.markers - b.markers || a.form.length - b.form.length || a.form.localeCompare(b.form));
  return found;
}

// ---------- main ----------
const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
m.morpheusAnalyzer = null;
m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })) });
await m.initialize();

const CORPUS = path.join(ROOT, 'test/data/corpus');
const out = [];
let analyzed = 0;

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

// For one failing line, build the engine verse and report the first word whose
// gold L/S pattern the engine cannot produce. Pushes output into `out`.
function reportLine(tokens, lineOf, li, file, i, lines, f, gws) {
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
    const reachable = v.scans.some(s => matchesGold(s.scansion, gp));
    if (!reachable) {
      blockers.push({ word: v.text, goldPattern: gp, engine: v.scans.map(s => `${s.accented}[${s.scansion}]`).slice(0, 5).join(' | '), seg: v.seg });
      break;
    }
    gi++;
  }
  out.push(`${file}|${li + 1}|${f === '' ? 'EMPTY' : f}| ${lines[i]}`);
  if (blockers.length) {
    const b = blockers[0];
    out.push(`  BLOCKER: ${b.word} needs gold ${b.goldPattern} (engine: ${b.engine})`);
    const fixes = bruteForceForms(b.word.toLowerCase().replace(/[^a-z]/g, ''), b.goldPattern, b.seg || '#');
    if (fixes.length) {
      for (const fx of fixes.slice(0, 4)) out.push(`    FIX: '${fx.form}'`);
    } else {
      out.push(`    (no _/^ form produces gold pattern — segmenter/elision limitation)`);
    }
  } else {
    out.push(`  (no word-level blocker — penalty/ordering issue, gold path may need completion bonus)`);
  }
}

if (snapshotFile) {
  // ---- snapshot mode: only load gold for, and scan, files with failures ----
  const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const byFile = new Map();
  for (const rec of snap) {
    if (!byFile.has(rec.file)) byFile.set(rec.file, []);
    byFile.get(rec.file).push(rec);
  }
  for (const [file, recs] of byFile) {
    if (analyzed >= limit) break;
    const meter = recs[0].meter || 'dactylichexameter';
    const meterDir = path.join(CORPUS, meter);
    if (!fs.existsSync(path.join(meterDir, file))) { console.log(`skip ${file}: not in ${meter}/`); continue; }
    const text = fs.readFileSync(path.join(meterDir, file), 'utf8');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const res = await m.macronize(stripMacrons(lines.join('\n')), { macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter });
    const tokens = res.taggedTokens || res.tokens || [];
    const lineOf = new Map(); let nl = 0;
    for (let ti = 0; ti < tokens.length; ti++) { lineOf.set(ti, nl); nl += (tokens[ti].text.match(/\n/g) || []).length; }
    const feet = res.scannedFeet || [];
    const gold = goldLinesFor(file);
    // map normalized line text → line index (first occurrence)
    const idx = new Map();
    for (let i = 0; i < lines.length; i++) { const n = norm(lines[i]); if (n && !idx.has(n)) idx.set(n, i); }
    console.log(`${file} (${meter}): ${recs.length} failing lines`);
    for (const rec of recs) {
      if (analyzed >= limit) break;
      const i = idx.get(rec.norm);
      if (i === undefined || !gold || !gold[i]) { console.log(`  no gold/line match for: ${rec.norm}`); continue; }
      analyzed++;
      reportLine(tokens, lineOf, i, file, i, lines, feet[i] || '', gold[i]);
    }
  }
} else {
  // ---- full-scan mode: every hexameter file, lazy gold per file ----
  for (const meter of fs.readdirSync(CORPUS)) {
    const meterDir = path.join(CORPUS, meter);
    if (!fs.statSync(meterDir).isDirectory()) continue;
    if (!['dactylichexameter'].includes(meter)) continue;
    for (const file of fs.readdirSync(meterDir)) {
      if (!file.endsWith('.txt')) continue;
      if (onlyFile && file !== onlyFile) continue;
      const gold = goldLinesFor(file);
      if (!gold) continue;
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
        if (!gold[i]) continue;
        if (analyzed >= limit) break;
        analyzed++;
        reportLine(tokens, lineOf, i, file, i, lines, f, gold[i]);
      }
      if (analyzed >= limit) break;
    }
    if (analyzed >= limit) break;
  }
}
fs.writeFileSync('C:/Users/HELLPA~1/AppData/Local/Temp/gold-blocker.txt', out.join('\n'));
console.log(`wrote ${out.length} lines`);
m.destroy();
