# Latin Macronizer & RFTagger → Browser JavaScript Porting Strategy

## Executive Summary

This document outlines a comprehensive strategy for porting the Latin macronizer system from Python to browser-compatible JavaScript/TypeScript, with special focus on RFTagger statistical POS tagging via WebAssembly compilation.

## System Architecture Overview

### Current Python Architecture
```
├─ Tokenization (tokenization.py)
│  ├─ Regex-based word boundary detection
│  ├─ Sentence segmentation
│  └─ RFTagger subprocess invocation
├─ POS Tagging (RFTagger)
│  ├─ Statistical model (rftagger-ldt.model, 12.8MB)
│  ├─ LDT tag format (9-character Latin tags)
│  └─ Command-line interface
├─ Macronization (macronizer.py)
│  ├─ Lemma lookup (lemmas.py, 8,755 entries)
│  ├─ Pattern-based endings (macronized_endings.py)
│  └─ Edit-distance vowel length assignment
└─ Supporting Data
   ├─ Vocabulary (vocabulary.txt, 3.6M entries)
   ├─ Macrons dictionary (macrons.txt, 32MB)
   └─ Word classes (wordclass.txt)
```

### Target Browser Architecture
```
├─ TypeScript Core Layer
│  ├─ Token.ts (immutable token representation)
│  ├─ Tokenizer.ts (regex-based, no subprocesses)
│  └─ Unicode normalization utilities
├─ POS Tagging Layer (Two Options)
│  ├─ Option A: Hybrid JavaScript Tagger
│  │  ├─ Dictionary lookup (compressed lemma data)
│  │  ├─ Morphological suffix trees
│  │  ├─ Contextual analysis patterns
│  │  └─ Collocation database
│  └─ Option B: WASM RFTagger
│     ├─ Compiled C++ RFTagger module
│     ├─ Embedded model data (binary)
│     └─ JavaScript wrapper API
├─ Macronization Layer
│  ├─ LemmaEngine.ts (compressed dictionary)
│  ├─ EndingPatterns.ts (rule-based)
│  └─ EditDistanceEngine.ts (Levenshtein variant)
└─ Data Layer
   ├─ JSON-serialized dictionaries
   ├─ Compressed lookup structures
   └─ Lazy-loaded model data
```

## Detailed Component Analysis

### 1. Tokenization Component

**Python Implementation** (`latin_macronizer/tokenization.py`):
- Regex patterns for word boundaries, punctuation, numbers
- Sentence boundary detection (period + capital letter)
- Abbreviation handling (e.g., "M." not end of sentence)
- RFTagger subprocess invocation with temp files

**JavaScript Port Strategy**:
```typescript
// src/core/Tokenizer.ts
export class Tokenizer {
  private static WORD_BOUNDARY = /[\s\p{P}\p{S}]+/gu;
  private static SENTENCE_END = /[.!?]+/;
  
  tokenize(text: string): Token[] {
    // Unicode-aware regex patterns
    // No subprocess dependencies
    // Return Token objects directly
  }
}
```

**Key Considerations**:
- Unicode property escapes (`\p{P}`, `\p{S}`) require ES2018+
- Normalize to NFC form for macron consistency
- Browser regex engine limitations (no possessive quantifiers)

### 2. POS Tagging: RFTagger Analysis

**Current Implementation**:
- Binary statistical model (12.8MB)
- Trained on Latin Dependency Treebank (LDT)
- 9-character tag format encoding:
  - Position 1: Part of speech
  - Positions 2-4: Morphological features
  - Positions 5-6: Case
  - Positions 7-8: Number
  - Position 9: Gender

**WASM Compilation Strategy** (Option B):

**Step 1: Source Code Analysis**
RFTagger is written in C/C++ with:
- Statistical model loading (binary format)
- Viterbi algorithm for sequence tagging
- Feature extraction from context windows

**Step 2: Emscripten Build Process**
```bash
# Compile RFTagger to WebAssembly
emcc rftagger.cpp \
  -o rftagger.js \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="RFTagger" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s TOTAL_MEMORY=64MB \
  --preload-file rftagger-ldt.model \
  -O3
```

