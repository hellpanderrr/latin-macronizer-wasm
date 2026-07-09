# ANTIGRAVITY.md

This file provides guidance to Antigravity (AGY) when working with code in this repository. It inherits base knowledge from the original porting efforts and includes ongoing session learnings.

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
# RFTagger: see archive/build-scripts/docker-compose.yml
docker-compose -f archive/build-scripts/docker-compose.yml up wasm-builder
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
- **`python/`** — Original Python source (reference for porting). Formerly `latin_macronizer/`.
- **`src/utils/latin.ts`** — Shared utilities: text normalization, case conversion, enclitic handling, orthography (u↔v, i↔j).

### Archive structure

The `archive/` directory stores files removed from root for cleanliness:

- `build-scripts/` — WASM/Docker build scripts (`.sh`, `.bat`, `.ps1`, `docker-compose.yml`, `Dockerfile.*`)
- `debug-outputs/` — Temp output files, debug logs, comparison results from WASM porting
- `duplicate-wasm/` — Duplicates of `public/wasm/` from `wasm/` and `public/models/` directories
- `test-pages/` — Experimental HTML test pages (15 files); the canonical demo is `demo.html`
- `plans/` — Old development plans and strategy docs
- `misc/` — Python model inspection scripts, `setup.py`, old JS wrappers
- `root-originals/` — Original `macrons.txt` that was at root (identical to `public/macrons.txt`)

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

- RFTagger: Emscripten compilation via Docker (`archive/build-scripts/docker-compose.yml`). Source in `rftagger/`. Build script: `archive/build-scripts/emscripten-build.sh`.
- Morpheus: Separate build in `morpheus_js/` directory. Source in `morpheus-master/` (git submodule). Build: `morpheus_js/build-morpheus-wasm.sh` via Docker (`morpheus_js/docker-compose.morpheus.yml`).

### Testing

- Unit tests (`tests/`): `alignMacronized.test.ts` (DP alignment), `latin.test.ts` (utilities).
- Manual browser test: `demo.html` (served via `npx vite`).
- Archived test pages: see `archive/test-pages/` for experiment/integration HTMLs from WASM porting.

---

## Antigravity Dev Notes / Session Gotchas

The following self-corrections and learnings were documented automatically by Antigravity during deep debugging sessions:

### 1. WASM Emscripten Module Pathing (`locateFile` bug)
When wrapping Emscripten modules (like `Morpheus`/`cruncher.wasm`), correctly passing the `locateFile` override during module factory initialization is absolutely critical. Failing to map this properly results in Emscripten attempting to fetch `.data` files from the root URL (e.g., `/cruncher.data` instead of `/wasm/cruncher.data`), which triggers 404s and breaks the WASM initialization entirely.

### 2. Node.js ESM JSON Imports
When running backend tests in a pure ESM context (Node 20+), strict import assertions are required for JSON imports (`import data from './data.json' with { type: 'json' }`). Omission leads to `ERR_IMPORT_ASSERTION_TYPE_MISSING`. Similarly, `package.json` must possess `"type": "module"` if you are running pure `.js` files via Node in modern syntax.

### 3. API Wrapper Contracts & Error Swallowing
The `MacronizerAPI` returned `result.macronized`, but `demo.html` was hardcoded to expect `result.success` and `result.macronizedText`. Discrepancies in these API contracts led to silent failures, where the `catch (err)` block executed but `err.message` was undefined, resulting in a confusing `Error: undefined` UI render. Always verify the exact return schema matches the consumer's expectation.

### 4. PowerShell Script Encoding (Nerd Font Corruption)
On Windows, PowerShell natively defaults to reading `.ps1` files in ANSI (Windows-1252) unless a Byte Order Mark (BOM) is explicitly present. When dealing with scripts containing UTF-8 Nerd Font icons (like custom `statusline.ps1` plugins), **you must prepend a `\uFEFF` BOM**. Without it, PowerShell throws parser errors (`Unexpected token`) upon encountering the "corrupted" emojis.

### 5. AI File-Editing Tools Stripping BOMs
Be extremely cautious when using built-in agentic file replacement tools (like `replace_file_content`) to edit PowerShell scripts on Windows. These automated tools may silently write the file back out in standard UTF-8 without the BOM, instantly re-breaking emoji parsing. Always rely on a robust Node.js/Python script to inject and verify the `\uFEFF` BOM if editing sensitive scripts.

### 6. JSON String Escaping in CLI configurations
When setting shell commands in configuration files (like `settings.json` for Antigravity's statusLine), do not wrap parameters in double quotes unless absolutely necessary (e.g., if there are spaces in the path). Wrapping a path in double quotes like `-File "C:/..."` can cause the wrapper or subshell to interpret the double quotes as literal characters of the file path, resulting in an `Illegal characters in path` error.

### 7. IndexedDB Loading Performance (Transaction Batching)
When loading a massive wordlist like `macrons.txt` (~812k entries) into IndexedDB in the browser, using a small batch size (like `1,000` entries per transaction) causes extreme overhead, taking over 2 minutes and triggering browser/test timeouts. Increasing the batch size to `50,000` allows the browser to commit the database in under 2.5 seconds (a 50x speedup).

### 8. Dictionary Lemma Lookups vs Wordform Queries
The `LemmaEngine` stores lemma frequencies mapped by their *dictionary lemma* keys (e.g. `sum`), not by *inflected wordforms* (e.g. `est`). Querying `LemmaEngine.lookup` with the wordform instead of the lemma causes it to fail, falling back to using the wordform itself as the lemma. Correcting the pipeline to resolve candidate lemmas from the wordlist first, then checking their frequencies in the lemma dictionary, guarantees proper candidate scoring (e.g., resolving `est` to `sum` instead of `edo`).

### 9. Tokenization Sentence Boundary Precision for POS Tagging
Statistical POS taggers (like RFTagger) rely on accurate sentence contexts. In Latin, single-letter abbreviations followed by a period (e.g., `M. Messala`) can mistakenly split sentences if punctuation boundaries are set unconditionally. Implementing a `possiblesentenceend` look-ahead check (checking if the preceding word length is `> 1`) matches the Python parser exactly and prevents sentence fragmentation, preserving tagger accuracy.

### 10. Emscripten WASM vs Native GCC Statistical Tagger Parity
Even with identical models (`rftagger-ldt.model`), a compiled WebAssembly binary (via Emscripten) might occasionally yield slightly different tag transitions compared to a native GCC-compiled Linux binary due to floating point precision and optimization differences during Viterbi decoding. These differences affect highly ambiguous words (like `omnis`/`lingua` case declensions) but do not impact the correctness of the pipeline architecture.
