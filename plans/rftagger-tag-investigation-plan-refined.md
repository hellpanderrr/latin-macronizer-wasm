# Refined RFTagger WASM Tag Accuracy Investigation Plan

## Evaluation of Original Plan (rftagger-tag-investigation-plan-350d48.md)
### Strengths
1. Systematic phase structure: Model Forensics → Size_t Root Cause → Memory Verification → Tag Pipeline Audit → Testing
2. Clear objectives and well-defined deliverables/success criteria
3. Specific tasks for hex dump, size_t detection, and tag count verification

### Weaknesses/Gaps Addressed in Refinement
1. No WASM environment setup verification (file system, build script alignment)
2. Missing MEMORY64 browser support and fallback strategy
3. 4.7GB memory claim treated as actual usage, not a symptom of size_t misalignment
4. No verification of `build-wasm.bat` flags against claimed MEMORY64 status
5. Missing WASM-specific tooling (MEMFS, `file_packager.py`, `ALLOW_MEMORY_GROWTH` overhead)
6. No comparison of WASM output with native `rft-annotate` binary

---

## Phase 0: WASM Environment Setup Verification (NEW)
**Objective**: Validate WASM build environment, file system, and build script alignment

### Tasks:
1. **Build script verification**
   - Check `build-wasm.bat` for MEMORY64 flags and memory limits
   - Align documented state (LLM claim: 8GB MEMORY64) with actual script (2GB no MEMORY64)
   - Add missing `-s MEMORY64=1` if required, or correct documentation

2. **WASM file system setup**
   - Verify Emscripten virtual file system flags (`-s FILESYSTEM=1 -s FORCE_FILESYSTEM=1`) in build
   - Add `--preload-file latin_macronizer/rftagger-ldt.model@/rftagger-ldt.model` to embed model in WASM
   - Document `FS.writeFile` runtime loading alternative in `embind-wrapper.C` or JS wrapper

3. **Native binary validation**
   - Confirm `rftagger/bin/rft-annotate` is 64-bit Linux binary (validate with `hexdump -C rftagger/bin/rft-annotate | head -n 1` for ELF header)
   - Run native `rft-annotate -s -q rftagger-ldt.model test-input.txt` to get expected tag output

---

## Phase 1: Model Format Forensics (Refined)
**Objective**: Determine actual binary format of `rftagger-ldt.model` and resolve size_t contradiction

### Tasks:
1. **Binary header analysis**
   - Read first 128 bytes of model file in hex: `hexdump -C latin_macronizer/rftagger-ldt.model | head -n 8`
   - Identify magic numbers/version headers
   - Document structure offsets for size_t fields

2. **size_t detection (CRITICAL)**
   - **Resolve LLM contradiction**: Phase2 claims model is 64-bit (size_t=8), Phase3 claims model uses 4-byte sizes
   - Compare with Slovene model (`rftagger/lib/slovene.par`) format
   - Run `rft-print` (native binary) on model to dump expected structure and size_t widths
   - **Align `io.h` patches**: If model uses 8-byte size_t, update `read_size`/`write_size` to use `uint64_t` instead of `uint32_t`

3. **Tag count verification**
   - Native binary shows ~60 tags
   - WASM shows 644 tags (10x error)
   - Trace which `read_size` call causes tag count inflation (add debug logging to `io.h`)

---

## Phase 2: Size_t Alignment Root Cause (Refined)
**Objective**: Fix size_t mismatch between model and WASM, correct memory usage claims

### Investigation Questions:
1. **Model origin**: Confirm if latin-macronizer model was built on 32-bit or 64-bit Linux
2. **Field-by-field analysis**: Which specific `size_t` read causes tag count inflation?
3. **Memory explosion**: Why does 13MB model → 4.7GB RAM?
   - **Corrected hypothesis**: 4.7GB is a symptom of size_t misalignment, not actual model requirement
   - `WASM_BUILD_STATUS.md` reports ~64MB usage when model is loaded correctly

### Updated Hypothesis:
- If model uses 8-byte size_t → Current `io.h` reads 4-byte → misalignment cascade, wrong allocations
- If model uses 4-byte size_t → Current patches are correct, WASM64 (size_t=8) causes misalignment
- **Action**: Match `io.h` `read_size`/`write_size` to model's actual size_t width

---

## Phase 3: Memory Usage Verification (Refined)
**Objective**: Reconcile WASM_BUILD_STATUS.md ~64MB claim vs 4.7GB bug symptom

