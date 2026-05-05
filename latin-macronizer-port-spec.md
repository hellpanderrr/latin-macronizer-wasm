# Latin Macronizer - Browser Port Technical Specification

## Overview
Port the Python-based Latin macronizer to a pure JavaScript web application that runs entirely in the browser.

## Architecture Comparison

### Python Architecture
```
latin_macronizer/
├── __init__.py
├── token.py          # Token class
├── tokenization.py   # Text tokenization
├── macronizer.py     # Core macronization logic
├── helpers.py        # Utility functions
├── lemmas.py         # Lemma dictionary (8755 entries)
├── macronized_endings.py  # Ending patterns
├── meters.py         # Metrical scansion
├── postags.py        # POS tag definitions
└── wordlist.py       # Word list management
```

### Proposed JavaScript Architecture
```
src/
├── core/
│   ├── Token.js              # Token class (port of token.py)
│   ├── Tokenization.js       # Tokenization logic
│   ├── Macronizer.js         # Main macronization engine
│   └── helpers.js            # Utility functions
├── data/
│   ├── lemmas.json           # Lemma dictionary
│   ├── endings.json          # Macronized endings
│   ├── vocabulary.json       # Vocabulary with frequencies
│   └── meters.json           # Metrical patterns
├── analysis/
│   ├── POSTagger.js          # POS tagging (simplified)
│   ├── Morphology.js         # Morphological analysis
│   └── Scansion.js           # Meter detection
└── ui/
    ├── MacronizerUI.js       # Main UI controller
    ├── Editor.js             # Text editor component
    └── Renderer.js           # Result rendering
```

## Key Components to Port

### 1. Token Class (token.py)
**Python features:**
- Properties: text, tag, lemma, accented, macronized, isword, isspace
- Methods: split(), show(), macronize()
- Edit distance algorithm for macronization

**JavaScript implementation:**
- ES6 class with similar properties
- Maintain edit distance algorithm (Levenshtein-like)
- Support for Unicode normalization

### 2. Tokenization (tokenization.py)
**Python features:**
- Regex-based word/space splitting
- Unicode-aware text processing
- Sentence boundary detection

**JavaScript implementation:**
- Use JavaScript RegExp with Unicode flag
- Normalize NFC form
- Preserve whitespace and punctuation

### 3. Macronizer (macronizer.py)
**Python features:**
- POS tagging via RFTagger
- Lemma lookup
- Rule-based macronization
- Ambiguity marking

**JavaScript implementation:**
- **Challenge:** RFTagger is Python/Java-based
- **Solution options:**
  1. Port RFTagger model to JavaScript (complex)
  2. Use simplified rule-based tagging (recommended)
  3. Pre-tag common words, use heuristics for unknowns
  4. Consider lightweight JS NLP libraries (compromise)

### 4. Data Files
**Current format:** Python dictionaries in .py files
**New format:** JSON files for browser loading

**Conversion needed:**
- lemmas.py → lemmas.json (8755 entries)
- macronized_endings.py → endings.json (pattern mappings)
- vocabulary.txt → vocabulary.json (frequency data)
- meters.py → meters.json (metrical patterns)

### 5. POS Tagging Strategy
**Original:** RFTagger trained on Latin Dependency Treebank
**Browser alternative:**
- Hybrid approach:
  - Dictionary lookup for known words (lemmas.json)
  - Rule-based patterns for unknown words
  - Suffix analysis for word class determination
  - Context heuristics for disambiguation

**Tag set:** Simplified from RFTagger's 400+ tags to essential Latin categories:
- Nouns (with case/number)
- Verbs (with tense/mood/voice)
- Adjectives
- Adverbs
- Pronouns
- Prepositions
- Conjunctions
- Interjections

### 6. Metrical Scansion
**Python:** meters.py with dactylic hexameter, elegiac distich, etc.
**JavaScript:** Port scanning algorithms, detect long/short syllables

## Technical Challenges

### Challenge 1: POS Tagging Without RFTagger
**Solution:** Implement simplified tagger:
1. Load known lemmas with tags from JSON
2. For unknown words, analyze morphology:
   - Verb endings: -o, -s, -t, -mus, -tis, -nt
   - Noun endings: -a, -us, -um, -is, -es
   - Adjective endings: match noun patterns
3. Use suffix trees for efficient pattern matching
4. Apply contextual rules (e.g., after preposition → noun)

### Challenge 2: Performance with Large Texts
**Solution:**
- Web Workers for background processing
- Chunk processing for texts > 10k characters
- IndexedDB for caching frequent lookups
- Virtual DOM for efficient UI updates

### Challenge 3: Unicode Handling
**Solution:**
- Normalize to NFC form
- Use JavaScript's built-in Unicode support
- Handle macrons: ā ē ī ō ū ȳ (U+0101, U+0113, U+012B, U+014D, U+016B, U+0232)
- Support both macron (¯) and breve (ˇ) notation

### Challenge 4: Accuracy vs. Python Version
**Solution:**
- Maintain same core algorithms
- Validate against Python output
- Allow user corrections with learning mechanism
- Track accuracy metrics

## Implementation Phases

### Phase 1: Core Engine (Weeks 1-2)
- Token class and tokenization
- Basic lemma lookup
- Simple macronization rules
- JSON data conversion

### Phase 2: Advanced Analysis (Weeks 3-4)
- POS tagging implementation
- Morphological analysis
- Scansion algorithms
- Ambiguity detection

### Phase 3: UI Development (Weeks 5-6)
- Text editor with real-time processing
- Interactive vowel editing
- Result visualization
- Configuration options

### Phase 4: Optimization (Week 7)
- Performance tuning
- Large text handling
- Caching strategies
- Browser compatibility

### Phase 5: Testing & Deployment (Week 8)
- Accuracy validation
- Cross-browser testing
- Documentation
- Deployment setup

## Data Conversion Examples

### lemmas.py → lemmas.json
```python
# Python
lemma_frequency = {'ab': 247, 'abdico': 1, ...}
```

```json
// JSON
{
  "ab": 247,
  "abdico": 1,
  ...
}
```

### macronized_endings.py → endings.json
```python
# Python
tag_to_endings = {
  'a-p---fa-': ['a_ginie_nse_s', ...],
  ...
}
```

```json
// JSON
{
  "a-p---fa-": ["a_ginie_nse_s", ...],
  ...
}
```

## Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6+ features with fallbacks
- No external dependencies (optional: use CDN for polyfills)
- Mobile-responsive design

## Performance Targets
- Text up to 50k characters: < 2 seconds
- Text 50k-100k: < 5 seconds
- Text > 100k: Progressive processing with progress indicator

## Feature Parity with Python Version
- [x] Macronization with vowel length marking
- [x] Ambiguity highlighting
- [x] Unknown word marking
- [x] Interactive corrections
- [x] Metrical scansion
- [x] Maius marking (māius → māius)
- [x] u→v and i→j conversion
- [x] Text evaluation/accuracy checking
- [x] Copy-to-clipboard functionality

## Deployment Options
1. **Static hosting:** GitHub Pages, Netlify, Vercel
2. **CDN:** Serve assets via CDN for faster loading
3. **PWA:** Progressive Web App for offline use
4. **Browser extension:** Optional Chrome/Firefox extension

## Success Metrics
- Accuracy within 1% of Python version
- Load time < 3 seconds on average connection
- Support for texts up to 200k characters
- Mobile-friendly interface
- Zero external API dependencies (fully client-side)
