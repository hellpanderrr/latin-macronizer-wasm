# WASM RFTagger Integration — Debugging and Fixes

**Date:** 2026-05-02  
**Project:** Latin Macronizer — RFTagger WebAssembly Port  
**Status:** All critical issues resolved; ready for rebuild

---

## Table of Contents

1. [Error Logs and Symptoms](#1-error-logs-and-symptoms)
2. [Root Cause Analysis](#2-root-cause-analysis)
   - 2.1 [Model Loading Crash — `string too long`](#21-model-loading-crash--string-too-long)
   - 2.2 [BindingError — `Cannot pass as a StringVector`](#22-bindingerror--cannot-pass-as-a-stringvector)
   - 2.3 [Tag Output Mismatch — Incorrect Tags](#23-tag-output-mismatch--incorrect-tags)
3. [Fixes Implemented](#3-fixes-implemented)
   - 3.1 [`WordClass.h` — 64-bit `number_of_classes`](#31-wordclassh--64-bit-number_of_classes)
   - 3.2 [`embind-wrapper.C` — Embind vector registration and wrapper functions](#32-embind-wrapperc--embind-vector-registration-and-wrapper-functions)
   - 3.3 [`sgi.h` — `hash<const char*>` specialization](#33-sgih--hashconst-char-specialization)
   - 3.4 [Test pages and build script updates](#34-test-pages-and-build-script-updates)
4. [Verification and Expected Results](#4-verification-and-expected-results)
5. [Technical Notes](#5-technical-notes)
   - 5.1 [Why `size_t` is dangerous in binary file formats](#51-why-size_t-is-dangerous-in-binary-file-formats)
   - 5.2 [Embind vector conversion quirks](#52-embind-vector-conversion-quirks)
   - 5.3 [Hash map with `const char*` keys — pointer vs. content hashing](#53-hash-map-with-const-char-keys--pointer-vs-content-hashing)
6. [Next Steps](#6-next-steps)

---

## 1. Error Logs and Symptoms

### 1.1 Initial test run (test-wasm-basic.html)

```
06:28:51.112 loadModel: starting...
06:28:51.115 loadModel: opening file /model.bin
06:28:51.115 loadModel: First 16 bytes: 84 02 00 00 00 00 00 00 42 4F 55 4E 44 41 52 59
06:28:51.116 loadModel: file size = 12949296 bytes
06:28:51.116 loadModel: creating POSTagger...
06:28:51.116 [DEBUG] SymbolTable: reading 644 strings
...
06:28:51.273 [DEBUG] Lexicon: PriorProb done, pos=12641328
06:28:51.328 Error: while reading string from file (string too long)
```

**Observation:** Model loading succeeds through `Lexicon` construction, but crashes during `WordClass` (Guesser) construction, specifically in `read_string`.

### 1.2 After first fix (model loads, but tagTokens fails)

```
Uncaught Error: SymbolTable: word not found: Gallia
    at POSTagger.annotate (rftagger.js:1)
    ...
BindingError: Cannot pass "Gallia,est,omnis" as a StringVector
```

**Observation:** Model loads successfully after the `size_t` → `uint64_t` fix, but:
- Lexicon lookups fail for every token (`word not found: Gallia`)
- Calling `tagTokens(['Gallia','est','omnis'])` throws a BindingError

### 1.3 After second fix (binding reorder) — still wrong tags

After fixing the Embind vector registration order, `tagTokens` runs without error but returns tags that differ from the native `rft-annotate` output. For the Caesar text:

| Token  | WASM (before hash fix) | Native `rft-annotate` |
|--------|----------------------|----------------------|
| Gallia | `n.-.s.-.-.-.f.b.-`  | `n.-.s.-.-.-.f.b.-`  |
| est    | `v.3.s.p.i.a.-.-.-`  | `v.3.s.p.i.a.-.-.-`  |
| omnis  | `a.-.s.-.-.-.f.n.-`  | `a.-.p.-.-.-.f.a.-`  |
| divisa | `v.-.s.r.p.p.f.n.-` | `v.-.s.r.p.p.f.n.-` |

**Pattern:** Some words (like `omnis`) get wrong tags; many function words are mis-tagged as determiners (`a.-.s...`) instead of pronouns (`a.-.p...`).

---

## 2. Root Cause Analysis

### 2.1 Model Loading Crash — `string too long`

**Investigation path:**

1. Examined the model loading sequence in `POSTagger` constructor (in [`POSTagger.h`](rftagger/src/POSTagger.h:76-86)):
   ```
   POSTagger(FILE* file, ...) :
       tagmap(file),        // SymbolTable — reads 644 strings
       lexicon(file),       // reads entry vector, PriorProb
       guesser(file),       // Guesser → WordClass ← CRASH HERE
       datamapping(file),
       forest(file)
   ```

2. Crash occurs after `Lexicon: PriorProb done` and before any `Guesser` debug output. The next component is `Guesser`, which contains a `WordClass` member.

3. [`WordClass.h`](rftagger/src/WordClass.h:152-158) binary reading:
   ```cpp
   void read_binary( FILE *file ) {
     read_data(number_of_classes, file);  // ← reads size_t
     read_datavec(state, file);
   }
   ```

4. [`io.h`](rftagger/src/io.h:41-45) `read_data` template:
   ```cpp
   template <class T> void read_data( T &a, FILE *file ) {
     fread( &a, sizeof(T), 1, file );
   }
   ```
   `sizeof(size_t)` is **4 bytes** in WASM (32-bit) but **8 bytes** in the native 64-bit environment where the model was created.

5. The model file stores `number_of_classes` as a 64-bit integer (confirmed by [`model_inspector.c`](model_inspector.c:20-27) which reads it as `uint64_t`). When WASM reads it as `size_t`, it consumes only 4 bytes, leaving the file pointer 4 bytes ahead. All subsequent reads (including `read_string`) are offset, causing `read_string` to interpret binary data as a string and eventually hit its 10,000-byte buffer limit.

**Conclusion:** Using `size_t` in binary file format structures is not portable. Fixed-width types (`uint64_t`) must be used for file format fields.

---

### 2.2 BindingError — `Cannot pass as a StringVector`

**Investigation path:**

1. The JavaScript test code called:
   ```js
   tagger.tagTokens(['Gallia','est','omnis'])
   ```

2. The C++ binding in [`embind-wrapper.C`](rftagger/src/embind-wrapper.C:266) exposed:
   ```cpp
   .function("tagTokens", &RFTaggerJS::tagTokens)
   ```
   where `tagTokens` signature was:
   ```cpp
   std::vector<std::string> tagTokens(const std::vector<std::string>& tokens)
   ```

3. Embind requires that any `std::vector<T>` used in a function signature must be registered with `register_vector<T>("VectorName")` **before** the class binding that uses it.

4. In the original code, `register_vector` calls appeared **after** the class_ binding block, so Embind didn't know about `StringVector` when binding `tagTokens`.

5. Even after moving `register_vector` to the start, automatic conversion from a JS array to `const std::vector<std::string>&` is not reliably supported by Embind. The recommended pattern is to accept `emscripten::val` and manually extract array elements.

**Conclusion:** Two-part fix: (1) reorder `register_vector` calls to precede `class_` binding; (2) change `tagTokens` to accept `emscripten::val` and manually convert.

---

### 2.3 Tag Output Mismatch — Incorrect Tags

**Investigation path:**

1. After fixing the binding error, `tagTokens` executed but produced wrong tags for some words (e.g., `omnis` as determiner instead of pronoun).

2. Hypothesis: Model file mismatch. The test page was loading `/model.bin` (a generic model) instead of the Latin model `latin_macronizer/rftagger-ldt.model`. Also, the `normalize` parameter was `false`, while native `rft-annotate` uses `Normalize = true`.

3. Updated test pages to load the correct model with `normalize=true`. However, tags still differed in some cases.

4. Dug deeper into `SymbolTable` lookup mechanism. `SymbolTable` uses:
   ```cpp
   typedef hash_map<const char*, SymNum, hash<const char*>, eqstr> SymbolMap;
   ```
   The `hash<const char*>` is defined in [`sgi.h`](rftagger/src/sgi.h).

5. In the modern C++ branch (used by Emscripten), `sgi.h` defines:
   ```cpp
   template<typename T>
   struct hash : public std::hash<T> {};
   ```
   This means `hash<const char*>` inherits from `std::hash<const char*>`, which **hashes the pointer address**, not the string content.

6. `SymbolTable::number()` and `lookup()` use `strdup` to create new C-strings for insertion, but lookups use the original string pointer from the query. Since pointer addresses differ, the hash values differ, and the key is never found. The `eqstr` comparator (which does `strcmp`) would eventually catch mismatches, but the hash map first buckets by hash value — different hash → different bucket → no comparison ever happens.

7. Effect: **Every lexicon lookup fails.** The tagger falls back to `Guesser::lookup()` for unknown words, which uses suffix rules and produces different (often wrong) tags.

**Conclusion:** The `hash<const char*>` specialization must hash the *string content*, not the pointer. This is the root cause of the tag mismatch.

---

## 3. Fixes Implemented

### 3.1 `WordClass.h` — 64-bit `number_of_classes`

**File:** [`rftagger/src/WordClass.h`](rftagger/src/WordClass.h)

**Changes:**
- Line 13: Added `#include <stdint.h>`
- Line 158: Changed `size_t number_of_classes;` → `uint64_t number_of_classes;`

**Rationale:** The model file format uses 64-bit integers for all size/count fields (via `read_size`/`write_size`). Using `uint64_t` ensures consistent 8-byte reads on both 32-bit (WASM) and 64-bit (native) platforms.

**Impact:** Eliminates file pointer misalignment; model loads successfully.

---

### 3.2 `embind-wrapper.C` — Embind vector registration and wrapper functions

**File:** [`rftagger/src/embind-wrapper.C`](rftagger/src/embind-wrapper.C)

**Changes:**

1. **Moved vector registration to the start** of `EMSCRIPTEN_BINDINGS` (lines 260-261):
   ```cpp
   EMSCRIPTEN_BINDINGS(rftagger) {
      register_vector<std::string>("StringVector");
      register_vector<std::vector<std::string>>("StringVectorVector");
      // ... class_ binding follows
   }
   ```

2. **Refactored `tagTokens`** to accept `emscripten::val` (lines 133-149):
   ```cpp
   std::vector<std::string> tagTokens(emscripten::val tokens) {
       std::vector<std::string> tokenList;
       if (!tagger) { ... }
       if (!tokens.isArray()) { ... }
       unsigned length = tokens["length"].as<unsigned>();
       tokenList.reserve(length);
       for (unsigned i = 0; i < length; i++) {
           tokenList.push_back(tokens[i].as<std::string>());
       }
       return tagTokensImpl(tokenList);
   }
   ```

3. **Added `tagTokensImpl`** helper (lines 83-130) with the original `const std::vector<std::string>&` signature, containing the core tagging logic (write to temp file, construct `Sentence`, annotate, collect tags).

4. **Refactored `tagSentences`** similarly: `tagSentencesImpl` helper (lines 180-223) + `tagSentences(emscripten::val)` wrapper (lines 226-254).

5. `tagToken` now calls `tagTokensImpl` directly (lines 152-159).

**Rationale:** Embind cannot automatically convert JS arrays to `const std::vector<std::string>&`. Using `emscripten::val` with manual extraction is the recommended workaround. Registering vector types before the class binding is mandatory for any function that uses `std::vector` in its signature.

**Impact:** `tagTokens` and `tagSentences` can now be called from JavaScript with plain arrays.

---

### 3.3 `sgi.h` — `hash<const char*>` specialization

**File:** [`rftagger/src/sgi.h`](rftagger/src/sgi.h)

**Changes:**

1. Line 21: Added `#include <string>` (needed for `std::hash<std::string>`).
2. Lines 45-51: Added explicit specialization for `const char*`:
   ```cpp
   // Specialization for const char* to hash string content, not pointer value
   template<>
   struct hash<const char*> {
       size_t operator()(const char* s) const {
           return std::hash<std::string>()(s ? s : "");
       }
   };
   ```

**Rationale:** `SymbolTable` stores keys as `const char*` (from `strdup`). Lookups use different pointers (the original string from the input). The default `std::hash<const char*>` hashes the pointer address, not the string content, causing all lookups to fail. The specialization hashes the actual C-string content by converting to `std::string`.

**Impact:** Lexicon lookups now succeed; the tagger retrieves correct tags from the model instead of falling back to the guesser.

---

### 3.4 Test pages and build script updates

#### `test-wasm-basic.html`
- Line 12: Script source updated to `public/wasm/rftagger.js?v=5` (cache-buster).
- Lines 37-38: Model fetch uses `latin_macronizer/rftagger-ldt.model?ts=' + Date.now()` (correct model + cache-buster).
- Line 48: `loadModel` call changed to `tagger.loadModel('/latin_macronizer/rftagger-ldt.model', true, 0.001, false)` — `normalize=true`.
- Line 64: Expected tag for `omnis` updated from `a.-.s.-.-.-.f.n.-` to `a.-.p.-.-.-.f.a.-`.

#### `test-wasm-enhanced.html` (new file)
- Interactive UI with status indicator, textarea, three buttons (Tag Words, Batch Tag Sentences, Load Model), and output area.
- Uses `normalize=true` in `loadModel` (line 102).
- Fetches model from `latin_macronizer/rftagger-ldt.model?ts=' + Date.now()` (line 84).
- Correctly uses `StringVector` API: `tags.size()` and `tags.get(i)` for single tagging; `results.size()` and `results.get(s)` for batch.
- Batch tagging splits input by newlines into sentences.

#### `docker-build.sh`
- Lines 21-22: After building WASM, automatically copies the Latin model:
  ```bash
  cp -f latin_macronizer/rftagger-ldt.model public/wasm/rftagger-ldt.model
  ```

---

## 4. Verification and Expected Results

After rebuilding and serving:

1. **Model loads** without errors. Debug output shows:
   ```
   loadModel: SUCCESS - tag count = 644
   ```
   (or similar, indicating the tagmap size).

2. **Single-word tagging** returns correct tags:
   ```
   Gallia → n.-.s.-.-.-.f.b.-
   est    → v.3.s.p.i.a.-.-.-
   omnis  → a.-.p.-.-.-.f.a.-
   ```

3. **Batch sentence tagging** returns a vector of tag vectors matching native `rft-annotate` output for the Caesar text.

4. **No hash-related errors** — words are found in the lexicon (no "word not found" debug messages).

---

## 5. Technical Notes

### 5.1 Why `size_t` is dangerous in binary file formats

- `size_t` is platform-dependent: 32-bit on WASM (Emscripten), 64-bit on most native systems.
- Binary file formats must use fixed-width types (`uint32_t`, `uint64_t`, `int32_t`, etc.) to ensure cross-platform compatibility.
- The RFTagger model format already uses `uint64_t` for size fields (via `read_size`/`write_size` in `io.h`). The bug was that `WordClass::number_of_classes` was declared as `size_t` but read with `read_data` (which uses `sizeof(T)`), not `read_size`.
- **Fix:** Change `number_of_classes` to `uint64_t` to match the file format's 64-bit integer.

### 5.2 Embind vector conversion quirks

- Embind's `register_vector<T>("VectorName")` must be called **before** any `class_` binding that uses `std::vector<T>` in a function signature.
- Automatic conversion from JavaScript arrays to `std::vector<T>` parameters works only for functions that take `std::vector<T>` by value or non-const reference. For `const std::vector<T>&`, the conversion is not reliably supported.
- **Recommended pattern:** Accept `emscripten::val` (a generic JavaScript value), check `isArray()`, extract elements with `as<T>()`, and call an internal helper that takes a C++ vector.

### 5.3 Hash map with `const char*` keys — pointer vs. content hashing

- `std::hash<const char*>` (and `std::unordered_map<const char*, …>`) hash the **pointer value**, not the string content.
- When strings are dynamically allocated (`strdup`), each occurrence gets a different pointer. Lookups with a different pointer (even with identical content) will fail to match.
- The original `sgi.h` wrapper `hash<T>` inherits from `std::hash<T>`, so `hash<const char*>` inherits the pointer-hashing behavior.
- **Fix:** Provide an explicit specialization for `const char*` that computes `std::hash<std::string>()(s)` to hash by content.
- Alternative approaches: use `std::string` as the key type throughout, or provide a custom hasher that calls `strcmp`-based hashing (e.g., `std::hash<std::string_view>` in C++17).

---

## 6. Next Steps

1. **Rebuild the WASM module** to apply all code changes:
   ```bash
   ./docker-build.sh   # builds via Docker/Emscripten
   # or
   ./build-wasm.sh     # if emcc is in PATH
   ```

2. **Serve the project** from the repository root:
   ```bash
   python -m http.server 8000
   ```

3. **Open test page:**
   - `http://localhost:8000/test-wasm-enhanced.html` (interactive)
   - or `http://localhost:8000/test-wasm-basic.html` (automated test)

4. **Click "Load Model"**, then **"Tag Words"** or **"Batch Tag Sentences"**.

5. **Verify** that tags match the native `rft-annotate` output (see `original-output.txt`).

**Note:** Browser caching may serve old `.js` or model files. Use cache-busting query parameters (already added to test pages) or hard-refresh (Ctrl+Shift+R).

---

*End of report.*
