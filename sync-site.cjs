/**
 * Refresh the website's copy of the engine after a build.
 *
 * The site (hellpanderrr.github.io) cannot run TypeScript, so it carries a
 * compiled copy of dist/ under wiktionary_pron/macronizer/dist/. That copy used
 * to be hand-edited to fix up asset paths, which let a wrong path sit in src/
 * unnoticed for weeks. Generating it instead keeps src/ the only source of truth.
 *
 * The engine's defaults assume it is served from the root of a standalone dev
 * server ('/wasm/...', '/macrons.txt'). On the site it lives under
 * /wiktionary_pron/macronizer/, and the wordlist is served gzipped. Those are the
 * only two edits; everything else is copied verbatim.
 *
 * Skips silently when the site checkout isn't present (CI, fresh clone).
 * Override the location with MACRONIZER_SITE_DIR.
 */
const fs = require('fs');
const path = require('path');

const SITE_DIR =
  process.env.MACRONIZER_SITE_DIR ||
  path.resolve(__dirname, '../../wiktionary_pron/wiktionary_pron/macronizer');

const BASE = '/wiktionary_pron/macronizer';
const SRC_DIST = path.join(__dirname, 'dist');

if (!fs.existsSync(SITE_DIR)) {
  console.log(`[sync-site] No site checkout at ${SITE_DIR} — skipping.`);
  process.exit(0);
}
if (!fs.existsSync(SRC_DIST)) {
  console.error('[sync-site] No dist/ — run the build first.');
  process.exit(1);
}

// dist/wasm duplicates the site's own wasm/ (36 MB) and is never fetched by the page.
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === 'wasm') continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

const destDist = path.join(SITE_DIR, 'dist');
fs.rmSync(destDist, { recursive: true, force: true });
copyDir(SRC_DIST, destDist);

const apiFile = path.join(destDist, 'api', 'MacronizerAPI.js');
const patched = fs
  .readFileSync(apiFile, 'utf8')
  .replace(/'\/wasm\//g, `'${BASE}/wasm/`)
  .replace(/'\/macrons\.txt'/g, `'${BASE}/macrons.txt.gz'`);
fs.writeFileSync(apiFile, patched);

// A silent no-op rewrite would ship a dist/ that 404s on the site.
for (const expected of [`${BASE}/wasm/rftagger.js`, `${BASE}/macrons.txt.gz`]) {
  if (!patched.includes(expected)) {
    console.error(`[sync-site] Path rewrite failed: ${expected} not found in MacronizerAPI.js`);
    process.exit(1);
  }
}

console.log(`[sync-site] dist/ -> ${SITE_DIR}/dist (asset paths rewritten to ${BASE}/).`);