### Investigation:
1. Check if `WASM_BUILD_STATUS.md` refers to different implementation (rftagger.cpp JS port vs C++ WASM port)
2. Verify if 4.7GB is temporary spike from wrong allocations, or sustained usage
3. **Test corrected memory**: After fixing size_t patches, measure actual memory usage with correct model loading
4. Determine if MEMORY64 is even required: 64MB << 4GB 32-bit WASM limit, so MEMORY64 may be unnecessary

---

## Phase 4: Tag Generation Pipeline Audit (Original + Refinements)
**Objective**: Trace tag extraction from model → WASM output

### Components to Check:
1. **SymbolTable** - Tag name storage and lookup (`rftagger/src/SymbolTable.h`)
2. **Entry/Tag classes** - Tag assignment in lexicon (`rftagger/src/Entry.h`)
3. **annotate() function** - `rftagger/src/POSTagger.C` tagging algorithm
4. **embind-wrapper** - Tag extraction from results (`rftagger/src/embind-wrapper.C`)

### Key Files:
- `rftagger/src/SymbolTable.h` - Patched with 32-bit reads (verify if correct)
- `rftagger/src/Entry.h` - `restore()` methods added (verified correct)
- `rftagger/src/POSTagger.C` - Tagging algorithm validation
- `rftagger/src/embind-wrapper.C` - Added logging (per LLM doc)

---

## Phase 5: Test Methodology (Refined)
### Immediate Tests:
1. **Hex dump model header** to verify size_t width
2. **Native rft-annotate test** on sample input (`test-input.txt`)
3. **WASM tag count check** after each model section load (add debug logs to `read_datavec`)
4. **Single word tagging** to isolate pipeline stage
5. **Cross-compare output**: Run same input through native binary and WASM, diff results

### Expected Results:
- Model should use consistent size_t (likely 8-byte for 64-bit Linux build)
- WASM patches must match model's size_t width (not hardcoded to 4-byte)
- Tag count should be ~60, not 644
- Memory usage should be <100MB, not 4.7GB
- WASM output must match native `rft-annotate` output exactly

---

## Phase 6: Fallback Strategy (NEW)
**Objective**: Ensure port viability if MEMORY64 fails or is unsupported

### Tasks:
1. **Browser support detection**
   - Detect MEMORY64 support in JS wrapper: `try { new WebAssembly.Memory({maximumPages: 65536 * 2}) } catch(e) { /* fallback */ }`
   - Note: Firefox/Safari have no stable MEMORY64 support, only Chrome/Edge with flags

2. **JS tagger fallback**
   - Implement fallback to `rftagger-port-plan.md` JS-based tagger if WASM fails
   - Use `WasmTagger.ts` fallback support mentioned in `WASM_BUILD_STATUS.md`

3. **Performance benchmarking**
   - Compare WASM vs native vs JS tagger speed
   - Document WASM 1.5-2x slowdown vs native, MEMORY64 overhead

---

## Deliverables
1. **Hex dump analysis** of model file header with size_t width confirmation
2. **Size_t width determination** (4 vs 8 bytes) with evidence from native binary
3. **Root cause report** for tag inflation (aligned with model's actual size_t)
4. **Corrected io.h patches** with evidence-based rationale (not hardcoded 4-byte)
5. **Memory usage reconciliation** explanation (4.7GB = bug, 64MB = actual)
6. **WASM environment setup guide** (file system, build script alignment)
7. **Fallback strategy documentation** for unsupported browsers

---

## Success Criteria
- Tag count matches native binary (~60)
- Tags match expected format (e.g., `n.-.s.-.-.f.n.-`)
- Memory usage <100MB (not 4.7GB)
- WASM output matches native RFTagger output exactly
- Build script aligns with documented MEMORY64 state (or doc corrected)
- Fallback to JS tagger works in browsers without MEMORY64 support

---

## Mermaid Workflow Diagram
```mermaid
flowchart TD
    A[Phase 0: WASM Environment Setup] --> B[Phase 1: Model Format Forensics]
    B --> C{size_t width?}
    C -->|8-byte| D[Update io.h to read 8-byte]
    C -->|4-byte| E[Keep current 4-byte patches]
    D --> F[Phase 2: Size_t Alignment Fix]
    E --> F
    F --> G[Phase 3: Memory Verification]
    G --> H[Phase 4: Tag Pipeline Audit]
    H --> I[Phase 5: Testing]
    I --> J{Output matches native?}
    J -->|Yes| K[Phase 6: Fallback Strategy]
    J -->|No| H
    K --> L[Success: WASM RFTagger Working]
    L --> M[Fallback JS Tagger for Unsupported Browsers]