# RFTagger WASM Port

WebAssembly port of the RFTagger POS tagger (C++) for the browser. Used by the Latin macronizer to assign part-of-speech tags to words.

## Contents

- `src/embind-wrapper.C` — Emscripten Embind C++ wrapper exposing RFTagger to JavaScript
- `src/` — Upstream RFTagger C++ source (POSTagger, Lexicon, SuffixLexicon, etc.)
- `lib/` — Trained model files (Latin LDT model, upstream training data)
- `cmd/` — Shell scripts for native RFTagger usage
- `doc/` — Documentation and papers
- `test/` — Test data
- `wordclass/` — Word class automaton
- `README` — Original RFTagger documentation (upstream)

## Build

### Requirements

- Emscripten SDK (emcc) — via Docker or manual install
- RFTagger C++ source in `rftagger/src/`
- Trained model file (`rftagger-ldt.model`, ~13MB)

### Docker build (recommended)

```bash
docker compose -f archive/build-scripts/docker-compose.yml up wasm-builder
```

### Manual build (Linux/WSL)

```bash
cd archive/build-scripts
bash build-rftagger-wasm.sh
```

### Output

- `public/wasm/rftagger.js` — JS loader (Emscripten modularize)
- `public/wasm/rftagger.wasm` — WASM binary
- `public/wasm/rftagger-ldt.model` — Latin model file (loaded at runtime via virtual FS)

## Architecture

```
JS (WasmTagger.ts)
   ↓ Embind class API
C++ Wrapper (embind-wrapper.C)
   ↓ RFTaggerJS class
RFTagger C++ Engine (POSTagger, Lexicon, SuffixLexicon)
   ↓ fopen() via Emscripten virtual FS
Model file (rftagger-ldt.model)
```

The Embind wrapper (`embind-wrapper.C`) exposes three tagging methods:
- `tagTokens(tokens)` — tag a flat array of tokens (file-based Sentence constructor, matches Python `rft-annotate` I/O)
- `tagSentences(sentences)` — tag a 2D array of sentences (in-memory, faster for batch processing)
- `tagToken(token)` — tag a single word

## JS API

In the browser, loaded via `<script>` tag:

```javascript
const tagger = new RFTaggerModule.RFTagger();
tagger.loadModel('/wasm/rftagger-ldt.model');

// Tag a sentence
const tags = tagger.tagTokens(['Gallia', 'est', 'omnis']);
// Returns: ['a---s-------f-n--', 'v3sp---', 'a---s-------f-n--']

// Tag multiple sentences
const result = tagger.tagSentences([
  ['Gallia', 'est', 'omnis'],
  ['divisa', 'in', 'partes', 'tres']
]);
```

TypeScript wrapper and fallback: `src/analysis/WasmTagger.ts`

## Notes

- The module uses Emscripten's virtual filesystem — the model file must be preloaded or fetched and written to the FS before `loadModel()`.
- `tagTokens()` writes tokens to a temp file and uses `Sentence(FILE*)` constructor, mirroring Python `rft-annotate` behavior exactly.
- `tagSentences()` constructs sentences in memory (no temp file I/O), matching the original C++ `Sentence(char**, int)` constructor for batch processing.
- Web/worker environment only (no Node.js WASM filesystem support).

## Limitations

- Only the Latin LDT model is included (other language models from upstream are not bundled)
- Model file is ~13MB, loaded asynchronously at runtime
- Single-threaded (Emscripten limitation)

## Original RFTagger

See `README` in this directory for upstream documentation. RFTagger is developed by Helmut Schmid, CIS, Ludwig-Maximilians-Universität München.

## License

RFTagger: Free for academic research and education (see original `README`).
WASM wrapper (`embind-wrapper.C`): same terms.
