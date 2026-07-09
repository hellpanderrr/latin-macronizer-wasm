#!/usr/bin/env node
/**
 * Compare FallbackTagger output against Python reference (Docker-based).
 *
 * Usage:
 *   node test/compare.mjs                        # Run both + compare
 *   node test/compare.mjs --quick                # Just analyze TS output
 *   node test/compare.mjs --docker-only          # Just run Docker Python
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const TEXT_FILE = join(ROOT, 'archive', 'root-originals', 'caesar.txt');
const TEXT = readFileSync(TEXT_FILE, 'utf-8');

// ─── Wordlist as ground truth ──────────────────────────────────────────
function loadWordlist() {
  const lines = readFileSync(join(ROOT, 'public', 'macrons.txt'), 'utf-8').split('\n');
  const map = new Map(); // wordform → Set of macronized forms (as macronizer would output)
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split(/\s+/);
    if (parts.length >= 4) {
      const wf = parts[0].toLowerCase();
      const mac = convertWordlistEntry(parts[3]);
      if (!map.has(wf)) map.set(wf, new Set());
      map.get(wf).add(mac);
    }
  }
  return map;
}

function convertWordlistEntry(raw) {
  // Python's token.py strips all ^ then uses _ as macron marker in DP alignment
  // _^ is also a combined marker stripped together
  return raw
    .replace(/_?\^/g, '')  // Strip ^ and _^ (accent/breve markers)
    .replace(/a_/g, 'ā').replace(/e_/g, 'ē').replace(/i_/g, 'ī')
    .replace(/o_/g, 'ō').replace(/u_/g, 'ū')
    .replace(/A_/g, 'Ā').replace(/E_/g, 'Ē').replace(/I_/g, 'Ī')
    .replace(/O_/g, 'Ō').replace(/U_/g, 'Ū');
}

// ─── Run CLI ────────────────────────────────────────────────────────────
async function runCLI() {
  const { Macronizer } = await import(
    pathToFileURL(join(ROOT, 'dist', 'core', 'Macronizer.js')).href
  );

  const dataDir = join(ROOT, 'dist', 'data');
  const lemmaData = JSON.parse(readFileSync(join(dataDir, 'lemmas.json'), 'utf-8'));
  const endingData = JSON.parse(readFileSync(join(dataDir, 'endings.json'), 'utf-8'));
  const wordlistText = readFileSync(join(ROOT, 'public', 'macrons.txt'), 'utf-8');

  const macronizer = new Macronizer({
    useWasm: false, useMorpheus: false, wordlistMode: 'memory',
    lemmaData, endingData,
  });

  await macronizer.initialize(() => {});
  await macronizer.loadWordlistFromText(wordlistText);

  const result = await macronizer.macronize(TEXT, { scan: 'prose' });
  macronizer.destroy();
  return result;
}

// ─── Run Python via Docker ──────────────────────────────────────────────
function runPythonDocker() {
  console.error('Building Docker image and running Python macronizer...');
  const dockerDir = join(ROOT, 'archive', 'build-scripts');

  // Save input text to temp file
  const tmpInput = '/tmp/caesar-input.txt';
  writeFileSync(tmpInput, TEXT, 'utf-8');

  try {
    const output = execSync(
      `docker build -f Dockerfile.test -t macronizer-test "${ROOT}" && ` +
      `docker run --rm -i macronizer-test /bin/bash -c ` +
      `'cd /app && cat > /tmp/in.txt && python3 -c "` +
      `import sys; sys.path.insert(0,\\\"python\\\"); ` +
      `from macronizer import Macronizer; ` +
      `m = Macronizer(); ` +
      `m.settext(sys.stdin.read()); ` +
      `print(m.gettext(True, False, False, False))"` +
      `' < "${tmpInput}"`,
      { cwd: dockerDir, encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
    );
    return output;
  } catch (e) {
    console.error('Docker run failed:', e.message);
    if (e.stdout) console.error('stdout:', e.stdout.slice(0, 500));
    if (e.stderr) console.error('stderr:', e.stderr.slice(0, 500));
    return null;
  }
}

// ─── Analyze ────────────────────────────────────────────────────────────
function normalizeForCompare(s) {
  // Case-insensitive, normalizes j↔i orthographic variants
  return s.toLowerCase().replace(/j/g, 'i');
}

async function main() {
  const args = process.argv.slice(2);
  const dockerOnly = args.includes('--docker-only');

  const wordlist = loadWordlist();
  console.error(`Wordlist: ${wordlist.size} unique wordforms`);

  if (!dockerOnly) {
    console.error('Running CLI...');
    const tsResult = await runCLI();

    // Analyze word by word
    const words = TEXT.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const known = [], unknown = [], correct = [], incorrect = [];

    for (const w of words) {
      if (!wordlist.has(w)) { unknown.push(w); continue; }
      known.push(w);

    }

    // Token-level comparison (using taggedTokens which have macronizedText)
    const tokens = tsResult.taggedTokens.filter(t => t.isWord);
    let tokenCorrect = 0, tokenTotal = 0;
    let ambiguousOK = 0, ambiguousWrong = 0, noAmbiguity = 0;

    for (const t of tokens) {
      const text = t.text || '';
      const wf = text.toLowerCase();
      if (!wordlist.has(wf)) { unknown.push(wf); continue; }
      tokenTotal++;

      // Get the macronized form from the result
      const macronizedForm = t.macronizedText || '';
      const normalizedForm = normalizeForCompare(macronizedForm);
      const expectedForms = wordlist.get(wf);
      const normalizedExpected = new Set([...expectedForms].map(normalizeForCompare));
      const hasUniqueForm = normalizedExpected.size === 1;

      if (expectedForms && normalizedExpected.has(normalizedForm)) {
        tokenCorrect++;
        if (!hasUniqueForm) ambiguousOK++;
        else noAmbiguity++;
      } else {
        incorrect.push({ word: wf, got: macronizedForm, expected: [...expectedForms].slice(0,3) });
        if (!hasUniqueForm) ambiguousWrong++;
      }
    }

    // Report
    console.log('\n=== FALLBACK TAGGER ACCURACY ===');
    console.log(`Text words (total):  ${words.length}`);
    console.log(`Known in wordlist:   ${known.length}`);
    console.log(`Unknown wordforms:   ${unknown.length}`);
    console.log(`Token checks:        ${tokenTotal}`);
    console.log(`Correct macrons:     ${tokenCorrect}`);
    console.log(`Word-level accuracy: ${tokenTotal ? (tokenCorrect/tokenTotal*100).toFixed(1) : 'N/A'}%`);
    console.log(`Confidence (model):  ${(tsResult.confidence * 100).toFixed(0)}%`);
    console.log(`Processing time:     ${tsResult.processingTime}ms`);
    console.log(`\nAmbiguity analysis:`);
    console.log(`  Unique macron form:  ${noAmbiguity}`);
    console.log(`  Multiple possible:   ${ambiguousOK + ambiguousWrong}`);
    console.log(`    → correct pick:    ${ambiguousOK}`);
    console.log(`    → wrong pick:      ${ambiguousWrong}`);

    if (incorrect.length > 0) {
      console.log(`\nMismatches (first 20 of ${incorrect.length}):`);
      for (const m of incorrect.slice(0, 20)) {
        console.log(`  "${m.word}" → got "${m.got}", expected one of [${m.expected.join(', ')}]`);
      }
    }

    // Save output for comparison
    writeFileSync(join(ROOT, 'archive', 'debug-outputs', 'cli-output.txt'), tsResult.macronized);
    console.error('\nCLI output saved to archive/debug-outputs/cli-output.txt');
  }

  // ─── Docker Python comparison ──────────────────────────────────────────
  if (!args.includes('--quick')) {
    const start = Date.now();
    const pyResult = runPythonDocker();
    if (pyResult) {
      const elapsed = Date.now() - start;
      writeFileSync(join(ROOT, 'archive', 'debug-outputs', 'python-output.txt'), pyResult);
      console.error(`Python ran in ${elapsed}ms, output saved.`);

      // Compare with TS output
      const tsOut = readFileSync(join(ROOT, 'archive', 'debug-outputs', 'cli-output.txt'), 'utf-8');

      let charMatch = 0, charTotal = 0;
      for (let i = 0; i < Math.min(tsOut.length, pyResult.length); i++) {
        if (tsOut[i] === pyResult[i]) charMatch++;
        charTotal++;
      }

      console.log(`\n=== DIRECT COMPARISON ===`);
      console.log(`Characters compared: ${charTotal}`);
      console.log(`Character match:     ${charMatch} (${(charMatch/charTotal*100).toFixed(1)}%)`);
      console.log(`TS length:           ${tsOut.length}`);
      console.log(`Python length:       ${pyResult.length}`);
      console.log(`TS output:   ${tsOut.slice(0, 200)}...`);
      console.log(`Python output: ${pyResult.slice(0, 200)}...`);
    } else {
      console.log('\nPython Docker run failed or skipped.');
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
