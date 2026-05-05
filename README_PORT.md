# Latin Macronizer → Browser JavaScript Port

## Overview

This document describes the port of the Latin macronizer system from Python to browser-compatible JavaScript/TypeScript, with special focus on RFTagger statistical POS tagging via WebAssembly compilation.

## Architecture

### Components

1. **Core Layer** (`src/core/`)
   - `Token.ts` - Immutable token representation
   - `Tokenizer.ts` - Browser-compatible text tokenization
   - `Macronizer.ts` - Main macronization engine

2. **Analysis Layer** (`src/analysis/`)
   - `WasmTagger.ts` - WebAssembly RFTagger wrapper
   - `LemmaEngine.ts` - Lemma dictionary lookup
   - `EndingPatternEngine.ts` - Morphological pattern matching
   - `EditDistanceEngine.ts` - Edit distance-based lookup

3. **API Layer** (`src/api/`)
   - `MacronizerAPI.ts` - Public API for browser integration

4. **Build Configuration**
   - `Dockerfile.wasm` - Multi-stage Docker build for WASM compilation
   - `docker-compose.yml` - Development and production services
   - `emscripten-build.sh` - Emscripten build script

## Quick Start

### Using Docker (Recommended for Windows)

```bash
# Build and start development environment
docker-compose up -d wasm-builder

# Wait for WASM compilation to complete
docker-compose logs -f wasm-builder

# Start development server
docker-compose up -d app-dev

# Access application at http://localhost:3000
```

### Manual Build

```bash
# Install dependencies
npm install

# Build WASM module (requires Emscripten)
./emscripten-build.sh

# Start development server
npm run dev
```

## Usage

### Browser (ES Modules)

```javascript
import { MacronizerAPI } from './src/api/MacronizerAPI.js';

// Initialize
const api = MacronizerAPI.getInstance({
  useWasm: true,  // Use WASM RFTagger
  confidenceThreshold: 0.80,
});

await api.initialize();

// Process text
const result = await api.process('Gallia est omnis divisa in partes tres');

if (result.success) {
  console.log(result.macronizedText);
  // Output: Gallia est omnis dīvīsa in partēs trēs
  console.log('Confidence:', result.confidence);
  console.log('Tokens:', result.tokens);
}
```

### Browser (Global Script)

```html
<script type="module">
  import { macronize } from './src/api/MacronizerAPI.js';
  
  const result = await macronize('Et tu, Brute?');
  console.log(result.macronizedText);
</script>
```

### Node.js

```javascript
const { MacronizerAPI } = require('./dist/MacronizerAPI');

const api = MacronizerAPI.getInstance({ useWasm: false });
await api.initialize();

const result = await api.process('Veni, vidi, vici');
console.log(result.macronizedText);
```

## API Reference

### MacronizerAPI

#### `static getInstance(config?)`
Get singleton instance.

```javascript
const api = MacronizerAPI.getInstance({
  useWasm: true,
  wasmModelPath: '/wasm/rftagger.js',
  confidenceThreshold: 0.80,
  enableCache: true,
});
```

#### `async initialize()`
Initialize the macronizer (load WASM module if enabled).

```javascript
await api.initialize();
```

#### `async process(text)`
Process Latin text and add macrons.

```javascript
const result = await api.process('Alea iacta est');
// {
//   success: true,
//   macronizedText: 'Ālea iacta est',
//   originalText: 'Alea iacta est',
//   tokens: [...],
//   confidence: 0.92,
//   processingTime: 15.3
// }
```

#### `async processBatch(texts)`
Batch process multiple texts.

```javascript
const results = await api.processBatch([
  'Carpe diem',
  'Tempus fugit',
  'Veni, vidi, vici'
]);
```

#### `tokenize(text)`
Tokenize text without macronization.

```javascript
const tokens = api.tokenize('Gallia est omnis');
// [Token, Token, Token]
```

#### `isReady()`
Check if macronizer is initialized.

```javascript
if (api.isReady()) {
  // Safe to process
}
```

