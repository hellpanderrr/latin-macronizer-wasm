import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Native reference tags (from running rft-annotate natively on Caesar BG 1.1)
const NATIVE_TAG_TEXT = readFileSync(join(ROOT, 'test', 'data', 'native-tags.txt'), 'utf-8').replace(/\r/g, '').trim();
const PROBLEM_TAG_TEXT = readFileSync(join(ROOT, 'test', 'data', 'native-problem-tags.txt'), 'utf-8').replace(/\r/g, '').trim();

// Parse native tags
const nativeTags = new Map();
for (const line of NATIVE_TAG_TEXT.split('\n')) {
  const [word, tag] = line.split('\t');
  if (tag) nativeTags.set(word.toLowerCase(), tag);
}
for (const line of PROBLEM_TAG_TEXT.split('\n')) {
  const [word, tag] = line.split('\t');
  if (tag && !nativeTags.has(word.toLowerCase())) {
    nativeTags.set(word.toLowerCase(), tag);
  }
}

// Get all unique words from the Caesar text for which we have native tags
const caesarWords = [...nativeTags.keys()].sort();

(async () => {
  console.log('=== WASM Tag Comparison Test ===\n');
  console.log(`Testing ${caesarWords.length} words against native RFTagger\n`);

  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 60000 });
  const page = await browser.newPage();

  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for RFTagger module to be loaded
  console.log('Waiting for WASM RFTagger...');
  await page.waitForFunction(() => typeof window.RFTaggerModule === 'function', { timeout: 30000 });
  console.log('RFTaggerModule found');

  // Create and initialize tagger
  const tags = await page.evaluate(async (words) => {
    const module = await window.RFTaggerModule({
      locateFile: (path) => {
        if (path.endsWith('.wasm') || path.endsWith('.data')) return '/wasm/' + path;
        return path;
      }
    });
    await module.ready;
    const tagger = new module.RFTagger();

    // Load model
    const resp = await fetch('/wasm/rftagger-ldt.model');
    const data = await resp.arrayBuffer();
    try { module.FS.mkdir('/models'); } catch (e) {}
    module.FS.writeFile('/models/rftagger-ldt.model', new Uint8Array(data));
    tagger.loadModel('/models/rftagger-ldt.model', true, 0.001, true);

    // Tag all words in a single sentence
    const results = tagger.tagSentences([words]);
    const resultTags = [];
    for (let i = 0; i < results.size(); i++) {
      const sent = results.get(i);
      for (let j = 0; j < sent.size(); j++) {
        resultTags.push(sent.get(j));
      }
    }
    return resultTags;
  }, caesarWords);

  console.log(`WASM returned ${tags.length} tags\n`);

  // Compare
  let matchCount = 0;
  let diffCount = 0;
  const diffs = [];

  for (let i = 0; i < caesarWords.length && i < tags.length; i++) {
    const word = caesarWords[i];
    const wasmTag = tags[i];
    const nativeTag = nativeTags.get(word);

    // Normalize: remove dots (matching Python tag.replace(".", ""))
    const wasmNorm = wasmTag ? wasmTag.replace(/\./g, '') : '';
    const nativeNorm = nativeTag ? nativeTag.replace(/\./g, '') : '';

    if (wasmNorm === nativeNorm) {
      matchCount++;
    } else {
      diffCount++;
      diffs.push({ word, wasm: wasmTag, native: nativeTag, wasmNorm, nativeNorm });
    }
  }

  console.log(`Match: ${matchCount}/${caesarWords.length}`);
  console.log(`Differences: ${diffCount}\n`);

  if (diffs.length > 0) {
    console.log('Tag differences (WASM vs Native):');
    for (const d of diffs) {
      console.log(`  ${d.word}: WASM="${d.wasm}"  Native="${d.native}"`);
      console.log(`           WASM(norm)="${d.wasmNorm}"  Native(norm)="${d.nativeNorm}"`);
    }
  }

  await browser.close();
})();
