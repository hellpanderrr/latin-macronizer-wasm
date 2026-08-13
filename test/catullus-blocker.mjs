#!/usr/bin/env node
/**
 * Catullus blocker (M-023m): find WORDLIST QUANTITY BUGS from the negenborn
 * full-Catullus scansion gold. Adaptation of gold-blocker.mjs (M-013) whose gold
 * source was hypotactic's JSON — here the gold is the macron/breve-marked corpus
 * lines themselves (gold word L/S pattern = sequence of marked-vowel quantities).
 *
 * For each line that fails to scan (per meter), align the engine's verse words to
 * the gold words and report the FIRST word whose gold pattern the engine cannot
 * produce (the blocker), plus brute-forced `_`/`^` FIX forms (ACCENT_OVERRIDES).
 *
 * Usage: node test/catullus-blocker.mjs [--file catullus-LXIV.txt] [--limit N]
 *        (scans all Catullus corpus files; --file restricts to one)
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
function argVal(n) { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : undefined; }
const onlyFile = argVal('--file');
const limit = parseInt(argVal('--limit') || '2000', 10);

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

const LONG = new Set(['ā','ē','ī','ō','ū','ȳ','Ā','Ē','Ī','Ō','Ū','Ȳ']);
const SHORT = new Set(['ă','ĕ','ĭ','ŏ','ŭ','Ă','Ĕ','Ĭ','Ŏ','Ŭ']);
const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y',
  'ă':'a','ĕ':'e','ĭ':'i','ŏ':'o','ŭ':'u','Ă':'A','Ĕ':'E','Ĭ':'I','Ŏ':'O','Ŭ':'U' };
function stripMarks(s) { return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch]); }
function norm(s) { return stripMarks(s).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function isIncompleteScan(feet, meter) {
  if (feet === undefined || feet === '') return true;
  switch (meter) {
    case 'dactylichexameter': return feet.length === 5; // 1-4 = genuine hemistich
    case 'hendecasyllable': return feet.length < 11;
    case 'elegiacdistichs': return feet.length < 6;
    case 'iambic': return feet.length < 12;
    default: return false; // sapphic/galliambic/lyric: not harness meters, skip
  }
}
// gold words of a marked line: [{text, pattern}] where pattern = marked-vowel L/S seq
function goldWordsOf(line) {
  return line.split(/\s+/).map(w => w.replace(/[.,;:?!—–…'’"()[\]]/g, '')).filter(Boolean).map(w => {
    let pat = '';
    for (const ch of w) { if (LONG.has(ch)) pat += 'L'; else if (SHORT.has(ch)) pat += 'S'; }
    return { text: w, pattern: pat };
  });
}
function matchesGold(enginePat, goldPat) {
  if (goldPat === '?' || goldPat === enginePat) return true;
  if (enginePat.length !== goldPat.length || !goldPat.includes('?')) return false;
  for (let k = 0; k < goldPat.length; k++) if (goldPat[k] !== '?' && goldPat[k] !== enginePat[k]) return false;
  return true;
}
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

const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
m.morpheusAnalyzer = null;
m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })) });
await m.initialize();

const CORPUS = process.env.CATULLUS_GOLD_DIR || path.join(ROOT, 'test/data/gold/catullus');
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
    const gp = gw.pattern;
    if (!gp) { gi++; continue; }
    const reachable = v.scans.some(s => matchesGold(s.scansion, gp));
    if (!reachable) {
      blockers.push({ word: v.text, goldPattern: gp, engine: v.scans.map(s => `${s.accented}[${s.scansion}]`).slice(0, 5).join(' | '), seg: v.seg });
      break;
    }
    gi++;
  }
  const out = [`${file}|${li + 1}|${f === '' ? 'EMPTY' : f}| ${lines[i]}`];
  if (blockers.length) {
    const b = blockers[0];
    out.push(`  BLOCKER: ${b.word} needs gold ${b.goldPattern} (engine: ${b.engine})`);
    const fixes = bruteForceForms(b.word.toLowerCase().replace(/[^a-z]/g, ''), b.goldPattern, b.seg || '#');
    if (fixes.length) for (const fx of fixes.slice(0, 4)) out.push(`    FIX: '${fx.form}'`);
    else out.push(`    (no _/^ form produces gold pattern — segmenter/elision limitation)`);
  } else {
    out.push(`  (no word-level blocker — penalty/ordering issue, gold path may need completion bonus)`);
  }
  return out;
}

const out = [];
let analyzed = 0;
const METERS = ['dactylichexameter', 'hendecasyllable', 'elegiacdistichs', 'iambic'];
for (const meter of METERS) {
  const meterDir = path.join(CORPUS, meter);
  if (!fs.existsSync(meterDir)) continue;
  for (const file of fs.readdirSync(meterDir)) {
    if (!file.startsWith('catullus-') || !file.endsWith('.txt')) continue;
    if (onlyFile && file !== onlyFile) continue;
    if (analyzed >= limit) break;
    const text = fs.readFileSync(path.join(meterDir, file), 'utf8');
    const raw = text.split('\n');
    if (raw.length > 0 && raw[raw.length - 1].trim() === '') raw.pop();
    const lines = raw.map(l => l.trim());
    if (!lines.length) continue;
    let res;
    try {
      res = await m.macronize(stripMarks(lines.join('\n')), { macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter });
    } catch (e) { console.log(`[ERR] ${file}: ${e.message}`); continue; }
    const tokens = res.taggedTokens || res.tokens || [];
    const lineOf = new Map(); let nl = 0;
    for (let ti = 0; ti < tokens.length; ti++) { lineOf.set(ti, nl); nl += (tokens[ti].text.match(/\n/g) || []).length; }
    const feet = res.scannedFeet || [];
    let fileFails = 0;
    for (let i = 0; i < lines.length; i++) {
      const n = norm(lines[i]);
      if (!n) continue;
      if (!isIncompleteScan(feet[i], meter)) continue;
      if (analyzed >= limit) break;
      analyzed++;
      fileFails++;
      const gws = goldWordsOf(lines[i]);
      out.push(...reportLine(tokens, lineOf, i, file, i, lines, feet[i] || '', gws));
    }
    if (fileFails > 0) console.log(`${file} (${meter}): ${fileFails} failing`);
  }
  if (analyzed >= limit) break;
}
const outPath = 'C:/Users/HELLPA~1/AppData/Local/Temp/catullus-blocker.txt';
fs.writeFileSync(outPath, out.join('\n'));
console.log(`wrote ${out.length} lines to ${outPath}`);
m.destroy();
