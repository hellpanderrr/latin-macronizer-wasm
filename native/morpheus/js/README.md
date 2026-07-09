# Morpheus WASM Port

WebAssembly port of the Morpheus morphological analyzer (Perseus Project) for the browser.

## Contents

- `build-morpheus-wasm.sh` — WASM module build script
- `morpheus_wrapper.c` (generated) — C wrapper for exporting functions to JS
- `MorpheusTagger.ts` — TypeScript class for WASM integration
- `test-morpheus-wasm.html` — test page

## Build

### Requirements

- Emscripten SDK (emcc)
- Morpheus source code in `../c/`
- Latin stemlib in `../c/stemlib/Latin/`

### Running the build

```bash
cd native/morpheus/js
chmod +x build-morpheus-wasm.sh
./build-morpheus-wasm.sh
```

Result:
- `../../public/wasm/morpheus.js` — JS loader
- `../../public/wasm/morpheus.wasm` — WASM binary
- `../../public/wasm/morpheus.data` — stemlib data (virtual FS)

## Usage

### In browser (ES6 module)

```typescript
import { MorpheusTagger } from './native/morpheus/js/MorpheusTagger.js';

const tagger = new MorpheusTagger();
await tagger.initialize('/wasm/morpheus.js');

// Analyze a single word
const result = tagger.analyze('puellam');
console.log(result.analyses[0].lemma); // "puella"
console.log(result.analyses[0].formInfo.case); // "accusative"
console.log(result.analyses[0].formInfo.number); // "singular"

// Batch analysis
const batch = tagger.analyzeBatch(['amat', 'bonus', 'puer']);
```

### In HTML

```html
<script src="/wasm/morpheus.js"></script>
<script type="module">
  import { MorpheusTagger } from '/native/morpheus/js/MorpheusTagger.js';
  const tagger = new MorpheusTagger();
  await tagger.initialize();
  const res = tagger.analyze('regina');
  console.log(res);
</script>
```

### Analysis options

```typescript
interface AnalysisOptions {
    format?: 'perseus' | 'database' | 'lemma';
    ignoreAccents?: boolean;
    strictCase?: boolean;      // default: false
    checkPreverb?: boolean;
    verbsOnly?: boolean;
}
```

### Analysis result

```typescript
interface AnalysisResult {
    word: string;
    analyses: MorphAnalysis[];
    success: boolean;
    raw: string;  // raw Perseus format output
}

interface MorphAnalysis {
    lemma: string;
    stem: string;
    ending: string;
    formInfo: {
        partOfSpeech: string;  // 'noun', 'verb', 'adjective', etc.
        case?: string;         // 'nominative', 'genitive', etc.
        number?: string;       // 'singular', 'plural', 'dual'
        gender?: string;       // 'masculine', 'feminine', 'neuter'
        tense?: string;        // 'present', 'aorist', 'perfect', etc.
        mood?: string;         // 'indicative', 'subjunctive', etc.
        voice?: string;        // 'active', 'middle', 'passive'
        person?: string;       // '1st', '2nd', '3rd'
        degree?: string;       // 'positive', 'comparative', 'superlative'
    };
}
```

## Testing

Open `test-morpheus-wasm.html` in a browser after building.

## Architecture

```
JS (MorpheusTagger)
   ↓ ccall/cwrap
C Wrapper (morpheus_wrapper.c)
   ↓ setbuf(stdout, buffer)
Morpheus C Engine (checkstring1, PrntAnalyses)
   ↓ fopen via MorphFopen
Virtual FS (/stemlib) ← preloaded stemlib data
```

## Notes

- The module is not thread-safe (global state in C code). Use within a single thread.
- The `LATIN` flag is set automatically for Latin words.
- Output buffer size: 64KB (sufficient for most forms).
- Lazy initialization: data is loaded on the first analysis.

## Limitations

- Latin only (Greek and Italian disabled in the build)
- Does not support concurrent analysis from multiple threads
- Requires stemlib data download (~3-5 MB)

## License

Morpheus source code: MIT License (Perseus Project)
This port: same license terms.
