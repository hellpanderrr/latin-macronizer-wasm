#!/usr/bin/env node
/**
 * Find repeated culprit words in the miner's known-fail dump (M-013 Phase 2).
 *
 * Usage: node test/miner-scansion.mjs > /tmp/miner.out
 *        node test/culprit-words.mjs /tmp/miner.out
 *
 * A word that is:
 *  - present in MANY failing lines, AND
 *  - carrying the SAME accent candidate(s) every time,
 * is a data-gap suspect (like italorum): its wordlist quantity is wrong for the
 * verse, and an ACCENT_OVERRIDES entry would fix every line it appears in.
 */
import fs from 'node:fs';

const [, , pathArg] = process.argv;
if (!pathArg) { console.error('usage: node culprit-words.mjs <miner-out.txt>'); process.exit(1); }

const text = fs.readFileSync(pathArg, 'utf-8');
const blocks = text.split(/\n--- /).slice(1);

// word -> Map<accentSet, Set<lineRef>>
const words = new Map();

for (const block of blocks) {
  const header = block.split('\n')[0];
  const m = header.match(/^(.*) \((.*)\) line (\d+)/);
  if (!m) continue;
  const ref = `${m[1]}:${m[3]}`;
  const wordsLine = block.match(/^    words: (.+)$/m);
  if (!wordsLine) continue;
  const re = /"([^"]+)" → \[([^\]]*)\]( \(UNKNOWN\))?/g;
  let w;
  while ((w = re.exec(wordsLine[1]))) {
    const [, word, accents, unk] = w;
    if (unk) continue; // skip unknown words — those are engine limits, not data gaps
    const accentSet = accents.replace(/ /g, '');
    if (!words.has(word)) words.set(word, new Map());
    const bySet = words.get(word);
    if (!bySet.has(accentSet)) bySet.set(accentSet, new Set());
    bySet.get(accentSet).add(ref);
  }
}

// Sort by total line count desc; show words appearing in >= 2 lines
const rows = [];
for (const [word, bySet] of words) {
  const total = [...bySet.values()].reduce((a, s) => a + s.size, 0);
  if (total >= 2) rows.push({ word, total, bySet });
}
rows.sort((a, b) => b.total - a.total);

console.log('=== words appearing in >= 2 failing lines (same accent set) ===');
for (const { word, total, bySet } of rows) {
  console.log(`\n${word}  (${total} lines)`);
  for (const [accents, refs] of [...bySet.entries()].sort((a,b) => b[1].size - a[1].size)) {
    console.log(`  [${accents}]  ${[...refs].slice(0, 8).join('  ')}${refs.size > 8 ? ' …' : ''}`);
  }
}
