#!/usr/bin/env node
/**
 * Whole-file scansion tracer.
 * Runs the joined corpus file (like the gate) so RFTagger POS matches
 * production, then traces exactly where a failing line's verse dies in the
 * meter automaton.
 *
 * Usage: node test/trace-scansion.mjs [--file aeneid-3.txt] [--needle obstipui] [--limit N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CORPUS = path.join(ROOT, 'test/data/corpus');
const require = createRequire(import.meta.url);
require('fake-indexeddb/auto');
const args = process.argv.slice(2);
function argVal(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}
const onlyFile = argVal('--file');
const needle = argVal('--needle');

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
const { possibleScans, allVowelsAmbiguous, scanVerse } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Scansion.js');
const meters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/meters.json'), 'utf-8'));

const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y' };
function stripMacrons(s) {
  return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch] || 'aeiouy'['AEIOUY'.indexOf(ch)] || ch);
}
async function createMacronizer() {
  const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
  m.morpheusAnalyzer = null;
  m.wordlistEngine.setMorpheusAnalyzer({ isInitialized: () => true, analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })) });
  await m.initialize();
  return m;
}

function computeFollowingSegment(tokens, index) {
  let followingText = '';
  let nextIndex = index;
  while (true) {
    nextIndex++;
    if (nextIndex === tokens.length || (tokens[nextIndex].text || '').includes('\n')) break;
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

function tracedScanVerse(verse, automaton, labels) {
  let deathAt = -1;
  let reason = '';
  function recurse(wordIndex, nodeIndex, path) {
    if (wordIndex === verse.length) return { ok: true, path, deathAt: -1, reason: '' };
    const [tokenIndex, wordScans] = verse[wordIndex];
    for (const { scansion, accented } of wordScans) {
      let ni = nodeIndex;
      let finished = false;
      let died = false;
      for (const syl of scansion) {
        const trans = automaton[`(${ni}, '${syl}')`];
        if (!trans || trans[0] === -1) { died = true; break; }
        ni = trans[0];
        if (ni === 0) finished = true;
      }
      // Mirror the REAL scanVerse guard exactly:
      if (died || (finished && (ni !== 0 || wordIndex !== verse.length - 1))) continue;
      const r = recurse(wordIndex + 1, ni, [...path, `${labels[tokenIndex]||tokenIndex}->${accented}[${scansion}]`]);
      if (r.ok) return r;
    }
    if (deathAt === -1) {
      deathAt = wordIndex;
      const [ti, wscans] = verse[wordIndex];
      reason = `dies at "${labels[ti]||ti}": ${wscans.map(s => `${s.accented}[${s.scansion}]`).join(' | ')}\n` +
        `  path so far: ${path.join(' ') || '(none)'}`;
    }
    return { ok: false, deathAt, reason };
  }
  return recurse(0, 0, []);
}

async function main() {
  const m = await createMacronizer();
  for (const meter of fs.readdirSync(CORPUS)) {
    const meterDir = path.join(CORPUS, meter);
    if (!fs.statSync(meterDir).isDirectory()) continue;
    if (!['dactylichexameter', 'hendecasyllable', 'elegiacdistichs', 'iambic'].includes(meter)) continue;
    for (const file of fs.readdirSync(meterDir)) {
      if (!file.endsWith('.txt')) continue;
      if (onlyFile && file !== onlyFile) continue;
      const text = fs.readFileSync(path.join(meterDir, file), 'utf-8');
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const joined = lines.join('\n');
      let res;
      try {
        res = await m.macronize(stripMacrons(joined), { macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter });
      } catch (e) { console.log(`[ERROR] ${file}: ${e.message}`); continue; }
      const feet = res.scannedFeet || [];
      const tokens = res.taggedTokens || res.tokens || [];

      // Map each token to its line index (number of newlines seen before it).
      const lineOf = new Map();
      let nl = 0;
      for (let ti = 0; ti < tokens.length; ti++) {
        const txt = (tokens[ti].text || '');
        lineOf.set(ti, nl);
        const n = (txt.match(/\n/g) || []).length;
        nl += n;
      }
      for (let li = 0; li < lines.length; li++) {
        if (feet[li] !== undefined && feet[li] !== '') continue; // scans fine
        if (needle && !lines[li].toLowerCase().includes(needle)) continue;
        const verse = [];
        const labels = {};
        for (let ti = 0; ti < tokens.length; ti++) {
          if (lineOf.get(ti) !== li || !tokens[ti].isWord) continue;
          labels[ti] = tokens[ti].text;
          const seg = computeFollowingSegment(tokens, ti);
          const cands = [...(tokens[ti].accented || [''])];
          if (tokens[ti].isUnknown) cands.push(allVowelsAmbiguous(tokens[ti].text.toLowerCase()));
          verse.push([ti, possibleScans(cands, seg)]);
        }
        if (!verse.length) continue;
        const { ok, reason } = tracedScanVerse(verse, meters[meter], labels);
        const gateFeet = feet[li] ?? '';
        // Cross-check with the REAL scanVerse.
        const real = scanVerse(verse, meters[meter]);
        console.log(`\n${ok ? '✓' : '✗'} [${meter}] ${lines[li]}  (gate feet=${JSON.stringify(gateFeet)}, real scanVerse=${JSON.stringify(real.feet)}, traced=${ok})`);
        if (reason) console.log(`   ${reason}`);
        if (ok !== (real.feet !== '')) {
          console.log(`   ⚠ TRACER MISMATCH — verse:`);
          for (const [ti, scans] of verse) console.log(`     ${labels[ti]}: ${scans.map(s => `${s.accented}[${s.scansion}]`).join(' | ')}`);
        }
      }
    }
  }
  m.destroy();
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
