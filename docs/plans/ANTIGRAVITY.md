# ANTIGRAVITY.md

This file provides guidance to Antigravity (AGY) when working with code in this repository. It inherits base knowledge from the original porting efforts and includes ongoing session learnings.

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
npm run test:watch         # watch mode
npx jest test/unit/latin.test.ts  # single file

# Lint / Format
npm run lint
npm run format

# WASM builds (Docker recommended)
# RFTagger: see native/build/docker-compose.yml
docker-compose -f native/build/docker-compose.yml up wasm-builder
# Morpheus WASM: see native/morpheus/js/docker-compose.morpheus.yml

# Serve for browser testing
npx vite
# Then open http://localhost:8080
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

- `build-scripts/` — Moved to `native/build/`
- `debug-outputs/` — Temp output files, debug logs, comparison results from WASM porting
- `test-pages/` — Moved to `test/pages/`
- `plans/` — Moved to `docs/plans/`
- `misc/` — Files distributed to `test/` and `python/`

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

- RFTagger: Emscripten compilation via Docker (`native/build/docker-compose.yml`). Source in `native/rftagger/`. Build script: `native/build/emscripten-build.sh`.
- Morpheus: Separate build in `native/morpheus/js/` directory. Source in `native/morpheus/c/`. Build: `native/morpheus/js/build-morpheus-wasm.sh` via Docker (`native/morpheus/js/docker-compose.morpheus.yml`).

### Testing

- Unit tests (`test/unit/`): `alignMacronized.test.ts` (DP alignment), `latin.test.ts` (utilities).
- Manual browser test: `index.html` (served via `npx vite`).
- HTML test pages: see `test/pages/test-pages/` for experiment/integration HTMLs from WASM porting.

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