**Step 3: JavaScript Wrapper**
```typescript
// src/analysis/WasmTagger.ts
export class WasmTagger {
  private module: any;
  
  async initialize(): Promise<void> {
    this.module = await RFTagger();
    // Load model data from embedded FS
  }
  
  tag(tokens: Token[]): TaggedToken[] {
    // Convert tokens to C-compatible format
    // Call WASM tagging function
    // Parse results
  }
}
```

**Pros**:
- 100% accuracy parity with Python version
- Leverages existing trained model
- Minimal maintenance (no rule updates)

**Cons**:
- Large download size (~15MB compressed)
- Complex build pipeline
- Memory intensive
- Cold start latency

### 3. POS Tagging: Hybrid JavaScript Tagger (Option A)

**Architecture**:
```typescript
// src/analysis/POSTagger.ts
export class POSTagger {
  private lemmaDict: Map<string, LemmaEntry>;
  private suffixTree: SuffixTree;
  private collocations: CollocationDB;
  
  constructor(dictionary: DictionaryData) {
    this.lemmaDict = new Map(dictionary.lemmas);
    this.suffixTree = new SuffixTree(dictionary.suffixes);
    this.collocations = new CollocationDB(dictionary.collocations);
  }
  
  tag(tokens: Token[]): TaggedToken[] {
    // Phase 1: Dictionary lookup (O(1) for known words)
    const known = this.dictionaryLookup(tokens);
    
    // Phase 2: Morphological analysis for unknowns
    const analyzed = this.morphologicalAnalysis(
      tokens.filter(t => !known.has(t))
    );
    
    // Phase 3: Contextual disambiguation
    return this.contextualDisambiguation([...known, ...analyzed]);
  }
}
```

**Dictionary Compression**:
- Lemmas: 8,755 entries → ~500KB compressed JSON
- Vocabulary: 3.6M entries → Bloom filter (~10MB) for existence check
- Macrons: 32MB → Suffix-based pattern rules (~2MB)

**Morphological Rules**:
```typescript
// Suffix patterns for POS determination
const VERB_SUFFIXES = [
  { suffix: 'are', tag: 'v1sp' },
  { suffix: 'ēre', tag: 'v2sp' },
  { suffix: 'ere', tag: 'v3sp' },
  { suffix: 'īre', tag: 'v4sp' },
  // ... 200+ patterns
];
```

**Contextual Analysis**:
- Bigram/trigram collocation patterns
- Part-of-speech transition probabilities
- Syntactic constraints (e.g., adjectives before nouns)

**Pros**:
- Fast initial load (~2MB total)
- No compilation pipeline
- Easy to debug and modify
- Progressive enhancement possible

**Cons**:
- ~85-90% accuracy (vs. 95%+ for RFTagger)
- Requires manual rule maintenance
- Edge cases need special handling

### 4. Macronization Component

**Python Implementation** (`latin_macronizer/macronizer.py`):
```python
def macronize(self, token):
    if token.lemma in self.lemmas:
        return self.lemmas[token.lemma]
    
    # Try pattern-based endings
    for pattern, macronized in self.ending_patterns:
        if token.text.endswith(pattern):
            return apply_ending(token.text, macronized)
    
    # Edit distance to known macronized forms
    return self.edit_distance_lookup(token.text)
```

**JavaScript Port**:
```typescript
// src/core/Macronizer.ts
export class Macronizer {
  private lemmas: Map<string, string>;
  private patterns: EndingPattern[];
  
  macronize(token: Token): string {
    // Lemma lookup (fast path)
    const lemmaResult = this.lemmas.get(token.lemma);
    if (lemmaResult) return lemmaResult;
    
    // Pattern matching
    const patternResult = this.matchEnding(token.text);
    if (patternResult) return patternResult;
    
    // Edit distance fallback
    return this.editDistanceLookup(token.text);
  }
  
  private editDistanceLookup(word: string): string {
    // Levenshtein-like algorithm
    // Optimized with BK-tree or similar
  }
}
```

**Data Structure Optimization**:
- Lemma dictionary: `Map<string, string>` (hash table, O(1) lookup)
- Ending patterns: Trie structure for efficient suffix matching
- Edit distance: BK-tree for O(log n) nearest neighbor search

### 5. Data Serialization Strategy

**Python Data Files → JSON Conversion**:

1. **Lemmas** (`lemmas.py` → `lemmas.json`):
```python
# Python: {lemma: (macronized, frequency)}
# JSON: {"amō": {"macronized": "amō", "freq": 1000}}
```
Size: ~500KB (compressed: ~150KB)

