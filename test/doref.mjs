#!/usr/bin/env node
/**
 * Compare CLI output against a reference text.
 * Usage:
 *   node test/doref.mjs <ref.txt>          # Run CLI, compare against ref file
 *   node test/doref.mjs <ref.txt> <out.txt> # Same but read out file instead of running
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const refFile = process.argv[2];
  const outFile = process.argv[3];

  if (!refFile) { console.error('Usage: node test/doref.mjs <ref.txt> [out.txt]'); process.exit(1); }

  const refText = readFileSync(refFile, 'utf-8').replace(/\r/g, '').replace(/\n$/, '');
  let cliText;

  if (outFile && readFileSync(outFile, 'utf-8')) {
    cliText = readFileSync(outFile, 'utf-8').replace(/\r/g, '').replace(/\n$/, '');
  } else {
    // Run CLI, capture only stdout
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
    const result = await macronizer.macronize(refText, { scan: 'prose' });
    macronizer.destroy();
    cliText = result.macronized.replace(/\r/g, '').replace(/\n$/, '');
  }

  // Character-by-character comparison
  const maxLen = Math.max(refText.length, cliText.length);
  let match = 0, total = 0;
  const diffs = [];

  for (let i = 0; i < maxLen; i++) {
    const rc = refText[i] || '';
    const cc = cliText[i] || '';
    if (!rc || !cc) { diffs.push({pos: i, ref: JSON.stringify(rc), cli: JSON.stringify(cc), ctx: ''}); continue; }
    total++;
    if (rc === cc) { match++; continue; }

    // Extract context window
    const start = Math.max(0, i - 30);
    const end = Math.min(maxLen, i + 30);
    let ctx = refText.slice(start, end).replace(/\n/g, '\\n');
    if (start > 0) ctx = '...' + ctx;
    if (end < maxLen) ctx += '...';

    diffs.push({
      pos: i,
      ref: rc,
      cli: cc,
      ctx,
      refPrev: refText[i - 1] || '',
      cliPrev: cliText[i - 1] || ''
    });
  }

  const macronDiffs = diffs.filter(d => /[āēīōūȳĀĒĪŌŪȲ]/.test(d.ref) || /[āēīōūȳĀĒĪŌŪȲ]/.test(d.cli));
  const nonMacronDiffs = diffs.filter(d => !(/[āēīōūȳĀĒĪŌŪȲ]/.test(d.ref) || /[āēīōūȳĀĒĪŌŪȲ]/.test(d.cli)));

  console.log('\n=== CHARACTER COMPARISON ===');
  console.log(`Ref length:  ${refText.length}`);
  console.log(`CLI length:  ${cliText.length}`);
  console.log(`Total chars: ${total}`);
  console.log(`Exact match: ${match}/${total} = ${(match/total*100).toFixed(2)}%`);
  console.log(`Total diffs: ${diffs.length}`);
  console.log(`Macron diffs: ${macronDiffs.length}`);
  console.log(`Non-macron diffs: ${nonMacronDiffs.length}`);

  if (macronDiffs.length > 0) {
    console.log('\n=== MACRON MISMATCHES (first 40) ===');
    for (const d of macronDiffs.slice(0, 40)) {
      console.log(`  [pos ${d.pos}] ref="${d.refPrev}→${d.ref}" cli="${d.cliPrev}→${d.cli}"  ...${d.ctx}...`);
    }
  }
  if (macronDiffs.length > 40) {
    console.log(`  ... and ${macronDiffs.length - 40} more`);
  }

  if (nonMacronDiffs.length > 0) {
    console.log('\n=== NON-MACRON MISMATCHES ===');
    for (const d of nonMacronDiffs.slice(0, 20)) {
      console.log(`  [pos ${d.pos}] ref="${d.ref}" cli="${d.cli}" ...${d.ctx}...`);
    }
  }

  // Summary by word
  const refWords = refText.split(/[^a-zA-ZāēīōūȳĀĒĪŌŪȲ]+/).filter(Boolean);
  const cliWords = cliText.split(/[^a-zA-ZāēīōūȳĀĒĪŌŪȲ]+/).filter(Boolean);
  let wordMatch = 0;
  for (let i = 0; i < Math.min(refWords.length, cliWords.length); i++) {
    if (refWords[i] === cliWords[i]) wordMatch++;
  }
  console.log(`\nRef words: ${refWords.length}`);
  console.log(`CLI words: ${cliWords.length}`);
  console.log(`Word match: ${wordMatch}/${Math.min(refWords.length, cliWords.length)}`);
  console.log(`Word accuracy: ${(wordMatch / Math.min(refWords.length, cliWords.length) * 100).toFixed(1)}%`);
}

main().catch(e => { console.error(e); process.exit(1); });
