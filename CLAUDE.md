# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Build TS → dist/ (includes fix-imports.cjs + copy-assets.cjs)
npm run build

# Production build (uses tsconfig.prod.json)
npm run build:prod

# Dev: watch mode
npm run dev

# Dev server (Vite, port 8080)
npx vite

# Tests
npm test                   # all tests (Jest)
npm run test:parity        # full-pipeline parity vs Python reference (Node, no browser, ~1 min)
npm run test:watch         # watch mode
npx jest test/unit/latin.test.ts  # single file

# Test coverage
npm run test:coverage        # Jest with --coverage flag

# E2E tests (Node, requires npm run build first)
node test/e2e/test-scansion.mjs           # validates all 5 meter options on real verse
node test/e2e/test-orthography.mjs        # validates u→v/i→j semantics
node test/e2e/test-py-compare-ortho.mjs   # byte-level vs Python (Docker), 7 flag combos

# Python comparison via Docker (full parity including utov/itoj)
docker build -t macronizer-py-compare -f native/build/Dockerfile.py-compare .
node test/e2e/test-py-compare-ortho.mjs

# Lint / Format
npm run lint
npm run lint:fix
npm run format
npm run format:check

# WASM builds (Docker recommended)
docker-compose -f native/build/docker-compose.yml run --rm wasm-builder  # RFTagger WASM (use run --rm, not up — see trap below)
# Morpheus WASM: see native/morpheus/js/docker-compose.morpheus.yml

# Serve for browser testing
npx vite
# Then open http://localhost:8080
```

## Project Purpose

Browser port of [Johan Winge's Python Latin macronizer](https://github.com/johanwinge/latin-macronizer). Takes Latin text input and adds macrons (length marks over vowels) using POS tagging, morphological analysis, and dictionary lookups. The original Python calls two native binaries (`rft-annotate` and `cruncher`) — both are compiled to WebAssembly via Emscripten for browser use.

## Architecture Overview

Three layers: **analysis engines** (POS tagging, morphology, dictionaries) → **core orchestration** (Macronizer, Tokenization) → **API wrapper** (used by index.html).

### src/ directory map

- **`src/core/Macronizer.ts`** — Main orchestrator. Manages initialization order, calls tokenization pipeline, handles caching.
- **`src/core/Tokenization.ts`** — Central pipeline: tokenize → split enclitics → POS tag → add lemmas → get accents → macronize → detokenize. Largest port from Python `tokenization.py`.
- **`src/core/Token.ts`** — Immutable token class with `with()` for property updates.
- **`src/core/alignMacronized.ts`** — DP edit-distance algorithm that places macrons by aligning plain text against accented forms. Port of Python `Token.macronize()`. Critical for correctness.
- **`src/core/Scansion.ts`** — Verse meter scanning (dactylic hexameter, elegiac distichs, hendecasyllable, iambic trimeter/dimeter). Port of Python `scansion.py`. Uses automaton approach with 5 meter options matching Python exactly.
- **`src/analysis/WasmTagger.ts`** — Wraps RFTagger C++ compiled to WASM. Falls back to `FallbackTagger` (simple suffix rules) when WASM unavailable.
- **`src/analysis/MorpheusAnalyzer.ts`** — Wraps Morpheus C analyzer compiled to WASM. Analyzes unknown words (crucial for handling out-of-vocabulary Latin). Uses `ccall()` to invoke C functions from `cruncher.wasm`.
- **`src/analysis/WordlistEngine.ts`** — IndexedDB-backed wordform database (~812k entries from `macrons.txt`). Replaces Python's SQLite. Integrates with Morpheus for unknown words.
- **`src/analysis/LemmaEngine.ts`** — Lemma dictionary lookup from `src/data/lemmas.json`.
- **`src/analysis/EndingPatternEngine.ts`** — Suffix-based vowel length rules from `src/data/endings.json`.
- **`src/api/MacronizerAPI.ts`** — Thin convenience wrapper for `index.html`. Handles initialization with progress callbacks.
- **`src/utils/latin.ts`** — Shared utilities: text normalization, case conversion, enclitic handling, orthography (u↔v, i↔j).

### WASM Integration

Two separate WASM modules loaded at runtime:

1. **RFTagger** (`public/wasm/rftagger.{wasm,js}`) — C++ POS tagger. Loaded via `<script>` tag in `index.html`, exposes global `RFTaggerModule`. Uses Emscripten embind C++ class API (`new RFTagger()`, `loadModel()`, `tagSentences()`). Model file: `rftagger-ldt.model` (~13MB, fetched and written to virtual FS at runtime).

2. **Morpheus (cruncher)** (`public/wasm/cruncher.{wasm,js,data}`) — C morphological analyzer. Loaded via `<script>` tag. Exposes `window.Morpheus` factory. Uses `ccall('morpheus_analyze', ...)` with the C API.

Both load their `.data` and `.wasm` files via `locateFile()` pointing to `/wasm/`.

### Data Flow

```
Latin text
  → Tokenizer (regex-based, word/punctuation/whitespace)
  → Tokenization.splitEnclitics() (-que, -ve, -ne + dividenda list)
  → RFTagger WASM POS tagging (or FallbackTagger)
  → LemmaEngine (JSON lookup)
  → WordlistEngine (IndexedDB: macrons.txt entries)
  → MorpheusAnalyzer WASM (for unknown words, triggered by WordlistEngine.ensureAnalyzed())
  → EndingPatternEngine (suffix rules for vowel length)
  → Scansion (verse meter, optionally reorders accent candidates)
  → alignMacronized (DP alignment: plain → accented with _ markers)
  → Tokenization.detokenize() → macronized text
