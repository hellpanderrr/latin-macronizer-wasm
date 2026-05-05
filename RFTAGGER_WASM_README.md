# RFTagger WebAssembly Build

This directory contains the RFTagger C++ source and build configuration for compiling to WebAssembly.

## Files

- `rftagger/src/` - Original RFTagger C++ source code
- `rftagger/src/embind-wrapper.C` - Emscripten Embind wrapper for JS integration
- `build-wasm.bat` - Windows batch build script
- `build-rftagger-wasm.ps1` - PowerShell build script
- `rftagger-js-wrapper.js` - JavaScript wrapper class
- `latin_macronizer/rftagger-ldt.model` - Latin model file

## Prerequisites

1. **Install Emscripten SDK:**
   ```bash
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   emsdk install latest
   emsdk activate latest
   ```

2. **Activate Emscripten (run this in each new terminal):**
   ```bash
   # Windows CMD
   emsdk_env.bat
   
   # Windows PowerShell
   ./emsdk_env.ps1
   ```

## Building

### Windows (Batch)
```cmd
emsdk_env.bat
build-wasm.bat
```

### Windows (PowerShell)
```powershell
./emsdk_env.ps1
./build-rftagger-wasm.ps1
```

### Manual Build
```bash
cd rftagger/src

emcc POSTagger.C SuffixLexicon.C DataMapping.C io.C Entry.C Lexicon.C embind-wrapper.C \
  -O3 -std=c++11 -Wno-deprecated -I. -DSGI__gnu_cxx \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='RFTaggerModule' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=67108864 \
  -s MAXIMUM_MEMORY=268435456 \
  -s ENVIRONMENT='web,worker' \
  -s FILESYSTEM=1 \
  -s FORCE_FILESYSTEM=1 \
  --bind \
  -o ../../public/wasm/rftagger.js
```

## Output

The build produces:
- `public/wasm/rftagger.js` - JavaScript loader
- `public/wasm/rftagger.wasm` - WebAssembly binary

## Usage

### JavaScript

```javascript
// Initialize WASM module
const module = await RFTaggerModule();

// Create tagger instance
const tagger = new module.RFTagger();

// Load model (must be available in virtual filesystem)
tagger.loadModel('/wasm/rftagger-ldt.model', true, 0.001, false);

// Tag tokens
const tokens = ['Gallia', 'est', 'omnis'];
const vec = new module.StringVector();
tokens.forEach(t => vec.push_back(t));
const tags = tagger.tagTokens(vec);

// Process results
for (let i = 0; i < tags.size(); i++) {
    console.log(tokens[i], '->', tags.get(i));
}

// Clean up
vec.delete();
tagger.delete();
```

### Using the Wrapper Class

```javascript
import { RFTagger } from './rftagger-js-wrapper.js';

const tagger = new RFTagger();
await tagger.load('/wasm/rftagger-ldt.model');

const tags = tagger.tag(['Gallia', 'est', 'omnis']);
// ['n-s--f-', 'v3sp---', 'a--s--f-']

tagger.destroy();
```

## API Reference

### RFTaggerJS Class (C++ side)

- `loadModel(path, normalize, beamThreshold, sentStartHeuristic)` - Load model
- `tagTokens(tokens)` - Tag array of tokens, returns array of tags
- `tagToken(token)` - Tag single token
- `isLoaded()` - Check if model loaded
- `getTagCount()` - Get number of tags in model
- `getTagName(index)` - Get tag name by index

## Model Files

The parameter files (`.par`) are binary files containing:
- Tag symbol table
- Lexicon (word -> tags mapping)
- Guesser (unknown word handling)
- Regression forest (transition probabilities)

Available models in `rftagger/lib/`:
- `german.par` - German POS tagger
- `czech.par` - Czech POS tagger
- `slovak.par` - Slovak POS tagger
- `slovene.par` - Slovene POS tagger
- `hungarian.par` - Hungarian POS tagger
- `russian.par` - Russian POS tagger

## Troubleshooting

### Emscripten not found
- Make sure you ran `emsdk_env.bat` or `./emsdk_env.ps1`
- Check that `emcc` is in your PATH: `where emcc`

### Build fails
- Check that all source files exist in `rftagger/src/`
- Ensure model file exists at `latin_macronizer/rftagger-ldt.model`
- Check build log for specific errors

### Model fails to load
- Model file must be accessible in the browser (copy to `public/wasm/`)
- File must be in binary format (`.par` files)
- Check browser console for filesystem errors

## License

RFTagger is freely available for academic research and education.
Original author: Helmut Schmid
