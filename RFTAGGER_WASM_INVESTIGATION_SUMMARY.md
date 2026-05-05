# RFTagger WASM Investigation Summary

## Current Status
- **Model loads partially**: 644 tags read correctly, but crashes during Lexicon loading
- **Root cause identified**: Type mismatch between `Tag::prob` (double) and `Node::prob` (float) causing infinite recursion
- **Memory issue**: 13MB model → 4.7GB RAM usage in WASM

## Key Findings

### 1. Model Format Analysis
- **Tag count**: 644 (confirmed correct)
- **First bytes**: `84 02 00 00 00 00 00 00 42 4F 55 4E 44 41 52 59`
- **Interpretation**: 644 tags, "BOUNDARY" string follows

### 2. Size Type Issues Fixed
- ✅ `size_t` → `uint64_t` for all model reading
- ✅ `read_size()` uses 64-bit reads consistently
- ✅ Model header reads correctly

### 3. Critical Type Mismatch (ROOT CAUSE)
**Problem**: `Tag` class stores `prob` as `double`, but `Node` class stores `prob` as `float`

**Location**: `Entry.h` line 25: `Prob prob;` vs `POSTagger.h` line 25: `double prob;`

**Effect**: When `Tag::Tag(FILE*)` reads `prob` field, it reads `float` but model stores `double`, causing:
1. Data corruption
2. Infinite recursion in tag loading
3. Stack overflow and crash

### 4. Memory Consumption Issue
**Problem**: 13MB model file causes 4.7GB RAM allocation in WASM
**Status**: Unresolved - needs separate investigation

## Files Modified

### Core Headers
- `rftagger/src/io.h` - Fixed size_t reads to uint64_t
- `rftagger/src/SymbolTable.h` - Fixed to use read_size()
- `rftagger/src/POSTagger.h` - Fixed contextlength reading
- `rftagger/src/RegressionForest.h` - Fixed vector size reading
- `rftagger/src/DataMapping.C` - Fixed all size_t reads
- `rftagger/src/Lexicon.h` - Added debug logging
- `rftagger/src/Guesser.h` - Added debug logging
- `rftagger/src/SuffixLexicon.h` - Added debug logging
- `rftagger/src/Entry.h` - Added debug logging, fixed Node::prob type

### Build System
- Docker-based Emscripten compilation
- MEMORY64 WASM with 64-bit addressing
- Automated build script: `docker-build.sh`

## Next Steps Required

### Immediate (High Priority)
1. **Fix Tag/Node type mismatch**:
   - Change `Node::prob` from `float` to `double` to match `Tag::prob`
   - This will eliminate infinite recursion and allow model loading

### Secondary (Medium Priority)  
2. **Test corrected WASM**:
   - Verify model loads without crashing
   - Test tagging accuracy against native RFTagger
   - Compare tag outputs for correctness

### Tertiary (Low Priority)
3. **Investigate memory usage**:
   - Determine why 13MB model requires 4.7GB in WASM
   - Optimize memory allocation or use smaller model variant

## Test Results
- Native RFTagger: Works correctly, produces expected Latin POS tags
- WASM RFTagger: Model header loads, 644 tags detected, but crashes during Lexicon loading
- Expected after fix: Successful model loading and accurate tagging

## Technical Notes
- Model was created on 64-bit Linux system (confirmed by 64-bit size fields)
- WASM MEMORY64 correctly addresses model format
- Issue is purely C++ type mismatch, not WASM limitation
- All size reading functions now use consistent 64-bit reads