2. **Ending Patterns** (`macronized_endings.py` → `endings.json`):
```python
# Python: [(pattern, replacement), ...]
# JSON: {"suffix_trie": {...}}
```
Size: ~200KB (compressed: ~50KB)

3. **Vocabulary** (`vocabulary.txt` → Bloom filter):
```javascript
// JavaScript: probabilistic set for existence check
const bloom = new BloomFilter(size=10_000_000, hashFunctions=3);
vocabulary.forEach(word => bloom.add(word));
```
Size: ~10MB (compressed: ~3MB)

4. **Macrons Dictionary** (`macrons.txt` → Pattern rules):
```python
# Python: {"unmacronized": "macronized", ...}
# JavaScript: Suffix tree + exception list
```
Size: ~32MB → ~2MB (compressed rules)

**Compression Techniques**:
- Dictionary: Gzip compression (70% reduction)
- Bloom filters: Bit arrays (95% space savings)
- Pattern rules: Trie compression (90% reduction)
- Lazy loading: Load only needed data per session

## Migration Roadmap

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Core TypeScript infrastructure

**Tasks**:
- [ ] Set up TypeScript project structure
- [ ] Implement Token class (immutable, with methods)
- [ ] Implement Tokenizer (regex-based, no RFTagger dependency)
- [ ] Unicode normalization utilities
- [ ] Basic test suite

**Deliverables**:
- `src/core/Token.ts`
- `src/core/Tokenizer.ts`
- `src/utils/Unicode.ts`

### Phase 2: Hybrid Tagger (Weeks 3-5)
**Goal**: Functional POS tagger without RFTagger

**Tasks**:
- [ ] Design compressed lemma dictionary format
- [ ] Implement dictionary lookup engine
- [ ] Build suffix tree for morphological analysis
- [ ] Implement contextual analysis patterns
- [ ] Create collocation database
- [ ] Accuracy benchmarking (vs. RFTagger)

**Deliverables**:
- `src/analysis/POSTagger.ts`
- `src/data/dictionaries/lemmas.json`
- `src/data/dictionaries/suffixes.json`
- `src/data/collocations.json`

### Phase 3: Macronization Engine (Weeks 6-7)
**Goal**: Complete macronization without Python dependencies

**Tasks**:
- [ ] Port lemma lookup to TypeScript
- [ ] Implement ending pattern matcher
- [ ] Port edit distance algorithm
- [ ] Optimize data structures (BK-tree, Trie)
- [ ] Performance testing

**Deliverables**:
- `src/core/Macronizer.ts`
- `src/core/EditDistance.ts`
- `src/data/patterns/endings.json`

### Phase 4: WASM RFTagger (Weeks 8-10)
**Goal**: Optional high-accuracy tagging via WebAssembly

**Tasks**:
- [ ] Analyze RFTagger C++ source code
- [ ] Set up Emscripten build pipeline
- [ ] Compile RFTagger to WASM
- [ ] Create JavaScript wrapper API
- [ ] Integrate lazy loading
- [ ] Performance and memory profiling

**Deliverables**:
- `src/analysis/WasmTagger.ts`
- `build/rftagger.wasm`
- `build/rftagger.js`

### Phase 5: Integration & Optimization (Weeks 11-12)
**Goal**: Complete system integration

**Tasks**:
- [ ] Unified API layer (tagger abstraction)
- [ ] Progressive enhancement (JS fallback → WASM)
- [ ] Browser compatibility testing
- [ ] Performance optimization
- [ ] Documentation

**Deliverables**:
- `src/api/MacronizerAPI.ts`
- `docs/API.md`
- `docs/Performance.md`

## Technical Trade-offs

### Accuracy vs. Performance

| Approach | Accuracy | Load Time | Memory | Complexity |
|----------|----------|-----------|--------|------------|
| Pure WASM RFTagger | 95%+ | Slow (15MB) | High | Low |
| Hybrid JS Tagger | 85-90% | Fast (2MB) | Medium | Medium |
| Simplified JS | 75-80% | Very Fast (500KB) | Low | Low |

**Recommendation**: Hybrid JS tagger with optional WASM for power users

### Data Size vs. Accuracy

