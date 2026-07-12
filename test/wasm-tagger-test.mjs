#!/usr/bin/env node
/**
 * Compare WASM RFTagger output against native RFTagger output.
 * Requires: npm run build first, then npx vite (or similar static serving)
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const NATIVE_TAGS = join(ROOT, 'test', 'data', 'native-tags.txt');
const WORDS = readFileSync(join(ROOT, 'test', 'data', 'test-words.txt'), 'utf-8')
  .split('\n').filter(Boolean).map(s => s.trim());

console.log('=== WORDS TO COMPARE ===');
console.log(WORDS.join(', '));
console.log();

// Load native tags
const nativeTags = new Map();
const nativeLines = readFileSync(NATIVE_TAGS, 'utf-8').split('\n').filter(Boolean);
for (const line of nativeLines) {
  const [word, tag, ...rest] = line.split('\t');
  if (word) nativeTags.set(word.toLowerCase(), { tag, rest: rest.join('\t') });
}
console.log('=== NATIVE RFTAGGER TAGS ===');
for (const [word, info] of nativeTags) {
  console.log(`  ${word}\t${info.tag}${info.rest ? '\t' + info.rest : ''}`);
}

// Now load the TS version with FallbackTagger
import(pathToFileURL(join(ROOT, 'dist', 'core', 'Macronizer.js')).href).then(async ({ Macronizer }) => {
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

  const text = WORDS.join(' ');
  const result = await macronizer.macronize(text, { scan: 'prose' });

  console.log('\n=== TS FALLBACK TAGGER TAGS ===');
  for (const t of result.taggedTokens.filter(t => t.isWord)) {
    const tag = t.posTag || '??';
    const match = nativeTags.get(t.text.toLowerCase());
    const nativeTag = match ? match.tag : '(no native)';
    const ok = nativeTag === tag ? '✓' : '✗';
    console.log(`  ${ok} ${t.text}\tTS:${tag}\tNative:${nativeTag}`);
  }

  // Summary
  let match = 0, total = 0;
  for (const t of result.taggedTokens.filter(t => t.isWord)) {
    const w = t.text.toLowerCase();
    if (nativeTags.has(w)) {
      total++;
      if ((t.posTag || '') === nativeTags.get(w).tag) match++;
    }
  }
  console.log(`\nTag match: ${match}/${total}`);

  macronizer.destroy();
});
