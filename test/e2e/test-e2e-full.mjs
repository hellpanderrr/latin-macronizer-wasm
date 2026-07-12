import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CAESAR_TEXT = readFileSync(join(ROOT, 'test', 'data', 'caesar.txt'), 'utf-8').replace(/\r/g, '').trim();
const PY_OUTPUT = readFileSync(join(ROOT, 'test', 'data', 'py-output.txt'), 'utf-8').replace(/\r/g, '').trim();

function charByCharComparison(ts, py) {
  const maxLen = Math.max(ts.length, py.length);
  let match = 0, total = 0;
  const diffs = [];

  for (let i = 0; i < maxLen; i++) {
    const c1 = ts[i] || '';
    const c2 = py[i] || '';
    if (!c1 || !c2) {
      if (c1 !== c2) diffs.push({ pos: i, ts: JSON.stringify(c1), py: JSON.stringify(c2) });
      continue;
    }
    total++;
    if (c1 === c2) { match++; continue; }

    const start = Math.max(0, i - 30);
    const end = Math.min(ts.length, i + 30);
    let ctx = ts.slice(start, end).replace(/\n/g, '↵');
    if (start > 0) ctx = '…' + ctx;
    if (end < ts.length) ctx += '…';

    diffs.push({ pos: i, ts: c1, py: c2, ctx });
  }

  const macronDiffs = diffs.filter(d => /[āēīōūȳĀĒĪŌŪȲ]/.test(d.ts) || /[āēīōūȳĀĒĪŌŪȲ]/.test(d.py));
  return { match, total, macronDiffs: macronDiffs.length, otherDiffs: diffs.length - macronDiffs.length, diffList: macronDiffs };
}

(async () => {
  console.log('=== E2E Test: Caesar BG 1.1 Browser vs Python ===\n');
  const startTime = Date.now();

  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000 });
  const page = await browser.newPage();
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('[DEBUG]') || t.includes('symbol id') || t.includes('POSTagger::') ||
        t.includes('[RFTagger]') || t.includes('[Macronizer]') || t.includes('[LemmaEngine]') ||
        t.includes('[EndingPattern]') || t.includes('[Morpheus]') || t.includes('WordlistEngine') ||
        t.includes('loadModel:') || t.includes('locateFile') || t.includes('vite]') ||
        t.includes('tagSentences:') || t.includes('accentedCandidates') ||
        t.includes('After breve') || t.includes('[macronizeToken]') || t.includes('Processing token') ||
        t.includes('START:') || t.includes('=== ALIGN') || t.includes('Input text:') ||
        t.includes('DP result') || t.includes('Final unicode') || t.includes('Selected accented') ||
        t.includes('Early exact') || t.includes('Starting backtrack') || t.includes('Options:') ||
        t.includes('first 5') || t.includes('Entries count') || t.includes('Sorted candidates') ||
        t.includes('Selected first') || t.includes('=== DEBUG') || t.includes('Token:') ||
        t.includes('Alignment')) return;
    console.log('  ', t);
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2', timeout: 60000 });

  // Wait for full init
  console.log('Waiting for initialization (WASM + wordlist)...');
  for (let i = 0; i < 600; i++) {
    const ready = await page.evaluate(() => {
      try { const a = window.__macronizerApi; return !!(a?.macronizer?.tagger?.isReady?.() && a.isWordlistLoaded?.()); }
      catch (e) { return false; }
    });
    if (ready) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('Processing Caesar BG 1.1...');
  const procStart = Date.now();
  const result = await page.evaluate((text) => {
    const api = window.__macronizerApi;
    return api.process(text, { macronize: true, alsomaius: false, scan: 'prose', performutov: false, performitoj: false });
  }, CAESAR_TEXT);
  console.log(`Processing time: ${Date.now() - procStart}ms`);

  const tsOutput = result.macronized.replace(/\r/g, '').trim();
  writeFileSync(join(ROOT, 'test', 'data', 'ts-output-browser.txt'), tsOutput, 'utf-8');

  const comp = charByCharComparison(tsOutput, PY_OUTPUT);

  console.log(`\n=== RESULTS ===`);
  console.log(`Total time: ${(Date.now() - startTime) / 1000}s`);
  console.log(`Length: TS=${tsOutput.length} PY=${PY_OUTPUT.length}`);
  console.log(`Exact char match: ${comp.match}/${comp.total} = ${(comp.match / comp.total * 100).toFixed(2)}%`);
  console.log(`Macron mismatches: ${comp.macronDiffs}`);
  console.log(`Other diffs: ${comp.otherDiffs}`);

  if (comp.diffList.length > 0) {
    console.log(`\nRemaining macron errors (${comp.diffList.length}):`);
    for (const d of comp.diffList) {
      const arrow = d.ts === 'a' || d.ts === 'i' ? '← missing macron' :
                     d.py === 'a' || d.py === 'i' ? '← extra macron' : '';
      console.log(`  [${d.pos}] TS='${d.ts}' PY='${d.py}'  "${d.ctx}"  ${arrow}`);
    }
  }

  // Token-level error breakdown
  const tokens = result.tokens || [];
  let tokenIdx = 0;
  let tsLen = 0;
  const wordErrors = [];

  for (const token of tokens) {
    if (token.text && /^[a-zA-Z]/.test(token.text)) {
      const mac = (token.macronizedText || token.text).replace(/_/g, '');
      const pyWord = PY_OUTPUT.slice(tsLen, tsLen + mac.length);
      tsLen += mac.length;
      if (token.text !== ' ') {
        // Find the word in PY output at the right position
        const pyPos = PY_OUTPUT.indexOf(mac, Math.max(0, tsLen - mac.length - 5));
        // Too complex — skip word-level for now, char-level is precise enough
      }
    } else {
      tsLen += (token.text || '').length;
    }
  }

  await browser.close();
})();