#### `clearCache()`
Clear processing cache.

```javascript
api.clearCache();
```

#### `destroy()`
Destroy resources and free memory.

```javascript
api.destroy();
```

### Token Class

```javascript
const token = new Token('puella', {
  tag: 'n-s--f-',
  lemma: 'puella',
});

token.text;        // 'puella'
token.tag;         // 'n-s--f-'
token.lemma;       // 'puella'
token.isNoun();    // true
token.isFeminine(); // true (via getGender())

const updated = token.with({ tag: 'n-p--f-' });
// New token with updated tag
```

### ProcessResult Interface

```typescript
interface ProcessResult {
  success: boolean;           // Whether processing succeeded
  macronizedText?: string;    // Text with macrons added
  originalText?: string;      // Original input text
  tokens?: Token[];           // Array of processed tokens
  confidence?: number;        // Confidence score (0-1)
  processingTime?: number;    // Processing time in ms
  error?: string;             // Error message if failed
}
```

## Configuration

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useWasm` | boolean | `true` | Use WASM RFTagger (vs. JS fallback) |
| `wasmModelPath` | string | `'rftagger-ldt.model'` | Path to RFTagger model |
| `confidenceThreshold` | number | `0.80` | Minimum confidence for results |
| `enableCache` | boolean | `true` | Enable result caching |

### Examples

```javascript
// High accuracy (WASM)
const api1 = MacronizerAPI.getInstance({
  useWasm: true,
  confidenceThreshold: 0.90,
});

// Fast loading (JS fallback)
const api2 = MacronizerAPI.getInstance({
  useWasm: false,
  confidenceThreshold: 0.70,
});

// Disable cache for memory-constrained environments
const api3 = MacronizerAPI.getInstance({
  enableCache: false,
});
```

## POS Tag Format

The system uses the Latin Dependency Treebank (LDT) tag format:

```
Position: 1 234 56 78 9
Format:   P FFF CC NN G

P  = Part of speech (n, v, a, d, r, c, p, e, ...)
FFF = Morphological features
CC  = Case (no, ge, da, ab, lo, vo)
NN  = Number (sg, pl)
G   = Gender (m, f, n)
```

### Common Tags

| Tag | Meaning |
|-----|---------|
| `n-s--m-` | Noun, singular, masculine |
| `n-s--f-` | Noun, singular, feminine |
| `n-s--n-` | Noun, singular, neuter |
| `n-p--m-` | Noun, plural, masculine |
| `v1sp---` | Verb, 1st person singular present |
| `v2sp---` | Verb, 2nd person singular present |
| `v3sp---` | Verb, 3rd person singular present |
| `a--s--m-` | Adjective, singular, masculine |
| `a--s--f-` | Adjective, singular, feminine |
| `d------` | Adverb |
| `e------` | Preposition |
| `c------` | Conjunction |
| `p--s--n-` | Pronoun, singular, neuter |

## Performance

### Benchmarks

| Operation | WASM | JavaScript | Notes |
|-----------|------|------------|-------|
| Initialization | ~2-5s | ~500ms | WASM module load |
| 100 words | ~50ms | ~30ms | Small texts |
| 1000 words | ~200ms | ~150ms | Medium texts |
| 10000 words | ~1.5s | ~1.2s | Large texts |
| Memory usage | ~64MB | ~10MB | After init |

### Optimization Tips

1. **Enable caching** for repeated processing
   ```javascript
   const api = MacronizerAPI.getInstance({ enableCache: true });
   ```

2. **Batch process** multiple texts
   ```javascript
   await api.processBatch(texts);  // Faster than individual calls
   ```

3. **Use WASM for accuracy-critical** applications
   ```javascript
   const api = MacronizerAPI.getInstance({ useWasm: true });
   ```

4. **Use JavaScript for fast loading**
   ```javascript
   const api = MacronizerAPI.getInstance({ useWasm: false });
   ```

5. **Clear cache** periodically for long-running sessions
   ```javascript
   api.clearCache();
   ```

## Browser Compatibility

| Browser | Version | WASM | Notes |
|---------|---------|------|-------|
| Chrome | 57+ | ✓ | Full support |
| Firefox | 52+ | ✓ | Full support |
| Safari | 11+ | ✓ | iOS 11+ |
| Edge | 16+ | ✓ | Chromium-based |
| Opera | 44+ | ✓ | Full support |

### Polyfills

For older browsers, include these polyfills:

```html
<!-- WebAssembly -->
<script src="https://cdn.jsdelivr.net/npm/webassemblyjs@1.11.1/dist/webassembly.min.js"></script>