| Component | Full Data | Compressed | Trade-off |
|-----------|-----------|------------|-----------|
| Lemmas | 8,755 entries | 500KB → 150KB | None (all required) |
| Vocabulary | 3.6M words | 50MB → 10MB | Bloom filter (false positives) |
| Macrons | 32MB pairs | 32MB → 2MB | Pattern rules (edge cases) |

**Recommendation**: Compress aggressively, lazy load optional data

### Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge | Polyfill |
|---------|--------|---------|--------|------|----------|
| ES2018+ | 66+ | 60+ | 12.1+ | 79+ | Yes |
| WebAssembly | 57+ | 52+ | 11+ | 16+ | No |
| Web Workers | 4+ | 3.5+ | 4+ | 12+ | Yes |
| Streams API | 52+ | 65+ | 14.1+ | 79+ | Partial |

**Recommendation**: Target ES2018, provide ES5 fallback

## Implementation Priorities

### Must-Have (Core Functionality)
1. Token class with macronization methods
2. Regex-based tokenizer
3. Lemma dictionary lookup
4. Ending pattern matcher
5. Basic edit distance algorithm

### Should-Have (Quality of Life)
1. Contextual POS tagging
2. Morphological analysis
3. Collocation database
4. Performance optimizations
5. Comprehensive tests

### Could-Have (Enhancements)
1. WASM RFTagger integration
2. Web Worker offloading
3. Progressive Web App features
4. Offline support (Service Workers)
5. Advanced caching strategies

## Risk Assessment

### High Risk
1. **WASM Compilation Complexity**
   - Mitigation: Fallback to pure JS implementation
   - Timeline buffer: +2 weeks

2. **Data Size Constraints**
   - Mitigation: Aggressive compression, lazy loading
   - Alternative: Server-side preprocessing

### Medium Risk
1. **Browser Performance Variability**
   - Mitigation: Progressive enhancement, feature detection
   - Testing: Cross-browser benchmarking

2. **Accuracy Degradation**
   - Mitigation: Hybrid approach, user-configurable quality
   - Validation: Side-by-side comparison with Python

### Low Risk
1. **Unicode Handling**
   - Mitigation: Well-tested libraries (grapheme-splitter)
   - Standardized normalization (NFC)

2. **TypeScript Learning Curve**
   - Mitigation: Existing team experience
   - Resources: Type definitions, strict mode

## Success Metrics

### Functional Requirements
- [ ] 90%+ feature parity with Python version
- [ ] < 3 second initial load time (on 3G)
- [ ] < 500ms macronization for 1000-word text
- [ ] Support for all Latin macronization edge cases

### Non-Functional Requirements
- [ ] Works in Chrome, Firefox, Safari, Edge
- [ ] < 5MB total download (compressed)
- [ ] < 100MB memory usage
- [ ] Responsive UI during processing

### Quality Metrics
- [ ] 85%+ POS tagging accuracy (vs. RFTagger)
- [ ] 95%+ macronization accuracy
- [ ] 90%+ test coverage
- [ ] Zero critical bugs in beta testing

## Next Steps

1. **Immediate** (This Week):
   - Review and approve this strategy document
   - Set up TypeScript project structure
   - Begin Phase 1 implementation

2. **Short-term** (Month 1):
   - Complete Phase 1-3 (Core functionality)
   - Alpha release for testing
   - Gather user feedback

3. **Medium-term** (Month 2-3):
   - Complete Phase 4 (WASM RFTagger)
   - Beta release
   - Performance optimization

4. **Long-term** (Month 4+):
   - Production release
   - Maintenance and feature enhancements
   - Community contributions

## Conclusion

This porting strategy provides a pragmatic approach to bringing the Latin macronizer to browsers. By prioritizing a hybrid JavaScript implementation with optional WASM compilation for RFTagger, we balance accuracy, performance, and maintainability. The phased approach allows for incremental delivery and risk mitigation while ensuring core functionality is available early.

The key innovation is replacing RFTagger's statistical model with a hybrid rule-based system that maintains acceptable accuracy while dramatically reducing complexity and resource requirements. For users requiring maximum accuracy, the WASM compilation path preserves the original RFTagger implementation.

**Recommended Approach**: Begin with Phase 1-3 (hybrid JS implementation), validate accuracy and performance, then evaluate whether WASM compilation (Phase 4) is necessary based on user requirements and feedback.