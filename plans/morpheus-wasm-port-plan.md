# Morpheus Cruncher WASM Port Plan

## Executive Summary

**Goal:** Port the Morpheus morphological analyzer "cruncher" to WebAssembly for browser-based Latin text analysis.

**Source:** `morpheus-master/` - Perseus Morpheus project (C codebase)
**Target:** WebAssembly module with JavaScript wrapper
**Approach:** Compile native C code using Emscripten, preserve all data files, expose clean JS API

---

## 1. Architecture Analysis

### 1.1 What is the Cruncher?

The **cruncher** is Morpheus's main command-line morphological analysis tool. It:

1. **Input:** Reads words (one per line) from stdin or file
2. **Processing:** For each word:
   - Normalizes (case handling, accent stripping, Latin u/v conversion)
   - Attempts dictionary lookup
   - Tries various morphological analyses (nominal, verbal, indeclinable)
   - Handles enclitics, prodelision, crasis
   - Generates all possible morphological analyses
3. **Output:** Prints analyses in Perseus format or other formats

**Entry point:** `src/anal/checkstring.c` → `checkstring()` (core orchestrator)
**CLI reference:** `src/anal/stdiomorph.c`

### 1.2 Core Components

#### A. Analysis Engine (`src/anal/`)

Key files:
- `checkstring.c` - **Core analysis orchestrator** (calls checkstring1-4, handles preprocessing)
- `checkword.c` - Dispatches to checknom/checkverb/checkindecl
- `checknom.c` - Noun/adjective analysis (checkregnom, gotnom, chcknend)
- `checkverb.c` - Verb analysis (try_irregvb, analyzed_verb, chckvend)
- `checkindecl.c` - Indeclinable analysis
- `checkdict.c` - Dictionary lookup
- `checkcrasis.c` - Crasis handling (Greek crasis, Latin crasis via LatSync)
- `checkgenwds.c` - Process generated word forms
- `checkirreg.c` - Irregular verb handling (GenIrregForm)
- `checkhalf1.c` - Vowel-stem handling (checkhalf1/2, StemsWork, StemWorks)
- `checkpreverb.c` - Preverb separation
- `checkstem.c` - Stem validation (checkstem, stemexists, comstemtypes, unaugment)
- `prntanal.c` - Output formatting (PrntAnalyses, DumpPerseusAnalysis)
- `propname.c` - Proper name handling
- `deverb.c` - Deverbal derivation
- `digstring.c`, `digmain.c` - Digamma handling

Supporting: `dictstems.c`, `GetSel.c`, `lcnt.c`, `lemma_voice.c`, `makefile`, `multstdiomorph.c`, `nextgkword.c`, `np_scan.c`, `prntanal.h`, `proclems.c`, `prvb.c`, `seek_compound.c`, `stdiomorph.c`, `stdiomorph.proto.h`

#### B. Dictionary System (`src/gkdict/`)
- `dictio.c` - Dictionary I/O and lookup (chckindecl)
- `derivio.c` - Derivational morphology
- `compnoun.c` - Compound nouns (checkforcompnoun)
- `dictstems.c` - Stem dictionary lookup

Key structures: `gk_word`, `gk_analysis`, `gk_string` (from `gkstring.h`)

#### C. Ending Generation (`src/gkends/`)
- `retrends.c` - Retrieve ending tables (getcurrend)
- `nextsufftab.c` - Suffix iteration (nextsuff)
- `stor.c` - Store ending info
- `contract.c` - Contract verbs
- `endindex.c` - Ending validation (chcknend, chckvend)
- `mkend.c` - Ending table generation (build-time only)

Data files: `stemlib/Latin/endtables/ascii/*.asc`

#### D. Lexicon/Stems (`src/gener/`)
- `genwd.c` - Generate word forms (GenIrregForm, GenStemForms)
- `gensynform.c` - Synthetic form generation (AddParadigmInfo, AddPersNumInfo, AddAdjInfo)
- `combconj.c` - Combine stems with endings

Data files: `stemlib/Latin/stemsrc/*`

