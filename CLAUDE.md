# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Build TS → dist/ (includes fix-imports.js + copy-assets)
npm run build

# Production build (uses tsconfig.prod.json)
npm run build:prod

# Dev: watch mode
npm run dev

# Dev server (Vite, port 8080)
npx vite

# Tests
npm test                   # all tests (Jest)
npm run test:watch         # watch mode
npx jest tests/latin.test.ts  # single file

# Lint / Format
npm run lint
npm run format

# WASM builds (Docker recommended)
docker-compose up wasm-builder   # RFTagger WASM
# Morpheus WASM: see morpheus_js/docker-compose.morpheus.yml

# Serve for browser testing
npx vite
# Then open http://localhost:8080/demo.html
```

## Project Purpose

Browser port of [Johan Winge's Python Latin macronizer](https://github.com/johanwinge/latin-macronizer). Takes Latin text input and adds macrons (length marks over vowels) using POS tagging, morphological analysis, and dictionary lookups. The original Python calls two native binaries (`rft-annotate` and `cruncher`) — both are compiled to WebAssembly via Emscripten for browser use.

## Architecture Overview

Three layers: **analysis engines** (POS tagging, morphology, dictionaries) → **core orchestration** (Macronizer, Tokenization) → **API wrapper** (used by demo.html).

### src/ directory map

- **`src/core/Macronizer.ts`** — Main orchestrator. Manages initialization order, calls tokenization pipeline, handles caching.
- **`src/core/Tokenization.ts`** — Central pipeline: tokenize → split enclitics → POS tag → add lemmas → get accents → macronize → detokenize. Largest port from Python `tokenization.py`.
- **`src/core/Token.ts`** — Immutable token class with `with()` for property updates.
- **`src/core/alignMacronized.ts`** — DP edit-distance algorithm that places macrons by aligning plain text against accented forms. Port of Python `Token.macronize()`. Critical for correctness.
- **`src/core/Scansion.ts`** — Verse meter scanning (dactylic hexameter, pentameter, hendecasyllable). Port of Python `scansion.py`. Uses automaton approach.
- **`src/analysis/WasmTagger.ts`** — Wraps RFTagger C++ compiled to WASM. Falls back to `FallbackTagger` (simple suffix rules) when WASM unavailable.
- **`src/analysis/MorpheusAnalyzer.ts`** — Wraps Morpheus C analyzer compiled to WASM. Analyzes unknown words (crucial for handling out-of-vocabulary Latin). Uses `ccall()` to invoke C functions from `cruncher.wasm`.
- **`src/analysis/WordlistEngine.ts`** — IndexedDB-backed wordform database (~812k entries from `macrons.txt`). Replaces Python's SQLite. Integrates with Morpheus for unknown words.
- **`src/analysis/LemmaEngine.ts`** — Lemma dictionary lookup from `src/data/lemmas.json`.
- **`src/analysis/EndingPatternEngine.ts`** — Suffix-based vowel length rules from `src/data/endings.json`.
- **`src/api/MacronizerAPI.ts`** — Thin convenience wrapper for `demo.html`. Handles initialization with progress callbacks.
- **`src/utils/latin.ts`** — Shared utilities: text normalization, case conversion, enclitic handling, orthography (u↔v, i↔j).

### WASM Integration

Two separate WASM modules loaded at runtime:

1. **RFTagger** (`public/wasm/rftagger.{wasm,js}`) — C++ POS tagger. Loaded via `<script>` tag in `demo.html`, exposes global `RFTaggerModule`. Uses Emscripten embind C++ class API (`new RFTagger()`, `loadModel()`, `tagSentences()`). Model file: `rftagger-ldt.model` (~13MB, fetched and written to virtual FS at runtime).

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

- RFTagger: Emscripten compilation via Docker (`docker-compose up wasm-builder`). Source in `rftagger/`. Build scripts: `build-rftagger-wasm.sh`, `emscripten-build.sh`.
- Morpheus: Separate build in `morpheus_js/` directory. Source in `morpheus-master/` (git submodule). Build: `morpheus_js/build-morpheus-wasm.sh` via Docker (`morpheus_js/docker-compose.morpheus.yml`).

### Testing

- Unit tests (`tests/`): `alignMacronized.test.ts` (DP alignment), `latin.test.ts` (utilities).
- HTML test pages (manual browser testing): `demo.html` (main demo), `test-full-pipeline.html`, `test-functional.html`, `test-morpheus-wasm.html`, etc.
- Python comparison: `scripts/compare_rftagger_output.py` compares TS vs Python output.
