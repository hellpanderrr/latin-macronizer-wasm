import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CAESAR_TEXT = readFileSync(join(ROOT, 'test', 'data', 'caesar.txt'), 'utf-8').replace(/\r/g, '').trim();
const PY_OUTPUT = readFileSync(join(ROOT, 'test', 'data', 'py-output.txt'), 'utf-8').replace(/\r/g, '').trim();

(async () => {
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 600000 });
  const page = await browser.newPage();

  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2', timeout: 60000 });

  // Set input text first, then wait for process button to become ready
  await page.evaluate((text) => {
    document.getElementById('inputText').value = text;
  }, CAESAR_TEXT);

  // Wait for init to complete (wordlist prompt visible)
  await page.waitForSelector('#wlPrompt', { visible: true, timeout: 300000 });
  console.log('Init done. Loading wordlist...');

  // Click "Load into Memory"
  await page.waitForSelector('#loadMemory');
  await page.click('#loadMemory');

  // Wait for wordlist to load (process button enabled)
  console.log('Waiting for wordlist...');
  await page.waitForFunction(() => {
    const btn = document.getElementById('processBtn');
    return btn && !btn.disabled;
  }, { timeout: 600000 });

  console.log('Processing...');
  await page.click('#processBtn');

  // Wait for result
  await page.waitForFunction(() => {
    const el = document.getElementById('result');
    return el && el.style.display !== 'none';
  }, { timeout: 60000 });

  const tsOutput = await page.evaluate(() => {
    return document.getElementById('resultText').textContent;
  });

  // Compare
  const cleanTs = tsOutput.replace(/\r/g, '').trim();
  const match = [...cleanTs].reduce((m, c, i) => m + (c === PY_OUTPUT[i] ? 1 : 0), 0);
  const macronDiffs = [];
  for (let i = 0; i < Math.max(cleanTs.length, PY_OUTPUT.length); i++) {
    const c1 = cleanTs[i] || '';
    const c2 = PY_OUTPUT[i] || '';
    if (c1 !== c2 && (/[āēīōūȳ]/.test(c1) || /[āēīōūȳ]/.test(c2))) {
      const start = Math.max(0, i - 30);
      const end = Math.min(cleanTs.length, i + 30);
      let ctx = cleanTs.slice(start, end).replace(/\n/g, '↵');
      if (start > 0) ctx = '…' + ctx;
      if (end < cleanTs.length) ctx += '…';
      macronDiffs.push({ pos: i, ts: c1, py: c2, ctx });
    }
  }

  console.log(`Match: ${match}/${cleanTs.length} = ${(match/cleanTs.length*100).toFixed(2)}%`);
  console.log(`Macron errors: ${macronDiffs.length}`);
  for (const d of macronDiffs) {
    console.log(`  [${d.pos}] TS='${d.ts}' PY='${d.py}'  "${d.ctx}"`);
  }

  await browser.close();
})();