#### E. Utilities (`src/morphlib/`)
- `morphpath.c` - **CRITICAL:** `MorphFopen()` - resolves `$MORPHLIB` path
- `setlang.c` - `set_lang()`, `cur_lang()` - language state management
- `gkstring.c` - Core gk_word/gk_string management (CreatGkword, FreeGkword, CreatGkString, FreeGkString, ClearGkstring, CpGkAnal, SprintGkFlags, AddParadigmInfo, AddPersNumInfo, AddAdjInfo, PrntStemtype, NameOfTense, NameOfMood, NameOfVoice, NameOfPerson, NameOfNumber, NameOfGender, NameOfCase, NameOfDegree, NameOfStemtype, NameOfDerivtype, DialectNames, GeogRegionNames, DomainNames, MorphNames)
- `sprntGkflags.c` - `JakeSprintGkFlags()` and `GregSprintGkFlags()` (output formatting)
- `morphflags.c` - `MorphNames()` for morphological flag names
- `morphkeys.c` - `DialectNames()` and other naming functions
- `standphon.c` - `stand_phonetics()` preprocessing
- `preverb2.c` - `is_preverb()`, `CombPbStem()`, `CombPbStemL()`, `CombPbStemG()`
- `preverb3.c` - `is_rawpreverb()`
- `cmpend.c` - `cmpend()` checks if word ends with suffix
- `trimwhite.c` - `trimwhite()` whitespace trimming
- `xstrings.c` - `Xstrcpy`, `Xstrncpy`, `Xstrncat` implementations
- Plus: `addaccent.c`, `addbreath.c`, `augment.c`, `beta2smarta.c`, `morphstrcmp.c`, `adddomain.c`, `addninfix.c`, `chngtone.c`, `citenum.c`, `conj2conj.c`, `contract.c`, `derivio.c`, `findbase.c`, `getreflex.c`, `is_compadj.c`, `is_compnoun.c`, `is_compverb.c`, `is_denom.c`, `is_fr.c`, `is_paradj.c`, `is_parverb.c`, `mkarthinf.c`, `mkfem.c`, `mkneut.c`, `masc_of.c`, `morphnorm.c`, `nconj2.c`, `parnum.c`, `pers2end.c`, `prsufvow.c`, `retrentry.c`, `setcase.c`, `setdegree.c`, `setgender.c`, `setmood.c`, `setnumber.c`, `setperson.c`, `settense.c`, `setvoice.c`, `stem2stem.c`, `stiposs.c`, `store.c`, `vadj2v.c`, `vcon2v.c`, `verb2verb.c`, `xmemcpy.c`, `xstrdup.c`, `xstrlen.c`

#### F. Greek Utilities (`src/greeklib/`) - Many used by Latin as well
- `standword.c` - `standword()` preprocessing (stripdiaer, zap_rr_breath)
- `stripacc.c` - `stripacc()` removes accents
- `nsylls.c` - `nsylls()` syllable counting
- `naccents.c` - `naccents()` accent counting
- `isdiphth.c` - `is_diphth()`, `starts_w_diphth()` diphthong checks
- `getaccent.c`, `getaccp.c` - accent location
- `hasaccent.c` - `hasaccent()`
- `checkaccent.c` - `checkaccent()` finds accent position
- `zap2ndbreath.c` - `zap_rr_breath()`
- `stripdiaer.c` - `stripdiaer()`
- Plus: `addaccent.c`, `addbreath.c`, `aspirate.c`, `beta_tolower.c`, `binlook.c`, `cinsert.c`, `do_dissim.c`, `endsinstr.c`, `Fclose.c`, `getaccent.c`, `getaccp.c`, `getbreath.c`, `getquantity.c`, `gkstrlen.c`, `hasaccent.c`, `hasdiaer.c`, `hasquant.c`, `io.c`

### 1.3 Data File Dependencies

**Latin stemlib structure:**
```
stemlib/Latin/
├── stemsrc/           # Stem files (nom.*, vbs.*, ls.nom, lemmata)
├── endtables/ascii/   # Ending tables (conj1.asc, conj2.asc, n/a_um.asc, etc.)
├── steminds/          # Stem indices (nomind, vbind)
├── derivs/            # Derivational morphology
├── conjfile           # Verb conjugation data
└── oddfile            # Irregular forms
```

Total size: ~3-5 MB

**Critical:** `MorphFopen()` (from `morphpath.c`) resolves file paths using the `MORPHLIB` environment variable. All data files must be accessible under `/stemlib` in the Emscripten virtual filesystem.

