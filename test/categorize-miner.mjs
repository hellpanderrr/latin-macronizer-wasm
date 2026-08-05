#!/usr/bin/env node
/**
 * Categorize miner output (M-013 Phase 2 prep).
 *
 * Usage: node test/miner-scansion.mjs > /tmp/miner.out
 *        node test/categorize-miner.mjs /tmp/miner.out
 *
 * The miner prints, per failing line:
 *     --- <file> (<meter>) line N ---
 *         <the line>
 *     words: "x" → [accents]( UNKNOWN)?  ...
 *
 * A line whose words ALL resolved (no UNKNOWN marker) but still failed to scan
 * is the high-value bucket — every word has a known quantity yet the verse
 * won't fit the meter. That's the italorum signature (data gap) rather than a
 * missing-word limitation. Those go to the top of the Pedecerto confirm queue.
 */
import fs from 'node:fs';

const [, , pathArg] = process.argv;
if (!pathArg) { console.error('usage: node categorize-miner.mjs <miner-out.txt>'); process.exit(1); }

const text = fs.readFileSync(pathArg, 'utf-8');
const blocks = text.split(/\n--- /).slice(1);

const unknown = [];      // ≥1 word missing from wordlist (engine limitation bucket)
const knownFail = [];    // all words known, scansion still empty (candidate gap bucket)
const rerunFail = [];    // single-line re-run itself failed

for (const block of blocks) {
  const header = block.split('\n')[0];
  const m = header.match(/^(.*) \((.*)\) line (\d+)/);
  if (!m) continue;
  const [file, meter, lineIdx] = [m[1], m[2], Number(m[3])];
  const lineMatch = block.match(/^ {4}(.+)$/m);
  const line = lineMatch ? lineMatch[1].trim() : '?';
  const wordsMatch = block.match(/^    words: (.+)$/m);
  const words = wordsMatch ? wordsMatch[1] : '(re-run failed)';

  const hasUnknown = /\(UNKNOWN\)/.test(words);
  const rerunBroken = words === '(re-run failed)';

  if (rerunBroken) rerunFail.push({ file, meter, lineIdx, line, words });
  else if (hasUnknown) unknown.push({ file, meter, lineIdx, line, words });
  else knownFail.push({ file, meter, lineIdx, line, words });
}

function show(title, arr) {
  console.log(`\n=== ${title}: ${arr.length} ===`);
  for (const f of arr) {
    console.log(`--- ${f.file} (${f.meter}) line ${f.lineIdx} ---`);
    console.log(`    ${f.line}`);
    console.log(`    ${f.words}`);
  }
}

// All-known-but-fails first — the real-gap suspects.
show('KNOWN WORDS BUT SCANSION FAILS (top suspects)', knownFail);
show('CONTAINS UNKNOWN WORD (engine limitation)', unknown);
show('RE-RUN FAILED', rerunFail);

console.log(`\nTotals: known-fail=${knownFail.length}  unknown=${unknown.length}  rerun-fail=${rerunFail.length}  (${knownFail.length + unknown.length + rerunFail.length})`);