```

### Key Porting Patterns

- **Python → TypeScript**: Python modules map to analysis engines (e.g. `wordlist.py` → `WordlistEngine.ts`, `lemmas.py` → `LemmaEngine.ts`). Python's list/dict operations become TypeScript array/Map operations.
- **Subprocess calls → WASM**: `rft-annotate` (C++ binary) → RFTagger WASM via embind class API. `cruncher` (C binary) → Morpheus WASM via `ccall`.
- **SQLite → IndexedDB**: Wordlist uses IndexedDB for persistent storage in browser.
- **Synchronous → Async**: All loading/initialization is async with progress callbacks. The `Macronizer.initialize()` method loads WASM modules, dictionaries, wordlist, and Morpheus in order.
- **Immutability**: `Token` class is immutable — use `token.with({...})` to create modified copies.

### WASM Build Process

- RFTagger: Emscripten compilation via Docker (`docker-compose -f native/build/docker-compose.yml run --rm wasm-builder`). Source in `native/rftagger/`. Build scripts: `native/build/build-rftagger-wasm.sh`, `native/build/emscripten-build.sh`.
- Morpheus: Separate build in `native/morpheus/js/` directory. Source in `native/morpheus/c/`. Build: `native/morpheus/js/build-morpheus-wasm.sh` via Docker (`native/morpheus/js/docker-compose.morpheus.yml`).

### Testing

- Unit tests (`test/unit/`): `alignMacronized.test.ts` (DP alignment), `latin.test.ts` (utilities).
- E2E Node tests (`test/e2e/`): `test-scansion.mjs` (5 meters), `test-orthography.mjs` (u→v/i→j), `test-py-compare-ortho.mjs` (Docker-based byte-level vs Python, 7 flag combos).
- HTML test pages (manual browser testing): `test/pages/test-pages/` directory — full pipeline, functional WASM, Morpheus tests, etc.
- E2E browser tests (puppeteer): `test/e2e/` — `test-e2e.js`, `test-e2e-real.js`, `test-e2e-large.js`.
- Node.js test (no browser, uses FallbackTagger): `test/test-node.mjs`.
- Python comparison via Docker: `test/e2e/test-py-compare-ortho.mjs` — byte-level exact match for default/utov/itoj/utov+itoj/maius/nomacrons/nomacrons+utov.

**Self-updating error log** — the `## Known traps (error log)` section at the bottom of this
file is maintained BY THE AGENT: whenever you stumble on a persistent/recurring error (wrong
 assumption, encoding trap, stale artifact, environment quirk — anything a future session would hit again), append a one-line entry there in the same commit as your fix. One-off