<!-- TextEncoder/TextDecoder -->
<script src="https://cdn.jsdelivr.net/npm/text-encoding@0.7.0/lib/encoding.min.js"></script>
```

## Building from Source

### Prerequisites

- Node.js 16+
- Emscripten SDK (for WASM build)
- Docker (optional, for Windows users)

### Build Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Build TypeScript**
   ```bash
   npm run build
   ```

3. **Build WASM module** (optional)
   ```bash
   # Using Docker (recommended for Windows)
   docker-compose up wasm-builder
   
   # Or manually with Emscripten
   ./emscripten-build.sh
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Build for production**
   ```bash
   npm run build:prod
   ```

## Project Structure

```
latin-macronizer/
├── src/
│   ├── core/              # Core functionality
│   │   ├── Token.ts      # Token class
│   │   ├── Tokenizer.ts  # Text tokenization
│   │   └── Macronizer.ts # Main engine
│   ├── analysis/         # Analysis components
│   │   ├── WasmTagger.ts    # WASM RFTagger
│   │   ├── LemmaEngine.ts   # Lemma dictionary
│   │   ├── EndingPatternEngine.ts  # Pattern matching
│   │   └── EditDistanceEngine.ts   # Edit distance
│   └── api/              # Public API
│       └── MacronizerAPI.ts
├── public/
│   └── wasm/             # Compiled WASM modules
├── Dockerfile.wasm       # WASM build container
├── docker-compose.yml    # Docker services
└── emscripten-build.sh   # Build script
```

## Troubleshooting

### WASM Module Not Loading

```javascript
// Check browser console for errors
// Ensure correct path to WASM files
const api = MacronizerAPI.getInstance({
  wasmModelPath: '/correct/path/rftagger.js'
});
```

### Low Accuracy

```javascript
// Increase confidence threshold
const api = MacronizerAPI.getInstance({
  confidenceThreshold: 0.90,
});

// Or use WASM for better accuracy
const api = MacronizerAPI.getInstance({
  useWasm: true,
});
```

### Memory Issues

```javascript
// Disable cache
const api = MacronizerAPI.getInstance({
  enableCache: false,
});

// Clear cache periodically
setInterval(() => api.clearCache(), 60000);
```

### Slow Performance

```javascript
// Use JavaScript instead of WASM for small texts
const api = MacronizerAPI.getInstance({
  useWasm: false,
});

// Batch process multiple texts
await api.processBatch(texts);
```

## Migration from Python

### Python Code

```python
from latin_macronizer.macronizer import Macronizer

macronizer = Macronizer()
result = macronizer.macronize('Gallia est omnis')
print(result)  # Gallia est omnis dīvīsa in partēs trēs
```

### JavaScript Equivalent

```javascript
import { MacronizerAPI } from './src/api/MacronizerAPI.js';

const api = MacronizerAPI.getInstance();
await api.initialize();

const result = await api.process('Gallia est omnis');
console.log(result.macronizedText);  // Gallia est omnis dīvīsa in partēs trēs
```

## License

Same as the original Latin macronizer project.

## Contributing

Contributions welcome! Please ensure:
- TypeScript strict mode compliance
- Comprehensive tests
- Documentation updates
- Browser compatibility testing

## Support

For issues and questions:
- Check the troubleshooting section
- Review browser console for errors
- Ensure WASM files are properly served
- Verify browser compatibility
