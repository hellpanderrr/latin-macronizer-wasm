#!/usr/bin/env node
/**
 * Convert the negenborn.net full-Catullus scansion download
 * (wiktionary_pron/tmp/catullus_scansion/txt/scN.txt) into the engine corpus
 * format test/data/corpus/<meter>/catullus-<ROMAN>.txt.
 *
 * The download marks EVERY vowel long (macron) or short (breve) — the existing
 * corpus is macron-only, so this is a strict quantity superset. Files are
 * written with the full marks; both test-scansion-corpus.mjs (strips marks)
 * and the quantity comparator read the same file.
 *
 * Meter table = standard Catullus classification, VERIFIED against each poem's
 * gold syllable pattern (the download's marks make syllable counts exact):
 *   hendecasyllable  = 11 syllables every line
 *   dactylichexameter= 13-17 syllables every line (hexameter)
 *   elegiacdistichs  = hexameter/pentameter alternating
 *   iambic           = iambic trimeter / choliambic (13 syll, iambic feet)
 *   sapphic          = 11,11,11,5 (Sapphic stanza) — NOT harness-gated
 *   galliambic       = carmen 63 — NOT harness-gated
 *
 * Usage: node test/build-catullus-corpus.mjs
 * Source: <wiktionary_pron>/tmp/catullus_scansion/txt (override CATULLUS_TXT_DIR)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CORPUS = path.join(ROOT, 'test/data/corpus');
const SRC = process.env.CATULLUS_TXT_DIR
  || path.resolve(ROOT, '../wiktionary_pron/wiktionary_pron/tmp/catullus_scansion/txt');

// ---- Roman numerals 1-116 ----
const ROMAN = {
  1:'I',2:'II',3:'III',4:'IV',5:'V',6:'VI',7:'VII',8:'VIII',9:'IX',10:'X',
  11:'XI',12:'XII',13:'XIII',14:'XIV',15:'XV',16:'XVI',17:'XVII',21:'XXI',
  22:'XXII',23:'XXIII',24:'XXIV',25:'XXV',26:'XXVI',27:'XXVII',28:'XXVIII',
  29:'XXIX',30:'XXX',31:'XXXI',32:'XXXII',33:'XXXIII',34:'XXXIV',35:'XXXV',
  36:'XXXVI',37:'XXXVII',38:'XXXVIII',39:'XXXIX',40:'XL',41:'XLI',42:'XLII',
  43:'XLIII',44:'XLIV',45:'XLV',46:'XLVI',47:'XLVII',48:'XLVIII',49:'XLIX',
  50:'L',51:'LI',52:'LII',53:'LIII',54:'LIV',55:'LV',56:'LVI',57:'LVII',
  58:'LVIII',59:'LIX',60:'LX',61:'LXI',62:'LXII',63:'LXIII',64:'LXIV',
  65:'LXV',66:'LXVI',67:'LXVII',68:'LXVIII',69:'LXIX',70:'LXX',71:'LXXI',
  72:'LXXII',73:'LXXIII',74:'LXXIV',75:'LXXV',76:'LXXVI',77:'LXXVII',
  78:'LXXVIII',79:'LXXIX',80:'LXXX',81:'LXXXI',82:'LXXXII',83:'LXXXIII',
  84:'LXXXIV',85:'LXXXV',86:'LXXXVI',87:'LXXXVII',88:'LXXXVIII',89:'LXXXIX',
  90:'XC',91:'XCI',92:'XCII',93:'XCIII',94:'XCIV',95:'XCV',96:'XCVI',
  97:'XCVII',98:'XCVIII',99:'XCIX',100:'C',101:'CI',102:'CII',103:'CIII',
  104:'CIV',105:'CV',106:'CVI',107:'CVII',108:'CVIII',109:'CIX',110:'CX',
  111:'CXI',112:'CXII',113:'CXIII',114:'CXIV',115:'CXV',116:'CXVI',
};

// ---- standard Catullus meter table (base carmen -> meter family) ----
const HENDECASYLLABLE = new Set([1,2,3,5,6,7,9,10,12,13,14,15,16,21,23,24,26,27,28,32,33,35,36,38,40,41,42,43,45,46,47,48,49,50,53,54,55,56,57,58]);
const CHOLIAMBIC = new Set([8,22,31,37,39,44,59,60]);
const IAMBIC_SENARIUS = new Set([4,17,25,29,52]);
const ELEGIAC = new Set([65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116]);
const HEXAMETER = new Set([62,64]);
const SAPPHIC = new Set([11,51]);
const GALLIAMBIC = new Set([63]);
// lyric / priapean / glyconic — not harness meters, but include as corpus for the quantity tool
const LYRIC = new Set([30,34,61]);

function meterOf(n) {
  if (HENDECASYLLABLE.has(n)) return 'hendecasyllable';
  if (CHOLIAMBIC.has(n)) return 'iambic';
  if (ELEGIAC.has(n)) return 'elegiacdistichs';
  if (HEXAMETER.has(n)) return 'dactylichexameter';
  if (IAMBIC_SENARIUS.has(n)) return 'iambic';
  if (SAPPHIC.has(n)) return 'sapphic';
  if (GALLIAMBIC.has(n)) return 'galliambic';
  if (LYRIC.has(n)) return 'lyric';
  throw new Error('no meter for ' + n);
}

// ---- u/v modernization (the negenborn text is medieval: writes v as u) ----
// The engine wordlist and the golden needles spell consonants as 'v' (novum,
// venit, vincit) but the medieval text has 'u' (nouum, uenit, uincit), and a
// bare rule misfires on vocalic unmarked u (cui, suus, qua). Use the wordlist
// as the ORACLE: for each token, flip each UNMARKED u (except after q) to v,
// keep the candidate the wordlist form-index contains, preferring the most
// modern (most v's). No candidate known → keep the medieval spelling (the
// engine's ending-guess or Morpheus would handle a truly missing word anyway).
const MARKED_U = new Set(['ū','ŭ','Ū','Ŭ']);
const LETTER_RE = /[a-zA-ZāēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/;
const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y',
  'ă':'a','ĕ':'e','ĭ':'i','ŏ':'o','ŭ':'u','Ă':'A','Ĕ':'E','Ĭ':'I','Ŏ':'O','Ŭ':'U' };
function plainWord(s) { return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch] || ch).toLowerCase(); }
const WORDLIST_FORMS = (() => {
  const set = new Set();
  const wl = process.env.CATULLUS_WORDLIST || path.join(ROOT, 'public/macrons.txt');
  if (fs.existsSync(wl)) {
    for (const line of fs.readFileSync(wl, 'utf-8').split('\n')) {
      const p = line.split('\t');
      if (p.length >= 4) set.add(p[0].toLowerCase());
    }
  }
  return set;
})();
function modernizeToken(tok) {
  if (WORDLIST_FORMS.size === 0) return tok;
  // tokens can carry marks — the bare u positions to consider
  const chars = [...tok];
  const flipIdx = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch !== 'u' && ch !== 'U') continue;
    if (MARKED_U.has(ch)) continue;
    // u after q stays (qu digraph)
    const prev = chars.slice(0, i).reverse().find(c => LETTER_RE.test(c));
    if (prev && prev.toLowerCase() === 'q') continue;
    flipIdx.push(i);
  }
  if (!flipIdx.length) return tok;
  let best = tok, bestV = tok.includes('u') ? 0 : Infinity;
  for (let mask = 0; mask < (1 << flipIdx.length); mask++) {
    const c = [...chars];
    let vCount = 0;
    for (let b = 0; b < flipIdx.length; b++) {
      if (mask & (1 << b)) { c[flipIdx[b]] = c[flipIdx[b]] === 'U' ? 'V' : 'v'; vCount++; }
    }
    const cand = c.join('');
    if (cand === tok) continue;
    if (WORDLIST_FORMS.has(plainWord(cand)) && vCount > bestV) { best = cand; bestV = vCount; }
  }
  return best;
}
function modernizeLine(line) {
  // tokenize on whitespace/punctuation, modernize each letter-run, reassemble
  return line.replace(/[a-zA-ZāēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]+/g, modernizeToken);
}

// ---- syllable counting from gold marks ----
const VOWEL_MARKS = new Map([['ā','l'],['ē','l'],['ī','l'],['ō','l'],['ū','l'],['ȳ','l'],
  ['ă','s'],['ĕ','s'],['ĭ','s'],['ŏ','s'],['ŭ','s'],
  ['Ā','l'],['Ē','l'],['Ī','l'],['Ō','l'],['Ū','l'],['Ȳ','l'],
  ['Ă','s'],['Ĕ','s'],['Ĭ','s'],['Ŏ','s'],['Ŭ','s']]);
function syllCount(line) {
  let n = 0;
  for (const ch of line) if (VOWEL_MARKS.has(ch)) n++;
  return n;
}
function markCount(line) { return [...line].filter(ch => VOWEL_MARKS.has(ch)).length; }

function verifyMeter(name, lines, meter) {
  const counts = lines.map(syllCount);
  const markTotals = lines.map(markCount);
  const allSame = (arr, min, max) => arr.every(x => x >= min && x <= max);
  if (meter === 'hendecasyllable') return counts.every(c => c === 11);
  if (meter === 'dactylichexameter') return allSame(counts, 13, 17);
  if (meter === 'elegiacdistichs') {
    // must alternate hex(13-17) / pent(12-14) strictly
    return counts.every((c, i) => (i % 2 === 0) ? (c >= 13 && c <= 17) : (c >= 12 && c <= 14));
  }
  if (meter === 'iambic') return allSame(counts, 12, 14); // iambic trimeter ~13
  if (meter === 'sapphic') return counts.every((c, i) => (i % 4 === 3) ? c === 5 : (c >= 10 && c <= 12));
  if (meter === 'galliambic') return allSame(counts, 15, 17);
  return true; // lyric: no strict gate
}

// ---- walk the source ----
const srcFiles = fs.readdirSync(SRC).filter(f => /^sc\d+b?\.txt$/.test(f)).sort((a, b) => {
  const an = parseInt(a.replace(/\D/g, ''), 10), bn = parseInt(b.replace(/\D/g, ''), 10);
  return an - bn;
});

let written = 0, skipped = 0;
const perMeter = {};
for (const fn of srcFiles) {
  const base = fn.replace('.txt', ''); // sc2, sc2b...
  const isB = /b$/.test(base);
  const num = parseInt(base.replace(/\D/g, ''), 10);
  let roman = ROMAN[num];
  if (isB) roman += 'b'; // 2b -> IIb, matching existing catullus-LXXVIIIb.txt
  const lines = fs.readFileSync(path.join(SRC, fn), 'utf-8').split('\n')
    .map(l => l.trim()).filter(Boolean).map(modernizeLine);
  if (!lines.length) { console.log(`skip ${fn}: empty`); skipped++; continue; }
  let meter;
  try { meter = meterOf(num); } catch (e) { console.log(`skip ${fn}: ${e.message}`); skipped++; continue; }

  // verify the gold's own pattern matches the table (flag, don't fail)
  const ok = verifyMeter(fn, lines, meter);
  if (!ok) {
    const counts = lines.map(syllCount);
    const first = counts.slice(0, 8).join(',');
    console.log(`NOTE ${fn}: meter ${meter} but syllable counts [${first}...] (n=${lines.length})`);
  }

  // the harness meters: write into per-meter dir. Non-harness meters (sapphic,
  // galliambic, lyric) have no corpus dir — keep them for the quantity tool via
  // a single "other" dir so the harness skips them (it only reads known meters).
  const dirName = ['hendecasyllable','dactylichexameter','elegiacdistichs','iambic'].includes(meter)
    ? meter : 'other';
  const outDir = path.join(CORPUS, dirName);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `catullus-${roman}.txt`);
  fs.writeFileSync(outFile, lines.join('\n') + '\n');
  perMeter[dirName] = (perMeter[dirName] || 0) + 1;
  written++;
}
console.log(`\nwrote ${written} poems (skipped ${skipped}):`);
for (const [m, n] of Object.entries(perMeter)) console.log(`  ${m.padEnd(18)} ${n}`);
console.log(`source: ${srcFiles.length} files`);