### 1.4 Build System

Original: `src/anal/makefile` builds static libraries: `anal.a`, `gener.a`, `gkends.a`, `gkdict.a`, `morphlib.a`, `greeklib.a`

WASM: Single-shot compilation with emcc (no need for ar/ranlib). All .c files compiled together with `-I` includes.

---

## 2. Porting Strategy

### 2.1 Approach: Direct Compilation with Emscripten

**Why Emscripten?**
- 100% accuracy (same C code)
- Minimal development effort
- Reuses existing data files
- Browser-based, no server needed

**Architecture:**
```
JS App → MorpheusJS Wrapper → WASM Module (compiled C) → Virtual Filesystem (/stemlib)
```

### 2.2 API Design

```typescript
class Morpheus {
    async initialize(options?: { stemlibPath?: string }): Promise<void>;
    analyze(word: string, options?: AnalysisOptions): AnalysisResult;
    analyzeBatch(words: string[], options?: AnalysisOptions): AnalysisResult[];
    setLanguage(lang: 'greek' | 'latin' | 'italian'): void;
    destroy(): void;
}

interface AnalysisOptions {
    format?: 'perseus' | 'database' | 'lemma';
    ignoreAccents?: boolean;
    strictCase?: boolean;
}

interface AnalysisResult {
    word: string;
    analyses: MorphAnalysis[];
    success: boolean;
    raw: string;
}

interface MorphAnalysis {
    lemma: string;
    stem: string;
    ending: string;
    formInfo: { partOfSpeech: string; case?: string; number?: string; gender?: string; tense?: string; mood?: string; voice?: string; person?: string; };
}
```

**PrntFlags values** (from `prntflags.h`):
| Flag | Decimal | Octal | Description |
|------|---------|-------|-------------|
| SHOW_ANAL | 1 | 01 | Show full analyses |
| SHOW_LEMMA | 2 | 02 | Show lemmas only |
| SHOW_MISSES | 4 | 04 | Show words with no analysis |
| BUFFER_ANALS | 8 | 010 | Buffer analyses internally |
| CHECK_PREVERB | 16 | 020 | Check for preverbs |
| KEEP_BETA | 32 | 040 | Keep betacode encoding |
| SHOW_FULL_INFO | 64 | 0100 | Show full info |
| DBASEFORMAT | 128 | 0200 | Database format output |
| DBASESHORT | 256 | 0400 | Short database format |
| IGNORE_ACCENTS | 512 | 01000 | Ignore accent differences |
| LEXICON_OUTPUT | 1024 | 02000 | Lexicon-style output |
| VERBS_ONLY | 2048 | 04000 | Verbs only |
| STRICT_CASE | 4096 | 010000 | Strict case matching |
| PARSE_FORMAT | 8192 | 020000 | Parse tree format |
| PERSEUS_FORMAT | 16384 | 040000 | Perseus XML format |
| ENDING_INDEX | 32768 | 0100000 | Show ending index |

**Language flags** (from `prntflags.h`):
- `GREEK = 0`
- `LATIN = 32768` (0o100000)
- `ITALIAN = 262144` (0o1000000)

### 2.3 Data File Packaging

**Recommended:** `--preload-file stemlib@/stemlib`
- Packages all data files into virtual filesystem
- `MorphFopen()` works unchanged
- Set `MORPHLIB=/stemlib` via `setenv()` in initialization

### 2.4 Output Capture

Use `setbuf(stdout, buffer)` to redirect `PrntAnalyses` output to memory buffer. The buffer must be large enough (e.g., 64KB) to hold all analyses.

---

## 3. Implementation Steps

### Step 1: Build Script

Created `morpheus_js/build-morpheus-wasm.sh`:

```bash
#!/bin/bash
set -e

# Collect source files (exclude Greek-only if needed)
ANAL_FILES=$(find morpheus-master/src/anal -name "*.c")
GENER_FILES=$(find morpheus-master/src/gener -name "*.c")
GKDICT_FILES=$(find morpheus-master/src/gkdict -name "*.c")
GKENDS_FILES=$(find morpheus-master/src/gkends -name "*.c")
MORPHLIB_FILES=$(find morpheus-master/src/morphlib -name "*.c")
GREEKLIB_FILES=$(find morpheus-master/src/greeklib -name "*.c")  # needed for common utilities

emcc $ANAL_FILES $GENER_FILES $GKDICT_FILES $GKENDS_FILES $MORPHLIB_FILES $GREEKLIB_FILES \
     -Imorpheus-master/src/includes \
     -O3 \
     -s WASM=1 \
     -s MODULARIZE=1 \
     -s EXPORT_NAME="Morpheus" \
     -s ALLOW_MEMORY_GROWTH=1 \
     -s TOTAL_MEMORY=134217728 \
     -s FILESYSTEM=1 \
     -s ENVIRONMENT="web,worker" \
     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","allocate","free"]' \
     --preload-file morpheus-master/stemlib@/stemlib \
     -o morpheus_js/morpheus.js
```

Also created Windows batch version `build-morpheus-wasm.ps1` and Docker-based build `Dockerfile.morpheus-wasm` with `docker-compose.morpheus.yml`.

### Step 2: C Wrapper

Created `morpheus_js/morpheus_wrapper.c`:

```c
#include <gkstring.h>
#include <stdio.h>
#include <stdlib.h>
#include <emscripten.h>

static char output_buffer[65536];

EMSCRIPTEN_KEEPALIVE
void morpheus_init() {
    setenv("MORPHLIB", "/stemlib", 1);
    set_lang(LATIN);
}

EMSCRIPTEN_KEEPALIVE
int morpheus_analyze(const char* word, char* result_buf, int buf_size, PrntFlags flags) {
    gk_word* gkw = CreatGkword(1);
    if (!gkw) return -1;
    
    set_workword(gkw, (char*)word);
    set_prntflags(gkw, flags);
    set_dialect(gkw, ALL_DIAL);  // all dialects

    // Redirect stdout to buffer
    char* old_buf = setbuf(stdout, result_buf);
    int rval = checkstring(gkw);
    setbuf(stdout, old_buf);

    FreeGkword(gkw);
    return rval;
}

EMSCRIPTEN_KEEPALIVE
int morpheus_analyze_batch(const char** words, int num_words, char* result_buf, int buf_size, PrntFlags flags) {
    // Batch processing: analyze each word sequentially
    int total_analyses = 0;
    char* current_pos = result_buf;
    int remaining = buf_size;
    
    for (int i = 0; i < num_words; i++) {
        gk_word* gkw = CreatGkword(1);
        if (!gkw) continue;
        
        set_workword(gkw, (char*)words[i]);
        set_prntflags(gkw, flags);
        set_dialect(gkw, ALL_DIAL);
        
        // Use a temporary buffer for each word
        char temp_buf[32768];
        char* old_buf = setbuf(stdout, temp_buf);
        int rval = checkstring(gkw);
        setbuf(stdout, old_buf);
        
        int len = strlen(temp_buf);
        if (len < remaining) {
            strcpy(current_pos, temp_buf);
            current_pos += len;
            remaining -= len;
            total_analyses += rval;
        } else {
            // Buffer overflow - truncate
            strncpy(current_pos, temp_buf, remaining - 1);
            current_pos[remaining - 1] = '\0';
            break;
        }
        
        FreeGkword(gkw);
    }
    
    return total_analyses;
}

EMSCRIPTEN_KEEPALIVE
void morpheus_destroy() {
    // Cleanup if needed
}
```

Header `morpheus_js/morpheus_wrapper.h` declares these functions.

### Step 3: JavaScript Wrapper

Created `morpheus_js/MorpheusTagger.js`:

```javascript
export class MorpheusTagger {
    constructor() {
        this.module = null;
        this.initialized = false;
        this.FLAGS = {
            SHOW_ANAL: 1,
            SHOW_LEMMA: 2,
            SHOW_MISSES: 4,
            BUFFER_ANALS: 8,
            CHECK_PREVERB: 16,
            KEEP_BETA: 32,
            SHOW_FULL_INFO: 64,
            DBASEFORMAT: 128,
            DBASESHORT: 256,
            IGNORE_ACCENTS: 512,
            LEXICON_OUTPUT: 1024,
            VERBS_ONLY: 2048,
            STRICT_CASE: 4096,
            PARSE_FORMAT: 8192,
            PERSEUS_FORMAT: 16384,
            ENDING_INDEX: 32768,
            LATIN: 32768
        };
    }

    async initialize(wasmPath = '/wasm/morpheus.js') {
        if (this.initialized) return;
        await this.loadScript(wasmPath);
        this.module = await window.MorpheusModule();
        this.module.ccall('morpheus_init', null, [], []);
        this.initialized = true;
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    analyze(word, options = {}) {
        if (!this.initialized) throw new Error('Morpheus not initialized');
        
        const flags = this.optionsToFlags(options);
        const bufferSize = 65536;
        const bufferPtr = this.module._malloc(bufferSize);
        
        try {
            const numAnalyses = this.module.ccall(
                'morpheus_analyze',
                'number',
                ['string', 'number', 'number', 'number'],
                [word, bufferPtr, bufferSize, flags]
            );
            const output = this.module.UTF8ToString(bufferPtr);
            return this.parseOutput(word, output, numAnalyses);
        } finally {
            this.module._free(bufferPtr);
        }
    }

    analyzeBatch(words, options = {}) {
        if (!this.initialized) throw new Error('Morpheus not initialized');
        
        const flags = this.optionsToFlags(options);
        const bufferSize = 65536;
        const bufferPtr = this.module._malloc(bufferSize);
        
        try {
            // Prepare array of string pointers
            const ptrs = words.map(w => this.module.allocateUTF8(w));
            const ptrsArray = this.module._malloc(words.length * 4);
            for (let i = 0; i < words.length; i++) {
                this.module.setValue(ptrsArray + i * 4, ptrs[i], 'i32');
            }
            
            const numAnalyses = this.module.ccall(
                'morpheus_analyze_batch',
                'number',
                ['number', 'number', 'number', 'number', 'number'],
                [ptrsArray, words.length, bufferPtr, bufferSize, flags]
            );
            
            const output = this.module.UTF8ToString(bufferPtr);
            // Free individual strings
            ptrs.forEach(p => this.module._free(p));
            this.module._free(ptrsArray);
            
            return this.parseBatchOutput(words, output, numAnalyses);
        } finally {
            this.module._free(bufferPtr);
        }
    }

    optionsToFlags(options) {
        let flags = this.FLAGS.LATIN | this.FLAGS.SHOW_ANAL;
        if (options.ignoreAccents) flags |= this.FLAGS.IGNORE_ACCENTS;
        if (options.strictCase) flags |= this.FLAGS.STRICT_CASE;
        if (options.format === 'lemma') flags = this.FLAGS.LATIN | this.FLAGS.SHOW_LEMMA;
        if (options.format === 'database') flags = this.FLAGS.LATIN | this.FLAGS.DBASEFORMAT;
        return flags;
    }

    parseOutput(word, output, numAnalyses) {
        const analyses = [];
        const lines = output.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
            if (line.includes('<NL>') && line.includes('</NL>')) {
                const content = line.replace(/<NL>|<\/NL>/g, '').trim();
                const parts = content.split(/\s+/);
                if (parts.length >= 6) {
                    analyses.push(this.parseAnalysis(parts));
                }
            }
        }
        
        return { word, analyses, success: analyses.length > 0, raw: output };
    }

    parseAnalysis(parts) {
        // Perseus format: <NL>V/N/P lemma tense mood voice person number gender case degree</NL>
        // Example: <NL>N puella  fem acc sg      a_e</NL>
        const pos = parts[0]; // N, V, etc.
        const lemma = parts[1];
        // Rest depends on POS
        const info = {};
        
        if (pos === 'N' || pos === 'A' || pos === 'P') {
            // Noun/Adjective/Pronoun: gender case number degree
            info.gender = parts[2] || null;
            info.case = parts[3] || null;
            info.number = parts[4] || null;
            info.degree = parts[5] || null;
        } else if (pos === 'V') {
            // Verb: tense mood voice person number
            info.tense = parts[2] || null;
            info.mood = parts[3] || null;
            info.voice = parts[4] || null;
            info.person = parts[5] || null;
            info.number = parts[6] || null;
        }
        
        return { lemma, pos, ...info };
    }
}
```

### Step 4: Test Page

Created `morpheus_js/test-morpheus-wasm.html` with interactive UI and test cases:
- Single-word analysis
- Batch analysis
- Pre-defined test words: "puellam", "amat", "bonus", "sum", "eo", "qui"