### 11. Scansion: the -ērunt/-ĕrunt alternation, NOT a ui-diphthong (M-013)
The original M-013 analysis blamed Aen 2.774 "obstipui, steteruntque" on the
engine not treating word-final `ui` as a diphthong. That was WRONG, and the
correction is a general lesson about diagnosing scansion failures:
- **Gold-quantity experiment first.** Feed the gold per-word quantities
  (hypotactic.com's macronized Aeneid) into `scanVerse`. If the line still
  fails with gold quantities, it's a PROSODY-model gap, not a wordlist gap.
  Only ~1/4 of the corpus failures fixed with gold — the rest were model gaps.
- **The real mechanism:** the 3rd-pl-perfect -ērunt/-ĕrunt alternation. The
  wordlist marks `stetērunt`/`cōnstitērunt` with long ē, but the poetic
  license allows it short. `separateAmbiguousVowels` now rewrites a trailing
  `[aeiouy]_runt` to `_^` (ambiguous) so both lengths result. This fixed the
  obstipuī line and cōnstitērunt with linguistically-correct readings.
- **A tempting `ui`-diphthong merge was a FALSE POSITIVE** — it turned
  obstupuī into a 3-syllable `LSL` (it's genuinely 4: ob-sti-pu-ī) and caused
  a 44-line corpus regression (sanguine/anguis: `gu` makes the u consonantal).
  A scansion "fix" that corrupts the quantity of the very word it unlocks is a
  wrong reading — the automaton found A path, not THE correct one. Always
  print the chosen accented forms and eyeball them.
- **A golden-line regression gate only works if it checks `feet`.** The corpus
  gate previously marked a needle as passing just because a matching line
  existed — a golden line that stopped scanning would silently pass. It now
  requires non-empty feet for that line.
- **RFTagger POS differs per-line vs whole-file**, so a line that scans alone
  (different POS → different accents) may still fail in the full file. Judge
  fixes by the whole-file gate, not by per-line runs.

### 12. Scansion: gold-confirmed ACCENT_OVERRIDES (wordlist quantity errors)
After the -ērunt/-ĕrunt fix, a per-word gold comparison (hypotactic.com
macronized Aeneid) surfaced a second fixable class: the wordlist marks some
words' first syllable long where the edition has it short. The existing
ACCENT_OVERRIDES map in Tokenization.ts (previously only 'italorum') is the
right mechanism — it injects the corrected form as an extra scansion candidate
while keeping the wordlist form primary for prose.
- **Verify against the gold word before adding.** Each override was checked
  against the macronized edition (Lāvini→lā-vī-nī, Orīōn→ŏ-rī-ōn,
  dehīscēns→dĕ-hīs-cēns, ecqua→short final, Phryges→short e, Trōes→short es,
  Dīāna→long first i — the INVERSE of the others).
- **Judge by the whole-file gate, not per-line.** My per-line reconstruction
  "fixed" ~21 lines, but only 10 survived the real whole-file gate (RFTagger
  POS differs per-line vs whole-file). Always add overrides, rebuild, and run
  test/e2e/test-scansion-corpus.mjs — the snapshot delta is the truth.
- **Prose is untouched** because overrides append candidates; prose uses
  accented[0] (the wordlist form). Scansion mode lets the meter pick the
  corrected reading.
- 10 lines fixed (150→140), zero regressions; GOLDEN list grew to 14 lines.

### 13. Scansion: parallel subagent integration (corpus corrections + overrides)
Two parallel subagents advanced M-013 in one session:
- **est-prodelision was tested and REJECTED** — only 2 failing lines contain
  "est", neither on the death path, and the existing 'V'-elision branch already
  produces prodelision's metrical effect. Adding surface area for zero gate
  benefit is the exact false-positive trap the ui-merge fell into.
- **The subagent found a REAL gate bug:** empty verses (divider lines) emitted
  no foot, shifting scannedFeet alignment and both creating spurious failures
  AND hiding real ones. Fix: emit empty-foot placeholders for empty verses;
  gate skips non-verse (normalized-empty) lines. Always re-check alignment
  invariants when a corpus has non-verse lines.
- **Corpus corrections belong in the corpus, not the engine.** 4 lines in
  catullus-II/LXIV had typos/editorial markers (solacium→solaciolum,
  [est/es]→est, ligitam→ligatam, misera→a misera). Verify against sources
  (Latin Library, wikisource, negenborn scanned Catullus) before touching.
- **Verify chosen forms, not just "it scans".** A line "scanning" via a
  wrong reading (like a hemistich accepting a partial) can look like success.
  Print the macronized output and check quantities: sŏ-lu-it, in-ē-lĕ-gantēs,
  fra-grāns (ā long by position before -ns), vŏlŏ, dăbŏ, cŷ-rē-nīs, mănĕ,
  ă-bī-te, tētĕ, ŏ-ĭ-lē-ī, Thē-sĕ-ă, Eu-ry-ă-lus all verified correct.

### 14. Full-Catullus scansion gold (negenborn.net) → wordlist bug fixes (M-023m)
Downloaded the complete negenborn.net scanned Catullus (118 pages: carmina
1-116 minus spurious 18/19/20, plus fragments 2b/14b/58b/78b/95b) — a full
gold with BOTH long (macron) AND short (breve) marks on every
quantity-relevant vowel. This is a strict superset of the macron-only
hypotactic Aeneid gold used for M-013.

- **The gold lives in `test/data/gold/catullus/<meter>/`**, DECOUPLED from the
  harness corpus (`test/data/corpus/` untouched — its 99 files + snapshot stay
  byte-identical, so the scan-completeness gate is unaffected). Raw source:
  `wiktionary_pron/tmp/catullus_scansion/txt/` (gitignored in the site repo).
- **Conversion `test/build-catullus-corpus.mjs`** modernizes medieval u→v via
  the WORDLIST as oracle (flip each unmarked u to v, keep the candidate the
  wordlist form-index contains — cui/suus stay, nouum→novum; the wordlist has
  BOTH spellings, so the tiebreak is "most v's"), classifies each carmen by
  meter, and writes the full-marked poems. Set `CATULLUS_TXT_DIR` to regenerate.
- **The right comparison is SCAN-BASED, not prose per-vowel.** A naive per-vowel
  match of `accented[0]` (prose layer) to the gold gave ~70% agreement that is
  ~30% position-length by nature (lepidum→le^pi^dum is nature-short; the gold
  marks it long at the -um/consonant) — NOT actionable. Worse, `accented[0]` is
  the tagger's ranked candidate (short-biased: `^` sorts before `_`) and
  context-flips (tribus, patrona). The actionable method: for each line that
  FAILS to scan, align engine words to gold words and report the FIRST word
  whose gold L/S pattern no engine candidate can produce, then brute-force the
  `_`/`^` form that unlocks it.
- **`test/catullus-blocker.mjs`** = the actionable comparison (adapts
  `gold-blocker.mjs`'s brute-force fix finder to the macron/breve gold, all
  Catullus meters). Output: per failing line, `BLOCKER: word needs gold PATTERN
  (engine: ...)` + `FIX: 'form'` candidates. `test/catullus-gold-diag.mjs` is
  the JSON version.
- **8 gold-confirmed wordlist quantity bugs FIXED via ACCENT_OVERRIDES**
  (each verified: the target line now scans; overrides only ADD candidates so
  prose/scansion can't regress):
  - `erechthei` — Erechtēī needs the 3-syllable synizesis SLL; wordlist only
    had 4-syllable readings.
  - `aerea` — āereă: the ā is long; wordlist aere^a had short a.
  - `lasarpiciferis` — lāsarpīciferīs: long ā; wordlist short.
  - `reiecta` — rēiecta: re- long; wordlist rejecta short e.
  - `sic` — sĭc always short; wordlist only had si_c (long).
  - `liquisse` — lĭquisse (linquo short i); wordlist li_quisse over-lengthened.
  - `deprensa` — dĕprēnsa: de- short; wordlist de_pre_nsa_ over-lengthened.
  - `pegaseo` — Pēgaseo: long ē; wordlist pe_ga^se_o_ was LSLL.
- **Remaining ~247 failing lines across the gold** are dominated by iambic
  poems + final-syllable/elision cases the segmenter can't resolve (no `_`/`^`
  form produces the gold pattern) — the bulk are NOT wordlist bugs. The ~17
  remaining blockers-with-fixes need human triage (some are gold-editorial
  errors like `tu`, `hoc`, `ridete` where the final-syllable quantity is
  metrical, not lexical).
- **Lesson (the advisor's, confirmed):** comparing prose lexical quantity to
  metrical gold is the wrong layer — ~30% of Latin syllables are long-by-
  position, so "70% agree" is a trivial baseline, and the interesting bugs hide
  in the LONG bucket. Only the failing-line blocker scan is actionable.
