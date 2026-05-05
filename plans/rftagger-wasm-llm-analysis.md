# Deep Analysis of LLM-Generated RFTagger WASM Troubleshooting Document

## 1. Executive Summary
The LLM-generated `RFTAGGER_WASM_TROUBLESHOOTING.md` provides a partially accurate chronicle of porting RFTagger to WASM, correctly identifying core issues like `size_t` compatibility and missing `restore()` methods. However, it contains critical contradictions, inaccurate claims about memory requirements, and omits key aspects of WASM porting (file systems, browser support, fallback mechanisms). This analysis verifies all claims against project files and official documentation, identifies errors, and provides actionable risk mitigation recommendations.

---

## 2. Evaluation of LLM Analysis

### 2.1 Correct Claims (Verified with Official References)
| LLM Claim | Verification Evidence | Official Reference |
|-----------|------------------------|-------------------|
| `size_t` mismatch causes model misalignment | `rftagger/src/io.h` lines 47-61 add 4-byte `read_size`/`write_size` helpers to fix 32/64-bit `size_t` differences | [Emscripten MEMORY64 Docs](https://emscripten.org/docs/porting/guidelines/porting_code.html#memory64) |
| 32-bit WASM has 4GB memory limit | WASM 1.0 spec defines 32-bit memory addressing, max 65536 pages (64KB/page) = 4GB | [WASM Core Spec 1.0](https://webassembly.github.io/spec/core/syntax/types.html#memories) |
| Missing `restore()` methods cause compilation errors | `SuffixLexicon.h`, `Entry.h`, `WordClass.h`, `Guesser.h` all include `restore()` methods as patched | [Emscripten Embind Docs](https://emscripten.org/docs/porting/emscripten-runtime-environment.html#embind) |
| MEMORY64 requires Chrome/Edge experimental flags | Chrome Status entry confirms MEMORY64 is experimental, requires `--enable-features=WebAssemblyMemory64` | [Chrome Status: WebAssembly Memory64](https://chromestatus.com/feature/5678015755616256) |
| Build system syntax differences between PowerShell/CMD | PowerShell uses `;` or `&&` (v7+), while `cmd /c` requires CMD syntax for command chaining | [PowerShell Operator Docs](https://learn.microsoft.com/en-us/powershell/scripting/learn/ps101/03-using-operators?view=powershell-7.4) |

---

### 2.2 Errors, Inaccuracies, and Contradictions
| Error Type | Description | Evidence |
|------------|-------------|----------|
| **Contradictory size_t claims** | Phase 2 states model was created on 64-bit Linux (size_t=8 bytes), but Phase 3 claims model was written with 4-byte sizes. No resolution provided. | `io.h` patches read 4-byte sizes, which only work if model was written with 4-byte size_t (32-bit), contradicting Phase 2. |
| **Incorrect memory requirement** | Claims 13MB model requires ~4.7GB RAM, but `WASM_BUILD_STATUS.md` reports ~64MB usage. 4.7GB is a result of size_t misalignment bugs, not actual model requirements. | `WASM_BUILD_STATUS.md` line 158: "Memory Usage: ~64MB (after initialization)" |
| **Inaccurate build script status** | Claims `build-wasm.bat` is updated with MEMORY64 and 8GB limit, but actual file uses 2GB max and no MEMORY64 flags. | `build-wasm.bat` line 55: `-s MAXIMUM_MEMORY=2147483648` (2GB), no `-s MEMORY64=1` |
| **Misleading terminology** | Uses "WASM64" and "MEMORY64" interchangeably. "WASM64" is not an official term; Emscripten uses "MEMORY64" for 64-bit memory mode. | [Emscripten MEMORY64 Docs](https://emscripten.org/docs/porting/guidelines/porting_code.html#memory64) |
| **Incorrect 2GB max claim** | States "32-bit WASM with 2GB max" failed, but Emscripten allows `MAXIMUM_MEMORY` up to 4GB for 32-bit WASM. 2GB is a default, not hard limit. | [Emscripten Memory Docs](https://emscripten.org/docs/porting/guidelines/porting_code.html#memory) |
| **Unrealistic decompression claim** | Claims 13MB model "decompresses" to 4.7GB. RFTagger model is a binary serialization, not a compressed archive; 350x size increase is impossible for correct serialization. | `WASM_BUILD_STATUS.md` reports 64MB usage, consistent with 13MB serialized model. |
| **Missing tooling context** | Mentions Emscripten but not required tools like Binaryen (WASM optimization), `file_packager.py` (asset preloading), or that `wasm-pack` is for Rust, not C++ ports. | Project build scripts do not reference `wasm-pack` for this C++ port. |
| **Incomplete reference links** | Links Emscripten MEMORY64 to generic `emcc` docs instead of the dedicated MEMORY64 guide. | Correct link: [Emscripten MEMORY64 Guide](https://emscripten.org/docs/porting/guidelines/porting_code.html#memory64) |

---

### 2.3 Missing Critical Aspects
| Missing Aspect | Impact | Evidence |
|----------------|--------|----------|
| **WASM Virtual File System** | `fopen`/`fread` calls in RFTagger require Emscripten's MEMFS/IDBFS to access the model file; LLM does not explain this. | `build-wasm.bat` includes `-s FILESYSTEM=1 -s FORCE_FILESYSTEM=1` but LLM does not document it. |
| **Asset Preloading** | No mention of `--preload-file` to include `rftagger-ldt.model` in the WASM build, or runtime loading via `fetch` + `FS.writeFile`. | `build-wasm.bat` copies model to `public/wasm/` but does not preload it. |
| **MEMORY64 Browser Support** | Does not mention Firefox/Safari have no stable MEMORY64 support, making the port non-viable for most users. | [Can I Use: WebAssembly](https://caniuse.com/webassembly) (no MEMORY64 support for Firefox/Safari) |
| **WASM Memory Growth Overhead** | Does not discuss `ALLOW_MEMORY_GROWTH=1` overhead or browser tab memory limits for large allocations. | [Emscripten Memory Growth Docs](https://emscripten.org/docs/porting/guidelines/porting_code.html#memory-growth) |
| **Fallback Mechanism** | No discussion of falling back to JS-based tagger (from `rftagger-port-plan.md`) if WASM fails. | `WASM_BUILD_STATUS.md` mentions "Fallback support" in `WasmTagger.ts`. |
| **Testing Strategy** | Only mentions "verify tag count" with no details on comparing output with native `rft-annotate` or using `test_rftagger.py`. | `test_rftagger.py` exists in project but is not referenced. |
| **WASM Performance Context** | Mentions `beamThreshold` optimization but no WASM-specific performance: 1.5-2x slower than native, MEMORY64 overhead, large allocation pauses. | [WASM Performance Docs](https://webassembly.org/docs/performance/) |

---

## 3. Risk Mitigation Recommendations
| Risk | Source | Recommendation |
|------|--------|-----------------|
| Model loading fails due to size_t mismatch | Contradictory size_t claims | 1. Check native RFTagger binary to confirm model size_t size. 2. Update `io.h` patches to read 8-byte sizes if model is 64-bit. 3. Add model header with size_t size to avoid future mismatches. |
| Overestimated memory requirements | Incorrect memory claim | 1. Correct doc to state ~64MB actual usage. 2. Test memory with correct patches. 3. Avoid MEMORY64 unless >4GB is required. |
| Build script mismatch | Inaccurate build script status | 1. Update `build-wasm.bat` with MEMORY64 flags if claimed. 2. Align doc with actual script state if not. 3. Add comments to build script. |
| WASM cannot access model file | Missing file system discussion | 1. Add `--preload-file latin_macronizer/rftagger-ldt.model@/rftagger-ldt.model` to Emscripten flags. 2. Document virtual file system setup. 3. Implement runtime model loading in JS wrapper. |
| Non-viable browser support | Missing browser support nuance | 1. Implement JS tagger fallback. 2. Detect MEMORY64 support before loading WASM. 3. Only use MEMORY64 in supported browsers. |
| Poor WASM performance | Missing performance context | 1. Benchmark WASM vs native/JS. 2. Use Web Workers for background tagging. 3. Avoid MEMORY64 if possible. |
| No testing strategy | Missing testing strategy | 1. Extend `test_rftagger.py` to compare with native output. 2. Add automated build tests. 3. Document test cases. |

---

## 4. Conclusion
The LLM analysis provides a useful starting point for troubleshooting the RFTagger WASM port but requires significant corrections to address contradictions, inaccurate memory claims, and missing critical aspects. The patched source files correctly add `restore()` methods and `size_t` helpers, but the build script and documentation must be aligned. Implementing the risk mitigation recommendations will make the port viable, including adding a JS fallback for browsers without MEMORY64 support.
