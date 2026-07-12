#!/usr/bin/env node
/**
 * Full comparison: Python macronizer (Docker) vs TS macronizer
 *
 * Usage:
 *   node test/compare-full.mjs [--wasm]   # Run comparison
 *   node test/compare-full.mjs --ref-only  # Just save Python reference output
 *   node test/compare-full.mjs --ts-only   # Just run TS side
 *
 * Requires:
 *   - Docker with python-macronizer image built
 *   - npm run build (for TS)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CAESAR_FILE = join(ROOT, 'test', 'data', 'caesar.txt');
const PY_OUTPUT = join(ROOT, 'test', 'data', 'py-output.txt');
const TS_OUTPUT = join(ROOT, 'test', 'data', 'ts-output.txt');
const RFTAGGER_OUTPUT = join(ROOT, 'test', 'data', 'native-tags-caesar.txt');

const TEXT = readFileSync(CAESAR_FILE, 'utf-8').replace(/\r/g, '').trim();

// ─── Helper: character-by-character diff ─────────────────────────────────
function compareOutputs(name1, text1, name2, text2) {
  const maxLen = Math.max(text1.length, text2.length);
  let match = 0, total = 0, macronMismatches = [];
  let nonMacronDiffsSeen = [];

  for (let i = 0; i < maxLen; i++) {
    const c1 = text1[i] || '';
    const c2 = text2[i] || '';
    if (!c1 || !c2) {
      nonMacronDiffsSeen.push({ pos: i, c1: JSON.stringify(c1), c2: JSON.stringify(c2) });
      continue;
    }
    total++;
    if (c1 === c2) { match++; continue; }

    if (/[āēīōūȳĀĒĪŌŪȲ]/.test(c1) || /[āēīōūȳĀĒĪŌŪȲ]/.test(c2)) {
      const start = Math.max(0, i - 25);
      const end = Math.min(text1.length, i + 25);
      let ctx = text1.slice(start, end).replace(/\n/g, '↵');
      if (start > 0) ctx = '…' + ctx;
      if (end < text1.length) ctx += '…';
      macronMismatches.push({ pos: i, c1, c2, ctx });
    } else {
      nonMacronDiffsSeen.push({ pos: i, c1, c2 });
    }
  }

  console.log(`\n=== ${name1} vs ${name2} ===`);
  console.log(`Length: ${name1}=${text1.length}  ${name2}=${text2.length}`);
  console.log(`Exact match: ${match}/${total} = ${(match/total*100).toFixed(2)}%`);
  console.log(`Macron mismatches: ${macronMismatches.length}`);
  console.log(`Other diffs: ${nonMacronDiffsSeen.length}`);

  if (macronMismatches.length > 0) {
    console.log(`\nMacron mismatches (first 30):`);
    for (const d of macronMismatches.slice(0, 30)) {
      console.log(`  [${d.pos}] ${name1}='${d.c1}' ${name2}='${d.c2}'  "${d.ctx}"`);
    }
    if (macronMismatches.length > 30) console.log(`  ... and ${macronMismatches.length - 30} more`);
  }
  if (nonMacronDiffsSeen.length > 0 && nonMacronDiffsSeen.length <= 30) {
    console.log(`\nNon-macron diffs:`);
    for (const d of nonMacronDiffsSeen.slice(0, 20)) {
      console.log(`  [${d.pos}] ${name1}=${d.c1} ${name2}=${d.c2}`);
    }
  }

  return { match, total, macronMismatches, nonMacronDiffsSeen };
}

// ─── Run Python via Docker ──────────────────────────────────────────────
async function runPython() {
  if (existsSync(PY_OUTPUT)) {
    console.log(`Python output already cached: ${PY_OUTPUT}`);
    return readFileSync(PY_OUTPUT, 'utf-8').replace(/\r/g, '').replace(/\n$/, '');
  }

  console.error('Running Python macronizer via Docker...');
  const start = Date.now();

  // Write input to a temp location
  writeFileSync('/tmp/caesar-input.txt', TEXT, 'utf-8');

  try {
    const result = spawnSync('docker', [
      'run', '--rm', '-i',
      '-e', 'PYTHONIOENCODING=utf-8',
      'python-macronizer'
    ], {
      input: TEXT,
      encoding: 'utf-8',
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.error('Docker stderr:', result.stderr?.slice(0, 2000));
      throw new Error(`Docker exited ${result.status}`);
    }

    const output = result.stdout.replace(/\r/g, '').replace(/\n$/, '');
    const elapsed = Date.now() - start;
    console.error(`Python completed in ${elapsed}ms (${output.length} chars)`);

    writeFileSync(PY_OUTPUT, output, 'utf-8');
    return output;
  } catch (e) {
    console.error('Python run failed:', e.message);
    return null;
  }
}

// ─── Run TS macronizer ──────────────────────────────────────────────────
async function runTS() {
  if (existsSync(TS_OUTPUT)) {
    console.log(`TS output already cached: ${TS_OUTPUT}`);
    return readFileSync(TS_OUTPUT, 'utf-8').replace(/\r/g, '').replace(/\n$/, '');
  }

  console.error('Running TS macronizer...');
  const start = Date.now();

  const { Macronizer } = await import(
    pathToFileURL(join(ROOT, 'dist', 'core', 'Macronizer.js')).href
  );

  const dataDir = join(ROOT, 'dist', 'data');
  const lemmaData = JSON.parse(readFileSync(join(dataDir, 'lemmas.json'), 'utf-8'));
  const endingData = JSON.parse(readFileSync(join(dataDir, 'endings.json'), 'utf-8'));
  const wordlistText = readFileSync(join(ROOT, 'public', 'macrons.txt'), 'utf-8');

  const macronizer = new Macronizer({
    useWasm: false,
    useMorpheus: false,
    wordlistMode: 'memory',
    lemmaData,
    endingData,
  });

  await macronizer.initialize(() => {});
  const loadStart = Date.now();
  await macronizer.loadWordlistFromText(wordlistText);
  console.error(`Wordlist loaded in ${Date.now() - loadStart}ms`);

  const result = await macronizer.macronize(TEXT, { scan: 'prose' });
  const elapsed = Date.now() - start;
  console.error(`TS completed in ${elapsed}ms (${result.macronized.length} chars)`);

  const output = result.macronized.replace(/\r/g, '').replace(/\n$/, '');
  writeFileSync(TS_OUTPUT, output, 'utf-8');

  // Also report accuracy stats
  reportAccuracy(result, wordlistText);

  macronizer.destroy();
  return output;
}

// ─── Wordlist accuracy analysis ─────────────────────────────────────────
function reportAccuracy(result, wordlistText) {
  // Build wordlist lookup
  const lines = wordlistText.split('\n');
  const map = new Map(); // wordform → Set of macronized forms
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split(/\s+/);
    if (parts.length >= 4) {
      const wf = parts[0].toLowerCase();
      const mac = parts[3].replace(/_?\^/g, '').replace(/a_/g, 'ā').replace(/e_/g, 'ē')
        .replace(/i_/g, 'ī').replace(/o_/g, 'ō').replace(/u_/g, 'ū')
        .replace(/A_/g, 'Ā').replace(/E_/g, 'Ē').replace(/I_/g, 'Ī')
        .replace(/O_/g, 'Ō').replace(/U_/g, 'Ū');
      if (!map.has(wf)) map.set(wf, new Set());
      map.get(wf).add(mac.toLowerCase());
    }
  }

  const tokens = result.taggedTokens.filter(t => t.isWord);
  let correct = 0, known = 0, unknown = 0;
  const mismatches = [];

  for (const t of tokens) {
    const wf = t.text.toLowerCase().replace(/j/g, 'i');
    const mac = (t.macronizedText || t.text || '').toLowerCase();
    if (!map.has(wf) && !map.has(t.text.toLowerCase())) {
      unknown++;
      continue;
    }
    known++;
    const forms = map.get(wf) || map.get(t.text.toLowerCase());
    if (forms && forms.has(mac)) {
      correct++;
    } else {
      mismatches.push({ word: t.text, got: t.macronizedText || t.text, expected: [...(forms||[])].slice(0, 3), tag: t.posTag });
    }
  }

  console.log(`\n=== TS FALLBACK TAGGER ACCURACY (vs wordlist) ===`);
  console.log(`Total word tokens: ${tokens.length}`);
  console.log(`Known in wordlist: ${known}`);
  console.log(`Unknown wordforms:  ${unknown}`);
  console.log(`Correct forms:     ${correct} (${known ? (correct/known*100).toFixed(1) : 'N/A'}%)`);

  if (mismatches.length > 0) {
    console.log(`\nMismatches (first 20 of ${mismatches.length}):`);
    for (const m of mismatches.slice(0, 20)) {
      console.log(`  "${m.word}" → got "${m.got}", expected [${m.expected.join(', ')}]  tag=${m.tag}`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  let pyOutput = null, tsOutput = null;

  if (!args.includes('--ts-only')) {
    pyOutput = await runPython();
  }
  if (!args.includes('--ref-only')) {
    tsOutput = await runTS();
  }

  if (pyOutput && tsOutput) {
    compareOutputs('Python', pyOutput, 'TS', tsOutput);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
