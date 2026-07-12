import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import events from 'events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CAESAR_TEXT = readFileSync(join(ROOT, 'test', 'data', 'caesar.txt'), 'utf-8').replace(/\r/g, '').trim();
const PY_OUTPUT = readFileSync(join(ROOT, 'test', 'data', 'py-output.txt'), 'utf-8').replace(/\r/g, '').trim();

async function waitForInit(page) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Init timeout')), 600000);
    page.on('console', msg => {
      if (msg.text().includes('MacronizerAPI: initialized')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

function charByCharComparison(ts, py) {
  const maxLen = Math.max(ts.length, py.length);
  let match = 0, total = 0;
  const diffs = [];
  for (let i = 0; i < maxLen; i++) {
    const c1 = ts[i] || '';
    const c2 = py[i] || '';
    if (!c1 || !c2) { diffs.push({ pos: i, ts: JSON.stringify(c1), py: JSON.stringify(c2) }); continue; }
    total++;
    if (c1 === c2) { match++; continue; }
    const s = Math.max(0, i - 20);
    const e = Math.min(ts.length, i + 20);
    let ctx = ts.slice(s, e).replace(/\n/g, '↵');
    if (s > 0) ctx = '...' + ctx;
    if (e < ts.length) ctx += '...';
    diffs.push({ pos: i, ts: c1, py: c2, ctx });
  }
  const macronDiffs = diffs.filter(d => /[āēīōūȳ]/.test(d.ts) || /[āēīōūȳ]/.test(d.py));
  return { match, total, macronErrors: macronDiffs.length, otherErrors: diffs.length - macronDiffs.length, diffs: macronDiffs };
}

(async () => {
  console.log('=== E2E Comparison: TS vs Python ===\n');
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 900000 });
  const page = await browser.newPage();

  // Filter out JS debug noise
  page.on('console', msg => {
    const t = msg.text();
    if ((t.includes('[RFTagger]') || t.includes('[Macronizer]') || t.includes('Failed to load') ||
         t.includes('[DEBUG]') || t.includes('DEBUG ') || t.includes('symbol id') ||
         t.includes('Backend assumes') || t.includes('START:') || t.includes('After breve') ||
         t.includes('Selected accented') || t.includes('Sorted candidates') ||
         t.includes('Entries count') || t.includes('=== ALIGN') || t.includes('Final unicode') ||
         t.includes('DP result') || t.includes('Processing token') || t.includes('=== DEBUG') ||
         t.includes('first 5') || t.includes('locateFile') || t.includes('warn normalizeTag') ||
         t.includes('confirm navigation') || t.includes('[vite]') ||
         t.includes('Warning: Strange'))) return;
    console.log('  ', t);
  });

  const initPromise = waitForInit(page);
  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('Page loaded, waiting for initialization (WASM + wordlist ~3 min)...');

  await initPromise;
  console.log('Initialization complete. Processing...');

  // Re-create the API in-page and run the full pipeline
  const result = await page.evaluate(async (text) => {
    // Dynamically import the module (same as index.html)
    const mod = await import('/dist/api/MacronizerAPI.js');
    const api = new mod.MacronizerAPI();
    await api.initialize();
    const res = await api.process(text, {
      macronize: true, alsomaius: false, scan: 'prose', performutov: false, performitoj: false
    });
    return res;
  }, CAESAR_TEXT);

  const tsOutput = result.macronized.replace(/\r/g, '').trim();
  writeFileSync(join(ROOT, 'test', 'data', 'ts-output-browser.txt'), tsOutput, 'utf-8');

  const comp = charByCharComparison(tsOutput, PY_OUTPUT);

  console.log(`\n=== RESULTS ===`);
  console.log(`TS length: ${tsOutput.length}, PY length: ${PY_OUTPUT.length}`);
  console.log(`Match: ${comp.match}/${comp.total} = ${(comp.match / comp.total * 100).toFixed(2)}%`);
  console.log(`Macron errors: ${comp.macronErrors}`);
  console.log(`Other errors: ${comp.otherErrors}`);

  if (comp.diffs.length > 0) {
    console.log(`\nRemaining macron errors:`);
    for (const d of comp.diffs) {
      console.log(`  [${d.pos}] TS='${d.ts}' PY='${d.py}'  ctx="${d.ctx}"`);
    }
  }

  await browser.close();
})();
