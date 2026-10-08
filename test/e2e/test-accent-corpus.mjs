// Stress-accent gold-corpus test — pure Node, no browser.
//
// Runs `applyStress` over the hand-accentuated Ordo Missae corpus in
// test/data/accent-corpus/ (source and licence: see the README there) and
// compares the placed acute against the liturgical books.
//
// Inputs per word:
//   - the wordlist entry (public/macrons.txt) supplies the quantity reading,
//     exactly as the macronizer would choose it for prose (first candidate);
//   - an enclitic tail without a whole-word entry is stressed as
//     stem+enclitic against the stem's reading (the token-layer behavior);
//   - rubric/heading lines (no acute anywhere) are skipped: deliberately
//     unaccented page furniture, not gold.
//
// Word coordinates are computed on the ligature-expanded (æ→ae, œ→oe)
// lowercase string on BOTH sides: the corpus writes cǽléstis with the acute
// on the ligature, the wordlist writes caelesti_s.
//
// Usage: node test/e2e/test-accent-corpus.mjs
// Exit code 0 = no regression against test/data/accent-failures-snapshot.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { applyStress } = await import(
  'file:///' + ROOT.replace(/\\/g, '/') + '/dist/core/Stress.js'
);

const CORPUS_DIR = path.join(ROOT, 'test/data/accent-corpus');
const SNAPSHOT = path.join(ROOT, 'test/data/accent-failures-snapshot.json');
const UPDATE = process.argv.includes('--update');

// ---------- wordlist (first row per wordform = the prose reading) ----------
// macrons.txt is CRLF: split on any whitespace, like WordlistEngine does.
const wordlist = new Map();
for (const line of fs.readFileSync(path.join(ROOT, 'public/macrons.txt'), 'utf8').split('\n')) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) continue;
  const form = parts[0];
  if (!wordlist.has(form)) wordlist.set(form, parts[3]);
}

const ENCLITICS = ['que', 'ne', 've'];

// ---------- text helpers ----------

/** Lowercase, expand ligatures. Every function below works in this space. */
function expand(s) {
  return s.toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe');
}

/** Remove the acute (combining or precomposed) from a word. */
function deaccent(s) {
  return s.normalize('NFD').replace(/́/g, '').normalize('NFC');
}

/** The accent positions of an accented word, as indices into expand(word).
 *  A char is accented when its NFD carries U+0301; a ligature is one char and
 *  contributes the index of its first expanded letter. Used for BOTH sides of
 *  the comparison, so the coordinate conventions can never drift apart. */
function accentIndexes(word) {
  const out = [];
  let idx = 0;
  for (const ch of word.toLowerCase()) {
    const nfd = ch.normalize('NFD');
    if (nfd.includes('́')) out.push(idx);
    const base = nfd.replace(/[̀-ͯ]/g, '');
    if (base) idx += base === 'æ' || base === 'œ' ? 2 : 1;
  }
  return out;
}

// ---------- comparison ----------
const results = { placedAgree: 0, placedDisagree: 0, noneAgree: 0, noneDisagree: 0, skipped: 0 };
const disagreements = [];
const seen = new Set();

const files = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.txt')).sort();
for (const file of files) {
  // Corpus files are CRLF; a stray \r would ride along in every lookup key.
  const lines = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    // Rubric/heading lines carry no acute at all — not gold.
    if (!trimmed || !/́/.test(trimmed.normalize('NFD')) && !/[ǽǼ]/.test(trimmed)) continue;

    for (const raw of trimmed.match(/[A-Za-zÀ-ɏæœÆŒ]+/g) ?? []) {
      const word = raw.toLowerCase();
      const expanded = expand(word);
      if (!expanded) continue;
      // The wordlist is accent-free: look up the deaccented spelling, but keep
      // the accentuated spelling as the plain text the accent is placed on.
      const plain = deaccent(word);
      const lookup = expand(plain);

      let accented;
      if (wordlist.has(lookup)) {
        accented = wordlist.get(lookup);
      } else {
        const stem = ENCLITICS.map((e) => lookup.slice(0, -e.length)).find(
          (s, i) => lookup.endsWith(ENCLITICS[i]) && s.length >= 2 && wordlist.has(s),
        );
        const enclitic = ENCLITICS.find((e) => lookup.endsWith(e));
        if (!stem || !enclitic) {
          results.skipped += 1;
          continue;
        }
        accented = wordlist.get(stem) + enclitic;
      }

      const gold = accentIndexes(word);
      const stressed = applyStress(plain, accented);
      const ourIndexes = accentIndexes(stressed);
      const ours = ourIndexes.length === 1 ? ourIndexes[0] : null;
      const key = `${word}|${accented}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (ours === null) {
        if (gold.length === 0) results.noneAgree += 1;
        else {
          results.noneDisagree += 1;
          disagreements.push({ file, word, accented, plain, stressed, ours: 'none', gold });
        }
      } else if (gold.includes(ours)) {
        results.placedAgree += 1;
      } else {
        results.placedDisagree += 1;
        disagreements.push({ file, word, accented, plain, stressed, ourIndexes, ours, gold });
      }
    }
  }
}

const total = results.placedAgree + results.placedDisagree + results.noneAgree + results.noneDisagree;
console.log(`accent corpus: ${total} distinct words compared (${results.skipped} not in wordlist, skipped)`);
console.log(`  placed accents agree:      ${results.placedAgree}`);
console.log(`  placed accents disagree:   ${results.placedDisagree}`);
console.log(`  unaccented agree:          ${results.noneAgree}`);
console.log(`  unaccented but gold has one: ${results.noneDisagree}`);
const agree = results.placedAgree + results.noneAgree;
console.log(`  AGREEMENT: ${agree}/${total} = ${((100 * agree) / total).toFixed(2)}%`);
for (const d of disagreements) {
  console.log(`  MISMATCH ${d.file}: ${d.word} (${d.accented}) ours=${d.ours} gold=${d.gold}`);
}

// ---------- snapshot: fail on regression, allow improvement ----------
if (UPDATE || !fs.existsSync(SNAPSHOT)) {
  fs.writeFileSync(
    SNAPSHOT,
    JSON.stringify({ placedDisagree: results.placedDisagree, disagreements }, null, 2) + '\n',
  );
  console.log(`Snapshot written: ${path.relative(ROOT, SNAPSHOT)} (${results.placedDisagree} disagreements)`);
  process.exit(0);
}

const prev = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
if (results.placedDisagree > prev.placedDisagree) {
  console.error(
    `REGRESSION: ${results.placedDisagree} disagreements, snapshot has ${prev.placedDisagree}. ` +
      `Run with --update after verifying the new mismatches are correct.`,
  );
  process.exit(1);
}
if (results.placedDisagree < prev.placedDisagree) {
  console.log(`Improved: ${prev.placedDisagree} -> ${results.placedDisagree} disagreements. Re-run with --update.`);
}
