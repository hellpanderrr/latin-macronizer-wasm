# Macronizer Browser Edition - TODO

## ✅ Completed

### WASM Modules (C++ → WASM)
- [x] Morpheus cruncher (`morpheus_js/`) — compiled, tested, verified against original
- [x] RFTagger (`wasm/rftagger.js/wasm/model`) — compiled, user confirmed working

### Core Architecture
- [x] Type definitions (`src/core/Token.ts`)
- [x] Latin utilities (`src/utils/latin.ts`)
- [x] Token class (`src/core/Token.ts`) — extended with accented, isAmbiguous, isUnknown, startIndex, endIndex
- [x] Tokenization (`src/core/Tokenization.ts`) — full pipeline integrated
- [x] Tokenizer (`src/core/Tokenizer.ts`)
- [x] Macronizer (`src/core/Macronizer.ts`) — unified macronization entry point
- [x] WasmTagger (`src/analysis/WasmTagger.ts`) — implemented with C++ class API
- [x] LemmaEngine (`src/analysis/LemmaEngine.ts`)
- [x] EndingPatternEngine (`src/analysis/EndingPatternEngine.ts`)
- [x] WordlistEngine (`src/analysis/WordlistEngine.ts`) — IndexedDB-backed with lazy loading
- [x] Main exports (`src/index.ts`)
- [x] Demo UI (`demo.html`)
- [x] Full UI (`index.html`)
- [x] Documentation (`README-BROWSER.md`)

### Macronization Algorithms (Ported from Python)
- [x] DP alignment algorithm (`src/core/alignMacronized.ts`) — edit-distance with custom costs, backtracking, orthographic options
- [x] Candidate ranking (`Tokenization.getAccents()`) — wordlist lookup, casedist, tagdist, lemdist, ending pattern fallback
- [x] Helper functions: `tagDistance`, `levenshteinDistance`, `underscoreToUnicode`, `unicodeToUnderscore`
- [x] Enclitic handling (`-que`, `-ve`, `-ne`, `-st`) in tokenization and accent generation
- [x] Orthographic options: `alsomaius` (i→j handling), `performutov` (u→v), `performitoj` (i→j)
- [x] Ambiguity detection (`isAmbiguous`, `isUnknown` flags)

