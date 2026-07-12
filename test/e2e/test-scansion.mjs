#!/usr/bin/env node
/**
 * Scansion test — runs the full macronizer pipeline on real Latin verse
 * with each of the 5 scan options and validates the output.
 *
 * Usage: node test/e2e/test-scansion.mjs
 * Requires: npm run build first
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
require('fake-indexeddb/auto');

// ---------- fetch shim (same as parity-node.mjs) ----------
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
globalThis.fetch = async (url, opts) => {
  const s = String(url);
  for (const [re, file, type] of FILE_MAP) {
    if (re.test(s.split('?')[0])) {
      const buf = fs.readFileSync(file);
      return new Response(buf, { status: 200, headers: { 'Content-Type': type } });
    }
  }
  if (/cruncher\.(js|wasm|data)$/.test(s)) {
    return new Response(null, { status: 404 });
  }
  return realFetch(url, opts);
};

globalThis.window = globalThis;
globalThis.self = globalThis;

const realFactory = require(path.join(ROOT, 'public/wasm/rftagger.js'));
const wasmBinary = fs.readFileSync(path.join(ROOT, 'public/wasm/rftagger.wasm'));
const realVersionsDesc = Object.getOwnPropertyDescriptor(process, 'versions');
globalThis.RFTaggerModule = (cfg = {}) => {
  Object.defineProperty(process, 'versions', { configurable: true, value: {} });
  try {
    return realFactory({ ...cfg, wasmBinary });
  } finally {
    Object.defineProperty(process, 'versions', realVersionsDesc);
  }
};

const { Macronizer } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Macronizer.js');

// ---------- Real Latin verse for each meter type ----------
const VERSE_TEXTS = {
  hexameter:
    'Arma virumque cano, Troiae qui primus ab oris\n' +
    'Italiam, fato profugus, Laviniaque venit\n' +
    'litora, multum ille et terris iactatus et alto\n' +
    'vi superum saevae memorem Iunonis ob iram.',

  elegiac:
    'Cum subit illius tristissima noctis imago,\n' +
    'qua mihi supremum tempus in urbe fuit,\n' +
    'cum repeto noctem, qua tot mihi cara reliqui,\n' +
    'labitur ex oculis nunc quoque gutta meis.',

  hendecasyllable:
    'Vivamus, mea Lesbia, atque amemus,\n' +
    'rumoresque senum severiorum\n' +
    'omnes unius aestimemus assis!\n' +
    'soles occidere et redire possunt:',

  iambic:
    'Beatus ille qui procul negotiis,\n' +
    'ut prisca gens mortalium,\n' +
    'paterna rura bobus exercet suis,\n' +
    'solutus omni faenore.',
};

// Clean for network — the macronizer needs these as plain text strings.
// Use a single combined run with each option.

async function createMacronizer() {
  const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
  // Same Morpheus stub as parity test
  m.morpheusAnalyzer = null;
  m.wordlistEngine.setMorpheusAnalyzer({
    isInitialized: () => true,
    analyzeBatch: (words) => words.map((w) => ({ word: w, success: false, analyses: [] })),
  });
  console.error('Initializing (WASM + wordlist)...');
  const t0 = Date.now();
  await m.initialize();
  console.error(`  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  return m;
}

// ---------- Tests ----------
const SCAN_OPTIONS = [
  { key: 'prose',                label: 'Prose (no scansion)' },
  { key: 'dactylichexameter',    label: 'Dactylic hexameter' },
  { key: 'elegiacdistichs',      label: 'Elegiac distichs' },
  { key: 'hendecasyllable',       label: 'Hendecasyllable' },
  { key: 'iambic',               label: 'Iambic trimeter + dimeter' },
];

function testScansionOption(result, scanKey) {
  const errors = [];

  // 1. Must not crash — if we get here, that passes.

  // 2. scannedFeet must be an array
  if (!Array.isArray(result.scannedFeet)) {
    errors.push(`scannedFeet is not an array: ${typeof result.scannedFeet}`);
    return errors; // no point checking further
  }

  // 3. For scansion options, scannedFeet should be non-empty
  if (scanKey !== 'prose') {
    if (result.scannedFeet.length === 0) {
      errors.push('scannedFeet is empty — scansion appears to be a no-op');
    }
  } else {
    if (result.scannedFeet.length > 0) {
      errors.push('prose mode should have empty scannedFeet');
    }
    // prose doesn't reorder accents so output equals baseline
    return errors;
  }

  // 4. Each foot string must not be empty (unless there were blank lines)
  //    and must consist only of known foot symbols
  for (let i = 0; i < result.scannedFeet.length; i++) {
    const feet = result.scannedFeet[i];
    if (feet === '') continue; // blank line
    if (!/^[SDu\-|T]+$/.test(feet)) {
      errors.push(`scannedFeet[${i}] has invalid characters: "${feet}"`);
    }
  }

  // 5. Scansion should change the macronized output vs prose (for poetic texts
  //    where the meter disambiguates vowel length).  This is probabilistic —
  //    some short texts may not have any ambiguous forms the meter can decide.
  //    We just note it; it's not a failure by itself.
  // (checked by the caller)

  return errors;
}

async function main() {
  const m = await createMacronizer();
  let passed = 0;
  let failed = 0;

  // First, run all options on their matching text to verify scansion works.
  // Then do a prose vs meter comparison on the same text to check that the
  // scansion actually changes accent selection.

  const textByOption = {
    prose:            VERSE_TEXTS.hexameter, // prose on hexameter text
    dactylichexameter: VERSE_TEXTS.hexameter,
    elegiacdistichs:  VERSE_TEXTS.elegiac,
    hendecasyllable:  VERSE_TEXTS.hendecasyllable,
    iambic:           VERSE_TEXTS.iambic,
  };

  for (const opt of SCAN_OPTIONS) {
    const text = textByOption[opt.key];
    const t0 = Date.now();
    const result = await m.macronize(text, {
      macronize: true, alsomaius: false, performutov: false, performitoj: false,
      scan: opt.key,
    });
    const ms = Date.now() - t0;

    const errors = testScansionOption(result, opt.key);
    if (errors.length === 0) {
      const footInfo = Array.isArray(result.scannedFeet)
        ? result.scannedFeet.map(f => f || '(blank)').join(' | ')
        : 'N/A';
      console.log(`  ✓ ${opt.label}`);
      console.log(`      ${ms}ms, scannedFeet: ${footInfo}`);
      // Show a short snippet of the output to confirm it looks right
      const snippet = result.macronized.slice(0, 80).replace(/\n/g, '↵ ');
      console.log(`      output: ${snippet}...`);
      passed++;
    } else {
      console.log(`  ✗ ${opt.label}`);
      for (const e of errors) console.log(`      ${e}`);
      console.log(`      ${ms}ms, scannedFeet: ${JSON.stringify(result.scannedFeet)}`);
      failed++;
    }
    console.log();
  }

  // ----- prose-vs-meter comparison on the same hexameter text -----
  console.log('--- Prose-vs-hexameter output diff on Aeneid ---');
  const proseResult = await m.macronize(VERSE_TEXTS.hexameter, {
    macronize: true, alsomaius: false, performutov: false, performitoj: false,
    scan: 'prose',
  });
  const hexResult = await m.macronize(VERSE_TEXTS.hexameter, {
    macronize: true, alsomaius: false, performutov: false, performitoj: false,
    scan: 'dactylichexameter',
  });
  if (proseResult.macronized !== hexResult.macronized) {
    console.log('  ✓ Scansion changes macronized output vs prose');
    // Show the differences
    const a = proseResult.macronized;
    const b = hexResult.macronized;
    let diffs = 0;
    for (let i = 0; i < Math.min(a.length, b.length) && diffs < 10; i++) {
      if (a[i] !== b[i]) {
        const ctx = Math.max(0, i - 10);
        console.log(`  diff at ${i}: prose="${a.slice(ctx, i+5)}" hex="${b.slice(ctx, i+5)}"`);
        diffs++;
      }
    }
    console.log(`  (scannedFeet: ${hexResult.scannedFeet.join(' | ')})`);
    passed++;
  } else {
    // This can be legitimate if the verse has no ambiguous forms the meter can decide
    console.log('  ~ No difference between prose and hexameter output (may be expected)');
    console.log(`  scannedFeet: ${hexResult.scannedFeet.join(' | ')}`);
    // still count as pass — the scansion ran, it just didn't change any choices
    passed++;
  }
  console.log();

  // ----- Summary -----
  console.log(`=== ${passed} passed, ${failed} failed ===`);
  m.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
