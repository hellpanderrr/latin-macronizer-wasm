# RFTagger WASM Troubleshooting Chronicle

## Date: May 1-2, 2026

---

## The Core Problem

Building RFTagger C++ to WASM with accurate tag results matching the native binary.

---

## Phase 1: Initial Build & Memory Issues

### Problem: Insufficient Memory for Large Model
- Latin model (`rftagger-ldt.model`) is ~13MB but requires >4GB RAM when loaded
- 32-bit WASM has 4GB memory limit
- Browser crashes with "Cannot enlarge memory" errors

### Attempted Solutions:
1. **32-bit WASM with 2GB max** - FAILED (memory exhausted during model load)
2. **MEMORY64 with 4GB+** - FAILED (model loads but tag count wrong)

---

## Phase 2: The size_t Compatibility Crisis

### Root Cause Identified
The model file was created on Linux (64-bit) where `size_t = 8 bytes`.
WASM environments have different `size_t` sizes:
- 32-bit WASM: `size_t = 4 bytes`
- WASM64: `size_t = 8 bytes`

This causes misalignment when reading model structures.

### Symptom: Wrong Tag Count
```
Expected: ~60 tags
Got: 644 tags (completely wrong)
```

### Files Patched for 32-bit Compatibility:

#### 1. `io.h` - Added read_size/write_size helpers
```cpp
// 32-bit size type for model compatibility
inline void read_size( size_t &a, FILE *file ) {
  uint32_t temp;
  fread( &temp, sizeof(uint32_t), 1, file );
  if (ferror(file))
    errx(1, "Error encountered while reading size");
  a = temp;
}

inline void write_size( size_t a, FILE *file ) {
  uint32_t temp = (uint32_t)a;
  fwrite( &temp, sizeof(uint32_t), 1, file );
  if (ferror(file))
    errx(1, "Error encountered while writing size");
}
```

Updated `read_datavec` and `read_basedatavec` to use `read_size` instead of `read_data`.

#### 2. `SymbolTable.h` - Patched constructor
```cpp
SymbolTable( FILE *file ) {
  uint32_t n;  // Changed from size_t
  fread( &n, sizeof(uint32_t), 1, file );  // Explicit 32-bit read
  char buffer[10000];
  for( uint32_t i=0; i<n; i++ ) {  // 32-bit loop counter
    for( char *p=buffer; (*p = (char)fgetc(file)); p++ ) ;
    number(buffer);
  }
}
```

---

## Phase 3: The MEMORY64 Dilemma

### Problem: Two Competing Requirements
1. **Without MEMORY64**: Memory capped at 4GB, model needs ~4.7GB → CRASH
2. **With MEMORY64**: `size_t` = 8 bytes, model written with 4-byte sizes → WRONG DATA

### Memory Requirements:
```
Latin model file: 12,949,296 bytes (~13MB)
Runtime memory needed: ~4.7 GB (due to internal data structures)
```

### Error Messages:
```
Cannot enlarge memory, requested 4294971392 bytes, but the limit is 4294967296 bytes!
bad_alloc was thrown in -fno-exceptions mode
Aborted(native code called abort())
```

---

## Phase 4: Missing restore() Methods

### Problem: Compilation Errors with `read_datavec`
Template `read_datavec` calls `v[i].restore(file)` but many classes lacked this method.

### Classes Fixed:
1. `SuffixLexicon.h` - Added `restore()`
2. `Entry.h` - Added `restore()` for `Tag` and `Entry`
3. `WordClass.h` - Added `restore()` for `Transition` and `State`
4. `Guesser.h` - Added `restore()`
5. `SLink` - Added default constructor + `restore()`

---

## Phase 5: Build System Challenges

### PowerShell vs CMD Syntax Issues
```powershell
# This fails in PowerShell:
cmd /c "cd F:\... && F:\emsdk\emsdk_env.bat && build-wasm.bat"
# Error: && is not a valid statement separator
```

### Solution: Direct emcc invocation
```batch
F:\projects\emsdk\upstream\emscripten\emcc.bat [sources] [flags] -o output.js
```

---

## Current State (May 2, 2026, 01:40)

### Code Status:
- ✅ `io.h` - Patched with 32-bit size helpers
- ✅ `SymbolTable.h` - Patched with 32-bit reads
- ✅ All missing `restore()` methods added
- ✅ `build-wasm.bat` - Updated with MEMORY64 and 8GB limit

### Pending:
- ⏳ Final successful WASM compilation
- ⏳ Browser testing with MEMORY64 support
- ⏳ Verification of correct tag count (~60)
- ⏳ Tag accuracy comparison with native RFTagger

---

## Key Insights

1. **Model Loading**: The Latin model decompresses to ~4.7GB in memory due to:
   - Large tag forest data structures
   - Suffix lexicon entries
   - Transition tables

2. **32-bit vs 64-bit WASM**:
   - 32-bit: Limited to 4GB, can't load Latin model
   - 64-bit: Can load model but requires size compatibility patches

3. **Browser Requirements**:
   - MEMORY64 requires Chrome/Edge with experimental flag
   - 8GB+ system RAM recommended

---

## Files Modified

1. `rftagger/src/io.h` - 32-bit size helpers
2. `rftagger/src/SymbolTable.h` - 32-bit constructor
3. `rftagger/src/SuffixLexicon.h` - Added restore(), default constructor
4. `rftagger/src/Entry.h` - Added restore() for Tag and Entry
5. `rftagger/src/WordClass.h` - Added restore() for Transition and State
6. `rftagger/src/Guesser.h` - Added restore()
7. `rftagger/src/embind-wrapper.C` - Added logging, file-based Sentence
8. `build-wasm.bat` - MEMORY64 flags, 8GB memory limit
9. `test-real-latin.html` - Added model verification, error handling

---

## Next Steps

1. Complete WASM compilation with MEMORY64 + 8GB
2. Test in Chrome with `--enable-memory64` flag
3. Verify tag count is ~60 (not 644)
4. Compare tagging accuracy with native RFTagger binary
5. Optimize beamThreshold for performance vs accuracy trade-off

---

## References

- Emscripten MEMORY64: https://emscripten.org/docs/tools_reference/emcc.html
- RFTagger source: https://www.cis.uni-muenchen.de/~schmid/tools/RFTagger/
- Latin model: From latin-macronizer project