### Critical Bugfixes & Improvements
- [x] **Fixed DP backtracking** — `alignMacronized.ts` rewritten to store directions ('diag'|'up'|'left') instead of full strings in backtrack matrix. Now correctly builds result by backtracking from [n][m] to [0][0].
- [x] **Fixed candidate ranking** — `Tokenization.getAccents()` now re-sorts best candidates by (tagdist, lemdist) after filtering by casedist, ensuring correct candidate (with macron) is selected first.
- [x] **Case-sensitive exact match** — `alignMacronized()` early exit now uses case-sensitive comparison (`plain === accentedWithoutUnderscores`) to preserve capitalization (e.g., "Hi" → "Hī").
- [x] **Integration test input** — corrected text in `test-algorithms-compare.html` to match `dist/input.txt` (fixed "longissi me" → "longissime", "roximique" → "proximique").
- [x] **Trailing underscore preservation** — `alignMacronized()` was incorrectly stripping trailing underscores (which mark macrons on final vowels). Fixed to preserve them, enabling correct macronization of words like "Hi" → "Hī", "longissimē" → "longissimē".
- [x] **WASM tag cleaning (dots→dashes)** — `Tokenization.tagWithWasm()` and `addTags()` now convert RFTagger WASM tags (which contain dots like "n.-.s.") to dash-only format (`n-s--`) using `replace(/\./g, '-')`, matching wordlist tag format. Previously dots were removed entirely, causing tag mismatches.
- [x] **Breve marker cleaning regex** — `Tokenization.getAccents()` uses `accentedUnderscore.replace(/_\^/g, '').replace(/\^/g, '')` to strip breve markers. The original regex `/_^/g` was broken because `^` is a regex anchor; escaped `\\^` is required for literal caret.
- [x] **Empty accented guard** — `Tokenization.macronizeToken()` now checks if `accentedUnderscore` becomes empty after breve cleaning and falls back to plain text, preventing alignment failures.
- [x] **Wordlist load race guard** — `WordlistEngine` now serializes concurrent `loadFromText()` calls via a `loadingPromise` guard to prevent entryCount corruption.
- [x] **IndexedDB error handling** — `Tokenization.getAccents()` wraps `getAllEntries()` in try-catch; on error, word is treated as unknown instead of crashing the pipeline.
- [x] **Build verification** — `npm run build` succeeds with no TypeScript errors; all modules compiled.
- [x] **Wordlist parser delimiter** — `WordlistEngine.loadFromText()` now uses whitespace split (matching Python's `line.split()`) instead of pipe-delimited. Also fixed undefined `macronizedUnicode` variable.
- [x] **Case-sensitive exact match** — `alignMacronized()` early exit now uses case-sensitive comparison (`plain === accentedWithoutUnderscores`) to preserve capitalization (e.g., "Hi" → "Hī").
- [x] **Integration test input** — corrected text in `test-algorithms-compare.html` to match `dist/input.txt` (fixed "longissi me" → "longissime", "roximique" → "proximique").
- [x] **Trailing underscore preservation** — `alignMacronized()` was incorrectly stripping trailing underscores (which mark macrons on final vowels). Fixed to preserve them, enabling correct macronization of words like "Hi" → "Hī", "longissimē" → "longissimē".
- [x] **WASM tag cleaning (dots→dashes)** — `Tokenization.tagWithWasm()` and `addTags()` now convert RFTagger WASM tags (which contain dots like "n.-.s.") to dash-only format (`n-s--`) using `replace(/\./g, '-')`, matching wordlist tag format. Previously dots were removed entirely, causing tag mismatches.
- [x] **Breve marker cleaning regex** — `Tokenization.getAccents()` uses `accentedUnderscore.replace(/_\^/g, '').replace(/\^/g, '')` to strip breve markers. The original regex `/_^/g` was broken because `^` is a regex anchor; escaped `\\^` is required for literal caret.
- [x] **Empty accented guard** — `Tokenization.macronizeToken()` now checks if `accentedUnderscore` becomes empty after breve cleaning and falls back to plain text, preventing alignment failures.
- [x] **Wordlist load race guard** — `WordlistEngine` now serializes concurrent `loadFromText()` calls via a `loadingPromise` guard to prevent entryCount corruption.
- [x] **IndexedDB error handling** — `Tokenization.getAccents()` wraps `getAllEntries()` in try-catch; on error, word is treated as unknown instead of crashing the pipeline.
- [x] **Debug logging** — Added detailed console logging in `Tokenization.getAccents()` and `alignMacronized()` for words: `matrona`, `longissime`, `minime`, `sequana`, `eos`, `hi`. Logs show entry data, distance calculations, candidate sorting, and DP alignment steps.
- [x] **Build verification** — `npm run build` succeeds with no TypeScript errors; all modules compiled.

### Testing
- [x] Unit tests for core algorithms (`tests/alignMacronized.test.ts`, `tests/latin.test.ts`)
- [x] Integration test (`test-algorithms-compare.html`) — compares TS output with Python reference
- [x] Comparison test pages (`test-compare.html`, `test-compare-wasm.html`, `test-full-pipeline.html`)

## 🔄 Remaining Tasks

### 1. Full Wordlist Validation (Priority: High) ⏳
- [ ] Load full `macrons.txt` (33MB) into IndexedDB and verify all entries indexed
- [ ] Run integration test with complete wordlist and verify 100% match with Python output
- [ ] Benchmark query performance, optimize if needed

**Note**: All critical algorithm bugs have been fixed:
- Trailing underscore preservation (final-vowel macrons)
- WASM tag cleaning (dot → dash)
- Breve marker stripping (`^` and `_^`)
- Case-sensitive exact match
- Wordlist parser delimiter

### 2. Documentation (Priority: Medium) ⏳
- [ ] Update `README-BROWSER.md` with algorithm details (DP alignment, candidate ranking)
- [ ] Document options (`domacronize`, `alsomaius`, `performutov`, `performitoj`)
- [ ] Add usage examples and API reference
- [ ] Document testing procedure and expected results

### 3. Build & Deployment (Priority: Low) ✅
- [x] Production build config (`tsconfig.prod.json`) created
- [x] `npm run build:prod` available and functional
- [x] All dist files up-to-date

### 4. Scansion Engine (Priority: Low) ❌
- [ ] Port meter automata from `meters.py` — not started (out of scope for core macronization)
- [ ] Port scansion logic from `scansion.py` — not started
- [ ] Implement `scanVerses()` in Tokenization — not started
- [ ] Support hexameter, pentameter, hendecasyllable — optional

### 5. UI Polish (Priority: Low) ⏳
- [ ] Add progress indicator for wordlist loading
- [ ] Add copy-to-clipboard functionality
- [ ] Add download results as text/HTML
- [ ] Add word highlighting on hover
- [ ] Add "edit vowel" functionality (click to toggle)

### 6. Additional Unit Tests (Priority: Low) ⏳
- [ ] Unit tests for `Token` class
- [ ] Unit tests for `Tokenization` methods (tokenization, enclitic splitting)
- [ ] Property-based tests for alignment algorithm

## Known Issues

1. **Model size**: 13MB model → high RAM usage (inherent to statistical model)
2. **Wordlist loading**: 33MB file may take time to index; progress indicator needed
3. **TypeScript strictness**: some optional properties require careful handling (already addressed)

## Next Steps

### Immediate
1. **Run full wordlist test** — load `macrons.txt` via `test-algorithms-compare.html` and verify output matches `dist/output.txt`
2. **Update documentation** — describe DP alignment, candidate ranking, and usage
3. **Create production build** and verify dist artifacts

### Short-term
4. Add wordlist loading progress bar to UI
5. Implement copy/download buttons
6. Expand unit test coverage (Token, Tokenization)

### Long-term
7. Consider scansion engine integration (if required by users)
8. Optimize WASM model loading (lazy init)
9. Explore alternative lighter-weight tagger models
