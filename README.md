# Latin Macronizer

Browser-based Latin text macronizer — adds macrons (long vowel marks: ā, ē, ī, ō, ū) to Latin text using POS tagging + morphological analysis. Port of [Johan Winge's Python tool](https://github.com/johanwinge/latin-macronizer).

**Try it**: open `index.html` via a dev server (see below).

## How it works

```
Latin text → tokenize → split enclitics → POS tag → lookup wordlist → 
Morpheus analysis (unknowns) → suffix rules → scansion → DP alignment → macronized text
```

- **RFTagger** — C++ POS tagger compiled to WebAssembly (~13MB model)
- **Morpheus / cruncher** — C morphological analyzer compiled to WebAssembly (~23MB data)
- **Wordlist** — 812k wordform entries from `macrons.txt` (32MB), served as plain text, cached in IndexedDB or in-memory Map
- **Scansion** — automaton-based verse meter scanning (dactylic hexameter, pentameter, hendecasyllable, iambic)
- **DP alignment** — edit-distance algorithm placing macrons by matching plain text against accented forms

## Quick start

```bash
# Install dependencies
npm install

# Start dev server
npx vite

# Open http://localhost:8080
```

### CLI (Node.js, no browser needed)

Uses FallbackTagger (suffix-rule POS tagger) — no WASM, works directly in Node.

```bash
# Pipe text in, get macrons out
echo "Gallia est omnis divisa in partes tres" | node cli.mjs

# Output with metadata to stderr, macronized text to stdout
node cli.mjs caesar.txt

# Verse scanning
node cli.mjs --scan hexameter arma_virumque.txt

# Full usage
node cli.mjs --help
```

### Build

```bash
npm run build          # TypeScript → dist/
npm run build:prod     # Production build
```

### Other commands

```bash
npm test               # Unit tests (Jest)
npm run lint           # Lint
npm run format         # Format code
```

## Wordlist storage

The app loads a 32MB wordlist on first use. Two modes:

| Mode | First load | Subsequent | Persistence |
|------|-----------|------------|-------------|
| **Memory** | ~5s (download + parse) | ~5s | None |
| **IndexedDB** | ~3min (download + write) | Instant | Survives refresh |

Both modes show download progress (byte count, parse progress, store progress). WASM files (model, data) are cached via the Cache API automatically.

## Architecture

```
src/
├── analysis/          # Engines
│   ├── WasmTagger.ts      — RFTagger WASM wrapper
│   ├── MorpheusAnalyzer.ts— Morpheus WASM wrapper
│   ├── WordlistEngine.ts  — Wordform DB (IndexedDB/memory)
│   ├── LemmaEngine.ts     — Lemma dictionary lookup
│   └── EndingPatternEngine.ts — Suffix rules
├── core/              # Orchestration
│   ├── Macronizer.ts      — Main orchestrator
│   ├── Tokenization.ts    — Central pipeline
│   ├── Token.ts           — Immutable token class
│   ├── Tokenizer.ts       — Regex tokenizer
│   ├── Scansion.ts        — Verse meter scanning
│   └── alignMacronized.ts — DP alignment
├── api/
│   └── MacronizerAPI.ts   — Browser wrapper
├── utils/
│   ├── latin.ts           — Text utilities
│   └── FileCache.ts       — Cache API wrapper
└── data/              — JSON dictionaries
    ├── lemmas.json
    ├── endings.json
    └── meters.json
```

## WASM build (developers only)

The C/C++ sources are in `native/rftagger/` and `native/morpheus/c/`. WASM builds use Docker:

```bash
# RFTagger
docker compose -f native/build/docker-compose.yml up wasm-builder

# Morpheus
# See native/morpheus/js/docker-compose.morpheus.yml
```

Build scripts in `native/build/`.

## License

GPL-3.0 (see LICENSE). Original work by Johan Winge.