### Step 5: Integration

The MorpheusTagger can be used in the macronizer pipeline to replace RFTagger for morphological analysis.

---

## 4. Source File Inventory

**Total C files needed:** ~60-70 (Latin-only build)

**Directories:**
- `src/anal/` - 17 files (all)
- `src/gener/` - 3+ files (all)
- `src/gkdict/` - 4 files (all)
- `src/gkends/` - 6 files (all)
- `src/morphlib/` - 20+ files (all)
- `src/greeklib/` - 15 files (most needed; exclude Greek-specific like `betacode.c`, `beta2smarta.c`, `beta2rtf.c`)

**Excluded (Greek-only):**
- `src/retr/` - retrieval system (not needed)
- `src/scan/` - scansion tools (not needed)
- `src/tlg/` - TLG utilities (not needed)
- `src/play/` - playground code (not needed)

---

## 5. Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| File I/O (MorphFopen) | `--preload-file stemlib@/stemlib` + `setenv("MORPHLIB", "/stemlib")` |
| Global state | Single-threaded JS safe; `set_lang()` sets language globally |
| Output capture | `setbuf(stdout, buffer)` redirects output to memory |
| Memory allocation | Emscripten heap; use `_malloc`/`_free` for buffers |
| String encoding | `ccall`/`cwrap` handle UTF-8 conversion automatically |
| Data file size | ~3-5MB acceptable; preloaded into virtual FS |
| Build complexity | Single-shot compilation with emcc; no static libs needed |
| Docker path resolution on Windows | Use relative paths in `docker-compose.yml` and batch wrapper for path conversion |
| Flag values | Must match exact decimal values from `prntflags.h` (LATIN=32768, SHOW_ANAL=1, etc.) |
| Missing header files | Ensure all `.h` files in `morpheus-master/src/includes/` are in include path (`-I`) |
| Morpheus output format | Perseus format with `<NL>` tags; robust parser needed |
| ALL_DIAL value | Defined as `0` in `dialect.h`; use `set_dialect(gkw, ALL_DIAL)` |

---

## 6. Testing

Compare WASM output with native cruncher:

```bash
echo "puellam" | MORPHLIB=stemlib bin/cruncher -L
```

Expected:
```
<NL>N puella  fem acc sg      a_e</NL>
```

Test cases:
- **puellam** → `N puella fem acc sg a_e`
- **amat** → `V amo pres ind act 3 sg`
- **bonus** → `A bonus good nom sg masc`, `A bonus good nom sg neut`, `A bonus good acc sg masc`, etc.
- **sum** → `V sum pres ind act 1 sg` (irregular)
- **eo** → `V eo pres ind act 1 sg` (4th conj)
- **qui** → `P qui which nom sg masc` (relative pronoun)

Test all declensions, conjugations, adjectives, enclitics, prodelision, irregulars.

---

## 7. Performance Targets

- Load time: < 2 seconds
- Per-word: < 50ms target, < 100ms acceptable
- Memory: < 100MB
- WASM size: < 10MB compressed

---

## 8. Conclusion

**Feasibility:** High
**Effort:** 2-4 weeks
**Risk:** Low
**Value:** High

**Recommendation:** PROCEED

---

## 9. Current Implementation Status

**Completed:**
- ✅ C wrapper (`morpheus_wrapper.c/h`) with `checkstring()` integration
- ✅ JavaScript wrapper (`MorpheusTagger.js`) with flag constants and output parser
- ✅ Build scripts (`build-morpheus-wasm.sh`, `build-morpheus-wasm.ps1`)
- ✅ Docker configuration (`Dockerfile.morpheus-wasm`, `docker-compose.morpheus.yml`, `docker-build-morpheus.bat`)
- ✅ Test page (`test-morpheus-wasm.html`)
- ✅ Documentation (`morpheus_js/README.md`)
- ✅ Architecture analysis and source file inventory

**Pending:**
- ⏳ Actual compilation and WASM module generation
- ⏳ Testing in browser environment
- ⏳ Integration with macronizer pipeline
- ⏳ Performance optimization and memory tuning

**Next steps:** Build the WASM module using Docker or native Emscripten, verify output matches native cruncher, then integrate into the main application.