typos don't qualify; anything you had to *discover* does.

## Known traps (error log)

- [macronizer] `docker compose up <svc>` runs the build during IMAGE build if the Dockerfile uses `RUN`; when using volume mounts, outputs never land in the mounted volume — use `docker compose run --rm <svc>` instead. **(Build script fixed: `RUN` → `CMD` so build runs at container start.)**
- [macronizer] emcc with embind sources but without `--bind` + `ERROR_ON_UNDEFINED_SYMBOLS=0` silently emits a broken .wasm (undefined `_embind_register_*`); `native/build/build-rftagger-wasm.sh` **was** broken this way (also wrong `EXPORT_NAME` — glue expects `RFTaggerModule`). The build script was fixed 2026-07-12: added `--bind`, changed `EXPORT_NAME="RFTagger"` → `EXPORT_NAME="RFTaggerModule"`. The committed binary (`public/wasm/rftagger.{js,wasm}`) is the proven reference — verify any rebuild with `test/e2e/test-compare-wasm-tags.mjs`.
- [macronizer] TS `Token` uses camelCase `isSpace`; Python-style `token.isspace` is silently `undefined`, so guards like `!token.isspace` are always-true dead code (this let whitespace tokens reach the POS tagger).
- [macronizer] `test/data/py-output-full.txt` / `ts-output-full.txt` are from a DIFFERENT input text (stale); the canonical caesar.txt reference is `test/data/py-output.txt`.
- [node] Emscripten *web-only* glue under Node: hide `process.versions` only around the module-factory call (and pass `wasmBinary`); hiding it process-wide breaks Node's own fetch/Response — undici lazily reads `process.versions.node.split(...)`.
- [macronizer] Python-parity of tagger input: punctuation tokens ARE sent to RFTagger (they shape Viterbi context), ALL-CAPS words are lowercased with NO length check, and sentence enders are `.;:?!` (5 chars, not just `.!?`).
- [macronizer] index.html's Cache API store (`wasm-files-vN`) is cache-first and URL-keyed: bump the version constant whenever ANY file in public/wasm/ changes, or returning browsers serve the old binary forever (v1 could hold the broken 99KB rftagger.wasm cached 2026-07-11; v2 auto-purges older versions on startup).
- [macronizer] u→v/i→j (`performutov`/`performitoj`) must ONLY fire inside the DP backtrack when the wordlist accented form has 'v'/'j' at that position. Blanket `text.replace(/u/g,'v')` in the exact-match path or post-DP in `macronizeToken()` incorrectly converts `cum`→`cvm`. The `alignMacronized` exact-match path returns accented as-is (no orthographic conv), and the DP backtrack handles it per-character. Verified byte-level vs Python (Docker) across all 7 flag combos.
- [emscripten] The `cruncher.js` glue is `function(Morpheus){ Morpheus = Morpheus || {}; var Module = ... }` — the **parameter shadows the global**, so properties set on the factory *function object* (`window.Morpheus.locateFile = ...`) are invisible inside it. Calling `await Module()` with no args therefore loses `locateFile` and resolves `cruncher.data` against the *page's* directory (404 under a subpath deploy). Must call `await Module({ locateFile: Module['locateFile'] })` — fixed in `MorpheusAnalyzer.ts`.
- [macronizer] `WordlistEngine` is IndexedDB-only: `Macronizer.getWordlistMode()` hardcodes `'indexeddb'` and `loadWordlist(_mode)` **ignores** its mode arg (note the `_`). Any "load into memory" UI affordance is a lie — don't build one without implementing the backing store first.
- [wiktionary_pron] The macronizer deployed at `wiktionary_pron/macronizer/dist/` is compiled output with **hand-applied absolute-path prefixes** (`/wasm/` → `/wiktionary_pron/macronizer/wasm/`). A plain `npm run build` + copy silently reverts them. Re-prefix only the *absolute* paths — an over-broad `sed 's|/wasm/|...|g'` also corrupts relative ones like `'../wasm/rftagger.js'`.