#!/usr/bin/env node
/**
 * Gold-align: for each failing scansion line, dump the hypotactic gold
 * per-syllable L/S pattern next to the engine's token candidates, so the
 * culprit quantity is obvious.
 *
 * Usage:
 *   node test/gold-align.mjs --gold <vergil.json path>
 *   node test/gold-align.mjs --gold <vergil.json> --file aeneid-1.txt
 *
 * Gold path defaults to the temp hypotactic dir. Reads the failure snapshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const args = process.argv.slice(2);
function argVal(name) { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : undefined; }
const goldPath = argVal('--gold') || 'C:/Users/HELLPA~1/AppData/Local/Temp/hypotactic_data_6_17_2025/vergil.json';
const onlyFile = argVal('--file');

const gold = JSON.parse(fs.readFileSync(goldPath, 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/data/scansion-failures-snapshot.json'), 'utf8'));

const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y' };
function stripMacrons(s) { return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch] || 'aeiouy'['AEIOUY'.indexOf(ch)] || ch); }
const PUNCT = /[^a-z ]/g;
function norm(s) { return stripMacrons(s).toLowerCase().replace(PUNCT, ' ').replace(/\s+/g, ' ').trim(); }

// Build a map: book-file-name -> gold lines (Aeneid N -> aeneid-N.txt)
const BOOKMAP = {
  'Aeneid 1': 'aeneid-1.txt', 'Aeneid 2': 'aeneid-2.txt', 'Aeneid 3': 'aeneid-3.txt',
  'Aeneid 4': 'aeneid-4.txt', 'Aeneid 5': 'aeneid-5.txt', 'Aeneid 6': 'aeneid-6.txt',
};
const lines = [];
for (const book of Object.keys(gold['Vergil']['Aeneid'])) {
  const fn = BOOKMAP[book];
  if (!fn) continue;
  const poem = gold['Vergil']['Aeneid'][book][0]['poem content'];
  for (const entry of poem) {
    const words = [];
    for (const seg of entry.segments) for (const w of seg.words) words.push(w);
    const txt = words.map(w => w.text).join(' ');
    lines.push({ file: fn, lineNum: entry['line number'], norm: norm(txt), words });
  }
}
// Catullus 64 from catullus.json
const catPath = goldPath.replace('vergil.json', 'catullus.json');
if (fs.existsSync(catPath)) {
  const cg = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  const poem = cg['Catullus'][0]['poem content'];
  for (const entry of poem) {
    const words = [];
    for (const seg of entry.segments) for (const w of seg.words) words.push(w);
    const txt = words.map(w => w.text).join(' ');
    lines.push({ file: 'catullus-LXIV.txt', lineNum: entry['line number'], norm: norm(txt), words });
  }
}

const byNorm = new Map();
for (const l of lines) byNorm.set(l.norm, l);

function wordPattern(w) {
  const s = [];
  for (const sy of w.syllables) {
    let len = sy.length;
    if (len === 'long') s.push('L');
    else if (len === 'short') s.push('S');
    else if (len === 'anceps') s.push('X');
    else if (len === 'longum' || len === 'breve') s.push(len.startsWith('long') ? 'L' : 'S');
    else s.push('?');
  }
  return s.join('');
}

let matched = 0, unmatched = 0;
for (const fail of snapshot) {
  if (onlyFile && fail.file !== onlyFile) continue;
  const gold = byNorm.get(norm(fail.norm));
  console.log(`\n=== ${fail.file}: ${fail.line}`);
  if (!gold) { console.log('   (no gold match)'); unmatched++; continue; }
  matched++;
  console.log(`  gold line ${gold.lineNum}: ${gold.words.map(w => w.text).join(' ')}`);
  console.log(`  gold per-word: ${gold.words.map(w => `${w.text}=${wordPattern(w)}`).join('  ')}`);
}
console.log(`\n${matched} matched, ${unmatched} unmatched`);
