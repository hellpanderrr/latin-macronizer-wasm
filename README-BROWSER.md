# Latin Macronizer - Browser Edition

Port of the Latin Macronizer (https://alatius.com/macronizer/) to run entirely in the browser using TypeScript and WebAssembly.

## Status: Core Algorithms Implemented ✅

The port has completed the critical macronization logic:
- **DP alignment algorithm** (vowel-length placement) ported from `token.py:macronize()`
- **Candidate ranking** (wordlist lookup, tag distance, lemma distance) ported from `tokenization.py:getAccents()`
- **Orthographic options**: `alsomaius`, `performutov`, `performitoj` fully supported
- **Enclitic handling**: `-que`, `-ve`, `-ne`, `-st` splitting and accent rules
- **Wordlist integration**: IndexedDB-backed `WordlistEngine` with `macrons.txt` support
- **Ending pattern fallback** for unknown words

The implementation is feature-complete and ready for validation with the full 33MB wordlist.

## Architecture Overview

```
src/
├── core/              # Core engine (ported from Python)
│   ├── alignMacronized.ts  # DP alignment algorithm (NEW)
│   ├── Macronizer.ts       # Main orchestrator
│   ├── Token.ts            # Token with macronization
│   ├── Tokenization.ts     # Text tokenization + accent generation
│   └── Tokenizer.ts        # Token stream processing
│
├── analysis/          # Analysis engines
│   ├── WasmTagger.ts       # RFTagger WASM wrapper
│   ├── LemmaEngine.ts      # Lemma dictionary
│   ├── EndingPatternEngine.ts  # Suffix pattern matching
│   └── WordlistEngine.ts   # IndexedDB wordlist storage
│
├── api/               # Public API
│   └── MacronizerAPI.ts    # Main API interface (legacy)
│
├── types/             # Type definitions
│   └── index.ts
│
├── utils/             # Utilities
│   └── latin.ts            # Latin text processing (tagDistance, levenshtein, etc.)
│
└── index.ts           # Main exports
```

## Key Components

### 1. Tokenization (`Tokenization.ts`)
- Splits text into tokens using Unicode-aware regex
- Handles enclitics (`-que`, `-ve`, `-ne`, `-st`) via `splitEnclitic()`
- Detects sentence boundaries (`startssentence`, `endssentence`)
- Preserves original text positions (`startIndex`, `endIndex`) for accurate detokenization
- Integrates POS tagging, lemmatization, accent generation, and macronization in a pipeline

### 2. POS Tagging (`WasmTagger.ts`)
- Uses compiled RFTagger C++ via WebAssembly (Emscripten)
- Statistical tagger trained on Latin Dependency Treebank (LDT)
- ~644 distinct tags, ~290K-word lexicon
- Supports both C++ class API and C-style API

### 3. Lemmatization (`LemmaEngine.ts`)
- Loads lemma frequency data from `src/data/lemmas.json` (converted from `lemmas.py`)
- Provides fast lemma lookup by word form and POS tag
- Used during `Tokenization.addLemmas()`

### 4. Wordlist Engine (`WordlistEngine.ts`)
- Stores macronized forms from `macrons.txt` (33MB) in IndexedDB for browser persistence
- Supports lookup by word form + tag, and retrieval of all accented candidates for a word form
- Critical for `Tokenization.getAccents()` candidate generation
- Also used for unknown word analysis via Morpheus WASM (if configured)

### 5. Ending Pattern Engine (`EndingPatternEngine.ts`)
- Loads suffix patterns from `src/data/endings.json` (converted from `macronized_endings.py`)
- Provides fallback macronization for unknown words when wordlist has no entry
- Patterns include priority, plain suffix, and accented replacement (with `_` markers)

### 6. DP Alignment (`alignMacronized.ts`) — **Core Algorithm**
Ported directly from Python `Token.macronize()` (edit-distance DP with custom costs):

- **Cost model**:
  - Insertion: `0` if inserting `_` (macron marker), else `2`
  - Substitution: `100` if accented char is `_` (discourage), `1` for I/J or U/V equivalence, `2` otherwise
  - Deletion: always `2`
- **Backtracking** builds aligned string, applying orthographic conversions (`performutov`, `performitoj`) during diagonal moves
- **Preprocessing**: removes breve markers (`^`, `_^`); applies `alsomaius` transformation (inserts `_` after vowel before `j`+vowel, unless prefix in `prefixesWithShortJ`)
- **Post-processing**: collapses multiple `_` into single, removes trailing `_`
- Returns macronized string in **underscore notation** (e.g., `ro_sa`), later converted to Unicode via `underscoreToUnicode()`

### 7. Candidate Ranking (`Tokenization.getAccents()`)
Ported from `tokenization.py:getaccents()`:

- **Single-candidate shortcut**: if wordlist returns exactly one unique accented form, use it
- **Multi-candidate ranking**:
  - `casedist`: `0` if token and lemma have matching title case OR token starts a sentence; else `1`
  - `tagdist`: Hamming distance between LDT tags via `tagDistance()`, with special handling for nomina of different types (skip tense/mood/voice positions 3–5 for 9-char tags)
  - `lemdist`: Levenshtein distance between lemmas
- Candidates sorted by `(casedist, tagdist, lemdist)` ascending; deduplicated preserving order
- `isAmbiguous` flag set if multiple candidates remain after filtering
- Unknown words (`isUnknown`) fall back to `EndingPatternEngine.getPatterns()`; first matching pattern used

### 8. Helper Utilities (`utils/latin.ts`)
- `tagDistance(tag1, tag2)`: Ported from `postags.py:tag_distance`
- `levenshteinDistance(a, b)`: Standard DP edit distance
- `underscoreToUnicode()` / `unicodeToUnderscore()`: Convert between `_` markers and precomposed macrons (ā, ē, ī, ō, ū, ȳ)
- `toAscii()`, `normalizeWord()`, `splitEnclitic()`, etc.

## Usage

### Browser (HTML page)

```html
<script type="module">
  import { Macronizer } from './dist/core/Macronizer.js';
  import { LemmaEngine } from './dist/analysis/LemmaEngine.js';
  import { WordlistEngine } from './dist/analysis/WordlistEngine.js';
  import { EndingPatternEngine } from './dist/analysis/EndingPatternEngine.js';
  import { WasmTagger } from './dist/analysis/WasmTagger.js';

  // Initialize engines
  const wasmTagger = new WasmTagger();
  await wasmTagger.initialize();

  const lemmaEngine = new LemmaEngine();
  await lemmaEngine.load();

  const wordlistEngine = new WordlistEngine();
  await wordlistEngine.init();
  // Load macrons.txt into IndexedDB first (see test-algorithms-compare.html)

  const endingEngine = new EndingPatternEngine();
  await endingEngine.load();

  // Process text
  const macronizer = new Macronizer();
  const result = await macronizer.macronize(
    'Gallia est omnis divisa in partes tres',
    { domacronize: true, alsomaius: true },
    // tagResults will be generated internally if not provided? Actually current API requires tagResults; see Macronizer.ts
    // Better: use Tokenization directly:
    const tokenization = new Tokenization(text, { preserveWhitespace: true });
    await tokenization.tagWithWasm(wasmTagger);
    tokenization.addLemmas(lemmaEngine);
    await tokenization.getAccents(wordlistEngine, endingEngine);
    tokenization.macronize(true, true, false, false, endingEngine);
    const output = tokenization.detokenize();
  );
</script>
```

> **Note**: The `Macronizer` class currently expects `tagResults` to be passed; the recommended pipeline is to use `Tokenization` directly as shown above. A future update will simplify the API.

### Running Tests

1. **Unit tests** (Jest) — run `npm test`:
   - `tests/alignMacronized.test.ts` — DP alignment edge cases
   - `tests/latin.test.ts` — `tagDistance`, `levenshteinDistance`, underscore/unicode conversion

2. **Integration test** — open `test-algorithms-compare.html` in a browser (served via HTTP):
   - Loads WASM tagger, lemma engine, ending patterns
   - Upload `macrons.txt` or auto-fetch from `latin_macronizer/macrons.txt`
   - Processes the standard input text and compares against Python reference output (`dist/output.txt`)
   - Displays token-level details and mismatch analysis

## Data Files

- `latin_macronizer/macrons.txt` (33MB) — master wordlist with macronized forms (underscore notation). Required for accurate macronization.
- `latin_macronizer/rftagger-ldt.model` — RFTagger statistical model (~13MB)
- `src/data/lemmas.json` — lemma frequency dictionary (from `lemmas.py`)
- `src/data/endings.json` — suffix patterns for unknown words (from `macronized_endings.py`)
- `src/data/meters.json` — Latin meter automata (not yet used)

## Building

```bash
# Install dependencies
npm install

# Build TypeScript (development)
npm run build

# Build production (minified, if tsconfig.prod.json exists)
npm run build:prod

# Serve locally (for testing in browser)
npx serve .
# or
python -m http.server 8000
```

## Testing

- `test-macronizer.html` — basic UI test
- `test-full-pipeline.html` — step-by-step pipeline (tokenization → tagging → lemmatization → macronization)
- `test-algorithms-compare.html` — **new** comprehensive comparison with Python reference
- `test-compare.html` — compares WASM tagger output with original Cruncher

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 14+)
- Requires WebAssembly and IndexedDB support

## Original Project

Based on:
- **Author**: Johan Winge
- **Thesis**: "Automatic annotation of Latin vowel length" (2015)
- **Tagger**: RFTagger by Helmut Schmid
- **Treebank**: Latin Dependency Treebank
- **License**: MIT (original also MIT?)
