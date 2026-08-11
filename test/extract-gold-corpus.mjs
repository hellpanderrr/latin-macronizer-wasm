#!/usr/bin/env node
/**
 * Extract verified corpus text from hypotactic gold data (per-syllable
 * verified, macronized) into test/data/corpus/.
 *
 * The gold data is the AUTHORITATIVE source: every word's syllables carry
 * length annotations, so the extracted text is guaranteed to be a real
 * scannable verse. This is how we expand the corpus with NEW verified poetry
 * (Aeneid 7-12, Georgics, Eclogues, more Catullus) instead of hand/OCR
 * transcription.
 *
 * Usage:
 *   node test/extract-gold-corpus.mjs --vergil aeneid     # Aeneid 7-12 (hexameter)
 *   node test/extract-gold-corpus.mjs --vergil georgics   # Georgics 1-4 (hexameter)
 *   node test/extract-gold-corpus.mjs --vergil eclogues   # Eclogues 1-10 (hexameter)
 *   node test/extract-gold-corpus.mjs --catullus elegy    # Catullus elegiac distichs
 *   node test/extract-gold-corpus.mjs --vergil all
 *
 * Gold paths (temp, from hypotactic.com):
 *   C:/Users/HELLPA~1/AppData/Local/Temp/hypotactic_data_6_17_2025/vergil.json
 *   C:/Users/HELLPA~1/AppData/Local/Temp/hypotactic_data_6_17_2025/catullus.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CORPUS = path.join(ROOT, 'test/data/corpus');
const GOLD = 'C:/Users/HELLPA~1/AppData/Local/Temp/hypotactic_data_6_17_2025';

const args = process.argv.slice(2);
function has(flag) { return args.includes(flag); }

// Roman numerals up to 118 for Catullus poem numbers.
const ROMAN = ['', 'I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX',
  'XXI','XXII','XXIII','XXIV','XXV','XXVI','XXVII','XXVIII','XXIX','XXX','XXXI','XXXII','XXXIII','XXXIV','XXXV','XXXVI','XXXVII','XXXVIII','XXXIX','XL',
  'XLI','XLII','XLIII','XLIV','XLV','XLVI','XLVII','XLVIII','XLIX','L','LI','LII','LIII','LIV','LV','LVI','LVII','LVIII','LIX','LX',
  'LXI','LXII','LXIII','LXIV','LXV','LXVI','LXVII','LXVIII','LXIX','LXX','LXXI','LXXII','LXXIII','LXXIV','LXXV','LXXVI','LXXVII','LXXVIII','LXXIX','LXXX',
  'LXXXI','LXXXII','LXXXIII','LXXXIV','LXXXV','LXXXVI','LXXXVII','LXXXVIII','LXXXIX','XC','XCI','XCII','XCIII','XCIV','XCV','XCVI','XCVII','XCVIII','XCIX','C',
  'CI','CII','CIII','CIV','CV','CVI','CVII','CVIII','CIX','CX','CXI','CXII','CXIII','CXIV','CXV','CXVI','CXVII','CXVIII'];

// Normalize gold word text: curly quotes → straight, strip leading/trailing
// whitespace. Keep macrons (the corpus stores them; the gate strips on input).
function normWord(text) {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
}

function extractVerseLines(poemContent) {
  const lines = [];
  for (const entry of poemContent) {
    const words = [];
    for (const seg of entry.segments) {
      for (const w of seg.words) {
        words.push(normWord(w.text));
      }
    }
    lines.push(words.join(' '));
  }
  return lines;
}

function writeCorpus(subdir, filename, lines) {
  const dir = path.join(CORPUS, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, filename);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(`  wrote ${file} (${lines.length} lines)`);
}

function loadGold(file) {
  return JSON.parse(fs.readFileSync(path.join(GOLD, file), 'utf8'));
}

const done = {};

if (has('--vergil')) {
  const vergil = loadGold('vergil.json');
  const mode = args[args.indexOf('--vergil') + 1] || 'all';
  if (mode === 'all' || mode === 'aeneid') {
    for (let b = 7; b <= 12; b++) {
      const pc = vergil['Vergil']['Aeneid'][`Aeneid ${b}`][0]['poem content'];
      writeCorpus('dactylichexameter', `aeneid-${b}.txt`, extractVerseLines(pc));
      done.aeneid = (done.aeneid || 0) + 1;
    }
  }
  if (mode === 'all' || mode === 'georgics') {
    for (let g = 1; g <= 4; g++) {
      const pc = vergil['Vergil']['Georgics'][`Georgics ${g}`][0]['poem content'];
      writeCorpus('dactylichexameter', `georgics-${g}.txt`, extractVerseLines(pc));
      done.georgics = (done.georgics || 0) + 1;
    }
  }
  if (mode === 'all' || mode === 'eclogues') {
    for (let e = 1; e <= 10; e++) {
      const pc = vergil['Vergil']['Eclogues'][`Eclogue ${e}`][0]['poem content'];
      writeCorpus('dactylichexameter', `eclogue-${e}.txt`, extractVerseLines(pc));
      done.eclogues = (done.eclogues || 0) + 1;
    }
  }
}

if (has('--catullus')) {
  const catullus = loadGold('catullus.json');
  const mode = args[args.indexOf('--catullus') + 1] || 'elegy';
  const poems = catullus['Catullus']['Poems']['poems'];
  if (mode === 'elegy') {
    let n = 0;
    for (const po of poems) {
      if (String(po['poem metre']) !== 'elegy') continue;
      const pn = String(po['poem number']);
      const num = parseInt(pn, 10);
      const roman = ROMAN[num] || `P${num}`;
      // Preserve fragment suffixes (78b, 95b) so they don't collide with 78/95.
      const suffix = /b$/.test(pn) ? 'b' : '';
      writeCorpus('elegiacdistichs', `catullus-${roman}${suffix}.txt`, extractVerseLines(po['poem content']));
      n++;
    }
    done.catullusElegy = n;
  } else if (mode === 'all') {
    let n = 0;
    for (const po of poems) {
      const metre = String(po['poem metre']);
      if (metre !== 'elegy' && metre !== 'hendecasyllables') continue;
      const pn = String(po['poem number']);
      const num = parseInt(pn, 10);
      const roman = ROMAN[num] || `P${num}`;
      const suffix = /b$/.test(pn) ? 'b' : '';
      const subdir = metre === 'elegy' ? 'elegiacdistichs' : 'hendecasyllable';
      writeCorpus(subdir, `catullus-${roman}${suffix}.txt`, extractVerseLines(po['poem content']));
      n++;
    }
    done.catullusAll = n;
  }
}

console.log('\nSummary:', JSON.stringify(done));
