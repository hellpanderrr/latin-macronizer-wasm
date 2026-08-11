#!/usr/bin/env node
/**
 * Scansion regression test over the full verse corpus (M-013 gate).
 *
 * Feeds every line of test/data/corpus/<meter>/<file>.txt through the
 * macronizer and checks two things:
 *
 *  1. GOLDEN LINES — a handful of canonical verses MUST scan (regression
 *     protection for the italorum fix and friends). If one of these stops
 *     scanning, the engine or wordlist regressed.
 *
 *  2. NO NEW FAILURES — the set of lines that fail to scan must not grow
 *     beyond the recorded snapshot (test/data/scansion-failures-snapshot.json).
 *     The snapshot encodes the known engine limitations (153 lines as of
 *     2026-08-05: Greek-name quantities, diphthong/elision edge cases, the
 *     hendecasyllable automaton's strictness). A NEW failing line — a real
 *     verse that USED to scan but no longer does — is the italorum signature
 *     and fails this test.
 *
 * Usage: node test/e2e/test-scansion-corpus.mjs   (requires npm run build)
 * Exit 0 = pass, 1 = fail.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CORPUS = path.join(ROOT, 'test/data/corpus');
const SNAPSHOT = path.join(ROOT, 'test/data/scansion-failures-snapshot.json');
const require = createRequire(import.meta.url);
require('fake-indexeddb/auto');

// ---------- fetch shim (same as miner-scansion.mjs) ----------
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
    if (re.test(s.split('?')[0])) {
      return new Response(fs.readFileSync(file), { status: 200, headers: { 'Content-Type': type } });
    }
  }
  if (/cruncher\.(js|wasm|data)$/.test(s)) return new Response(null, { status: 404 });
  return realFetch(url);
};
globalThis.window = globalThis;
globalThis.self = globalThis;

const realFactory = require(path.join(ROOT, 'public/wasm/rftagger.js'));
const realVersionsDesc = Object.getOwnPropertyDescriptor(process, 'versions');
globalThis.RFTaggerModule = (cfg = {}) => {
  Object.defineProperty(process, 'versions', { configurable: true, value: {} });
  try { return realFactory({ ...cfg, wasmBinary: fs.readFileSync(path.join(ROOT, 'public/wasm/rftagger.wasm')) }); }
  finally { Object.defineProperty(process, 'versions', realVersionsDesc); }
};

const { Macronizer } = await import('file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Macronizer.js');

// ---------- helpers ----------
const MACRON_MAP = { 'ā':'a','ē':'e','ī':'i','ō':'o','ū':'u','ȳ':'y','Ā':'A','Ē':'E','Ī':'I','Ō':'O','Ū':'U','Ȳ':'Y' };
function stripMacrons(s) {
  return s.replace(/[āēīōūȳĀĒĪŌŪȲăĕĭŏŭĂĔĬŎŬ]/g, ch => MACRON_MAP[ch] || 'aeiouy'['AEIOUY'.indexOf(ch)] || ch);
}
// Strip macrons FIRST — the corpus is stored macronized (canō, Trōiae), and a
// naive [^a-z ] strip would drop macron-vowels entirely, mangling the key.
function normalizeLine(line) {
  return stripMacrons(line).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// A line is an INCOMPLETE scan if its feet string is missing or shorter than a
// full scan of its meter. Meter-dependent (M-013d — the gate used to check
// `feet === ''` only, so a hexameter that scanned 5 feet (`SSDDD`) passed):
//   dactylichexameter: 6 feet. A 5-foot scan is a hidden partial — a complete
//     verse that only scanned 5 of 6 feet (the M-013d failure class). Lines
//     scanning 1-4 feet are genuine hemistichs/fragments (Hic cursus fuit:,
//     Dardanidae.) — correct partials, NOT failures, so they are not flagged.
//   hendecasyllable: 11 positions (-/u). Any short scan is incomplete.
//   elegiacdistichs: both hexameter (6) and pentameter (D,D,-,D,D,- = 6) emit 6.
function isIncompleteScan(feet, meter) {
  if (feet === undefined || feet === '') return true;
  switch (meter) {
    case 'dactylichexameter':
      return feet.length === 5; // 1-4 feet = genuine hemistich, not a failure
    case 'hendecasyllable':
      return feet.length < 11;
    case 'elegiacdistichs':
      return feet.length < 6;
    default:
      return false;
  }
}

// Canonical verses that MUST scan — regression protection.
// Verified as of 2026-08-05: each scans cleanly in the current build.
// 2026-08-09: added the -ērunt/-ĕrunt alternation fixes (Aen 2.774 obstipuī,
// Aen 6.212 cōnstitērunt) — the needle matches both the uox and vox spellings.
const GOLDEN = [
  // { meter, needle } — needle is a distinctive normalized fragment of the line.
  { meter: 'hendecasyllable', needle: 'iam tum cum ausus es unus italorum' },   // Catullus 1.5 — italorum fix
  { meter: 'hendecasyllable', needle: 'cui dono lepidum novum libellum' },      // Catullus 1.1
  { meter: 'hendecasyllable', needle: 'vivamus mea lesbia atque amemus' },      // Catullus 5.1
  { meter: 'dactylichexameter', needle: 'arma virumque cano troiae qui primus ab oris' }, // Aen 1.1
  { meter: 'hendecasyllable', needle: 'quare habe tibi quidquid hoc libelli' }, // Catullus 1.8
  { meter: 'dactylichexameter', needle: 'obstipui steteruntque comae et' },     // Aen 2.774 — -ērunt/-ĕrunt fix (uox + vox)
  { meter: 'dactylichexameter', needle: 'constiterunt silva alta iovis' },      // Aen 6.212 — -ērunt/-ĕrunt fix
  { meter: 'dactylichexameter', needle: 'hi summo in fluctu pendent his unda dehiscens' }, // Aen 1.106 — dehiscens override
  { meter: 'dactylichexameter', needle: 'fata tibi cernes urbem et promissa lavini' },     // Aen 1.263 — Lavini override
  { meter: 'dactylichexameter', needle: 'cum subito adsurgens fluctu nimbosus orion' },    // Aen 1.535 — Orion override
  { meter: 'dactylichexameter', needle: 'ecqua tamen puero est amissae cura' },            // Aen 3.488 — ecqua override
  { meter: 'dactylichexameter', needle: 'exercet diana choros quam mille' },               // Aen 1.499 — Diana override
  { meter: 'dactylichexameter', needle: 'hac phryges instaret curru cristatus' },          // Aen 1.102 — Phryges override
  { meter: 'dactylichexameter', needle: 'egressi optata potiuntur troes harena' },         // Aen 1.30 — Troes override
  { meter: 'dactylichexameter', needle: 'unius ob noxam et furias aiacis oilei' },         // Aen 1.41 — Oilei override
  { meter: 'dactylichexameter', needle: 'quid thesea magnum' },                            // Aen 6.122 — Thesea override
  { meter: 'elegiacdistichs', needle: 'quandoquidem fortuna mihi tete abstulit' },         // Catullus 101.5 — quandoquidem+tete overrides
  { meter: 'hendecasyllable', needle: 'quod zonam soluit diu ligatam' },                   // Catullus 2b.13 — soluit override + ligatam corpus fix
  { meter: 'hendecasyllable', needle: 'deferri mane inquii puellae' },                     // Catullus 10.27 — mane override
  { meter: 'hendecasyllable', needle: 'dic nobis volo te ac tuos amores' },                // Catullus 6.16 — volo override
  { meter: 'dactylichexameter', needle: 'tertius euryalus' },                              // Aen 5.322 — y-synizesis (Euryalus)
  { meter: 'dactylichexameter', needle: 'non tamen euryali non ille oblitus amorum' },     // Aen 5.334 — y-synizesis (Euryali)
];

async function createMacronizer() {
  const m = new Macronizer({ useWasm: true, wordlistUrl: '/macrons.txt' });
  m.morpheusAnalyzer = null;
  m.wordlistEngine.setMorpheusAnalyzer({
    isInitialized: () => true,
    analyzeBatch: (words) => words.map(w => ({ word: w, success: false, analyses: [] })),
  });
  await m.initialize();
  return m;
}

function scanLine(m, line, meter) {
  return m.macronize(stripMacrons(line) + '\n', {
    macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter,
  });
}

async function collectFailures(m, onLine) {
  const failures = [];
  for (const meter of fs.readdirSync(CORPUS)) {
    const meterDir = path.join(CORPUS, meter);
    if (!fs.statSync(meterDir).isDirectory()) continue;
    if (!['dactylichexameter', 'hendecasyllable', 'elegiacdistichs', 'iambic'].includes(meter)) continue;
    for (const file of fs.readdirSync(meterDir)) {
      if (!file.endsWith('.txt')) continue;
      const text = fs.readFileSync(path.join(meterDir, file), 'utf-8');
      // Keep INTERIOR empty lines — in gold-extracted corpora they are LACUNAE
      // (real verse positions with no words, e.g. Catullus 68 lines 47/142/143),
      // and the engine advances the meter automaton on them so an alternating
      // elegiac poem stays hex/pent/hex/pent. Drop only the trailing file-final
      // newline artifact.
      const raw = text.split('\n');
      if (raw.length > 0 && raw[raw.length - 1].trim() === '') raw.pop();
      const lines = raw.map(l => l.trim());
      const joined = lines.join('\n');
      let result;
      try {
        result = await m.macronize(stripMacrons(joined), {
          macronize: true, alsomaius: false, performutov: false, performitoj: false, scan: meter,
        });
      } catch (e) {
        failures.push({ file, meter, line: `[ERROR: ${e.message}]`, norm: `__error_${file}__` });
        continue;
      }
      const feet = result.scannedFeet || [];
      for (let i = 0; i < lines.length; i++) {
        // Skip non-verse lines (e.g. the "* * * * * * * *" dividers in the
        // Catullus files): they have empty feet by design and are not scansion
        // failures. The engine now emits an empty placeholder for them so the
        // feet array stays index-aligned with lines.
        const norm = normalizeLine(lines[i]);
        if (!norm) continue;
        if (onLine) onLine({ file, meter, line: lines[i], feet: feet[i] });
        if (isIncompleteScan(feet[i], meter)) {
          failures.push({ file, meter, line: lines[i], norm });
        }
      }
    }
  }
  return failures;
}

async function main() {
  const m = await createMacronizer();
  let failed = 0;

  // ---- 1. Golden lines must scan ----
  console.log('=== Golden lines (must scan) ===');
  const goldenByNeedle = new Map();
  await collectFailures(m, ({ meter, line, feet }) => {
    const n = normalizeLine(line);
    // A golden line must scan to a FULL meter (not just non-empty) — a golden
    // line that regressed to a 5-foot partial must fail.
    const scanned = !isIncompleteScan(feet, meter);
    for (const g of GOLDEN) {
      // Only a line that actually SCANNED (full-length feet) counts as passing.
      // (The feet check is the whole point of the golden list — without it a
      // golden line that stopped scanning would silently pass.)
      if (g.meter === meter && n.includes(g.needle) && scanned) goldenByNeedle.set(g.needle, true);
    }
  });
  for (const g of GOLDEN) {
    const ok = goldenByNeedle.has(g.needle);
    console.log(`  ${ok ? '✓' : '✗'} [${g.meter}] ${g.needle}`);
    if (!ok) { failed++; }
  }

  // ---- 2. No new failures beyond the snapshot ----
  console.log('\n=== Corpus failure gate ===');
  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf-8'));
  } catch (e) {
    console.error(`  ✗ cannot read snapshot ${SNAPSHOT}: ${e.message}`);
    process.exit(1);
  }
  const known = new Set(snapshot.map(f => `${f.file}|${f.meter}|${f.norm}`));
  const current = await collectFailures(m);

  const newFailures = current.filter(f => !known.has(`${f.file}|${f.meter}|${f.norm}`));
  const fixedLines = [...known].filter(k => {
    const [, meter, norm] = k.split('|');
    return !current.some(f => f.meter === meter && f.norm === norm);
  });

  console.log(`  baseline snapshot: ${snapshot.length} failing lines`);
  console.log(`  current:           ${current.length} failing lines`);
  if (fixedLines.length) {
    console.log(`  ✓ ${fixedLines.length} previously-failing line(s) now scan:`);
    for (const k of fixedLines.slice(0, 5)) {
      const [, meter, norm] = k.split('|');
      console.log(`      [${meter}] ${norm}`);
    }
    if (fixedLines.length > 5) console.log(`      … and ${fixedLines.length - 5} more`);
  }
  if (newFailures.length) {
    console.error(`  ✗ ${newFailures.length} NEW failing line(s) — the italorum signature:`);
    for (const f of newFailures.slice(0, 10)) {
      console.error(`      [${f.file} ${f.meter}] ${f.line}`);
    }
    if (newFailures.length > 10) console.error(`      … and ${newFailures.length - 10} more`);
    failed += newFailures.length;
  } else {
    console.log('  ✓ no new failures — failure set is exactly the known baseline');
  }

  m.destroy();
  console.log(`\n=== ${failed === 0 ? 'PASS' : 'FAIL'} (${failed} problem(s)) ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
