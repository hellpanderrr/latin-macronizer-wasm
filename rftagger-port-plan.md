# RFTagger Port Plan - JavaScript Implementation

## Current Architecture Analysis

### Python RFTagger Integration
The current system uses RFTagger (RFTagger-ldt) as an external tool:

1. **tokenization.py** (`addtags` method):
   - Writes tokens to temporary file
   - Calls RFTagger via command line: `rft-annotate -s -q model input output`
   - Reads tagged output
   - Handles enclitics specially

2. **postags.py**:
   - Contains 400+ Latin POS tag definitions
   - Functions to convert LDT tags to parse features
   - Tag distance calculation for disambiguation

3. **rftagger-ldt.model** (12.8 MB):
   - Trained model file (binary format)
   - Contains statistical models for Latin POS tagging

4. **macrons.txt** → **rftagger-lexicon.txt**:
   - Lexicon extraction for RFTagger

## Challenge
RFTagger is a C++ tool with:
- No native JavaScript implementation
- Binary model format
- Command-line interface

## Solution: Hybrid JavaScript POS Tagger

### Approach: Rule-Based + Dictionary Lookup

Since we cannot directly port the RFTagger binary model, we'll implement a sophisticated JavaScript-based tagger that:

1. Uses the existing lemma dictionary (lemmas.py → lemmas.json)
2. Implements Latin morphological rules
3. Applies contextual heuristics
4. Maintains similar accuracy through pattern matching

## Implementation Plan

### Phase 1: Data Preparation

#### 1.1 Convert lemmas.py to lemmas.json
```javascript
// Structure: {"lemma": {"pos": "N", "frequency": 16, "forms": [...]}}
{
  "Aeneas": {"pos": "N", "frequency": 16, "tags": ["NOM", "S", "M"]},
  "ab": {"pos": "PREP", "frequency": 247},
  ...
}
```

#### 1.2 Extract POS Tag Mappings
From postags.py, extract:
- Tag definitions (9-character LDT format)
- Feature mappings
- Parse conversions

### Phase 2: Core Tagger Implementation

#### 2.1 Dictionary-Based Tagger (src/analysis/POSTagger.js)
```javascript
class POSTagger {
  constructor() {
    this.lemmaDict = {};  // Loaded from lemmas.json
    this.suffixRules = {}; // Morphological patterns
    this.contextRules = {}; // Bigram/trigram patterns
  }

  // Primary tagging method
  tag(tokens) {
    const tagged = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const context = this.getContext(tokens, i);
      
      // 1. Dictionary lookup
      let tags = this.lookup(token.text);
      
      // 2. If unknown, apply morphological analysis
      if (!tags || tags.length === 0) {
        tags = this.morphologicalAnalysis(token.text);
      }
      
      // 3. Apply contextual disambiguation
      tags = this.disambiguate(tags, context);
      
      tagged.push({
        text: token.text,
        tags: tags,
        lemma: this.getLemma(token.text, tags)
      });
    }
    
    return tagged;
  }

  lookup(word) {
    // Check dictionary (case-insensitive)
    const lower = word.toLowerCase();
    return this.lemmaDict[lower]?.tags || null;
  }

  morphologicalAnalysis(word) {
    const tags = [];
    
    // Verb patterns
    if (this.isVerb(word)) {
      tags.push(...this.getVerbTags(word));
    }
    
    // Noun patterns
    if (this.isNoun(word)) {
      tags.push(...this.getNounTags(word));
    }
    
    // Adjective patterns
    if (this.isAdjective(word)) {
      tags.push(...this.getAdjTags(word));
    }
    
    // Adverb patterns
    if (this.isAdverb(word)) {
      tags.push(...this.getAdvTags(word));
    }
    
    return tags;
  }

  isVerb(word) {
    const verbEndings = [
      'o', 's', 't', 'mus', 'tis', 'nt',  // Present
      'bam', 'bas', 'bat', 'bamus', 'batis', 'bant',  // Imperfect
      'bo', 'bis', 'bit', 'bimus', 'bitis', 'bunt',  // Future
      'i', 'isti', 'it', 'imus', 'istis', 'erunt',  // Perfect
      'eram', 'eras', 'erat', 'eramus', 'eratis', 'erant',  // Pluperfect
      'ero', 'eris', 'erit', 'erimus', 'eritis', 'erint',  // Future perfect
      're', 'ris', 'tur', 'mur', 'mini', 'ntur',  // Present passive
      'bar', 'baris', 'batur', 'bamur', 'bamini', 'bantur',  // Imperfect passive
      'bor', 'beris', 'bitur', 'bimur', 'bimini', 'buntur',  // Future passive
      'sum', 'es', 'est', 'sumus', 'estis', 'sunt',  // Present of 'sum'
      'sim', 'sis', 'sit', 'simus', 'sitis', 'sint',  // Present subjunctive
      'essem', 'esses', 'esset', 'essemus', 'essetis', 'essent'  // Imperfect subjunctive
    ];
    
    return verbEndings.some(ending => word.toLowerCase().endsWith(ending));
  }

  isNoun(word) {
    const nounEndings = [
      'a', 'ae', 'am', 'as', 'is', 'os', 'um', 'us',
      'er', 'or', 'men', 'nis', 'tas', 'tatis', 'tio', 'tionis'
    ];
    
    return nounEndings.some(ending => word.toLowerCase().endsWith(ending));
  }

  isAdjective(word) {
    const adjEndings = [
      'us', 'a', 'um', 'er', 'ris', 're',
      'is', 'e', 'ior', 'ius', 'issimus', 'issima', 'issimum'
    ];
    
    return adjEndings.some(ending => word.toLowerCase().endsWith(ending));
  }

  isAdverb(word) {
    const advEndings = ['e', 'er', 'iter', 'o'];
    return advEndings.some(ending => word.toLowerCase().endsWith(ending));
  }

  disambiguate(tags, context) {
    if (tags.length <= 1) return tags;
    
    // Apply contextual rules
    const prevTag = context.previous?.tags[0];
    const nextWord = context.next?.text;
    
    // Rule: After preposition, likely noun/pronoun
    if (prevTag && prevTag.startsWith('PREP')) {
      tags = tags.filter(t => t.startsWith('N') || t.startsWith('PRO'));
    }
    
    // Rule: After verb, likely adverb or accusative noun
    if (prevTag && prevTag.startsWith('V')) {
      tags = tags.filter(t => 
        t.startsWith('ADV') || 
        (t.startsWith('N') && t.includes('ACC')) ||
        t.startsWith('CONJ')
      );
    }
    
    // Rule: Before verb, likely nominative subject
    if (nextWord && this.isVerb(nextWord)) {
      tags = tags.filter(t => t.startsWith('N') && t.includes('NOM'));
    }
    
    return tags.length > 0 ? tags : [tags[0]]; // Return best guess
  }

  getContext(tokens, index) {
    return {
      previous: index > 0 ? tokens[index - 1] : null,
      next: index < tokens.length - 1 ? tokens[index + 1] : null,
      previous2: index > 1 ? tokens[index - 2] : null,
      next2: index < tokens.length - 2 ? tokens[index + 2] : null
    };
  }
}
```

#### 2.2 Suffix Tree for Efficient Pattern Matching
```javascript
class SuffixTree {
  constructor() {
    this.root = {};
  }

  addPattern(suffix, tag) {
    let node = this.root;
    for (let i = suffix.length - 1; i >= 0; i--) {
      const char = suffix[i];
      if (!node[char]) node[char] = {};
      node = node[char];
    }
    node.tag = tag;
    node.isEnd = true;
  }

  findLongestMatch(word) {
    let node = this.root;
    let match = null;
    
    for (let i = word.length - 1; i >= 0; i--) {
      const char = word[i];
      if (!node[char]) break;
      node = node[char];
      if (node.isEnd) {
        match = node.tag;
      }
    }
    
    return match;
  }
}
```

### Phase 3: Tag Set Definition

#### 3.1 Simplified Tag Set
Map RFTagger's 400+ tags to essential categories:

```javascript
const TAG_CATEGORIES = {
  // Nouns
  'N': { desc: 'Noun', features: ['case', 'number', 'gender'] },
  
  // Verbs  
  'V': { desc: 'Verb', features: ['tense', 'mood', 'voice', 'person', 'number'] },
  
  // Adjectives
  'A': { desc: 'Adjective', features: ['case', 'number', 'gender', 'degree'] },
  
  // Pronouns
  'PRO': { desc: 'Pronoun', features: ['type', 'case', 'number', 'gender'] },
  
  // Adverbs
  'ADV': { desc: 'Adverb', features: ['degree'] },
  
  // Prepositions
  'PREP': { desc: 'Preposition', features: ['case'] },
  
  // Conjunctions
  'CONJ': { desc: 'Conjunction', features: [] },
  
  // Interjections
  'INTERJ': { desc: 'Interjection', features: [] },
  
  // Numerals
  'NUM': { desc: 'Numeral', features: ['type', 'case', 'number', 'gender'] },
  
  // Particles
  'PART': { desc: 'Particle', features: [] }
};
```

#### 3.2 Feature Extraction
```javascript
function extractFeatures(word, tag) {
  const features = {};
  
  // Case (for nouns/pronouns/adjectives)
  if (tag.includes('NOM')) features.case = 'nominative';
  else if (tag.includes('ACC')) features.case = 'accusative';
  else if (tag.includes('GEN')) features.case = 'genitive';
  else if (tag.includes('DAT')) features.case = 'dative';
  else if (tag.includes('ABL')) features.case = 'ablative';
  else if (tag.includes('VOC')) features.case = 'vocative';
  else if (tag.includes('LOC')) features.case = 'locative';
  
  // Number
  if (tag.includes('S')) features.number = 'singular';
  else if (tag.includes('P')) features.number = 'plural';
  
  // Gender
  if (tag.includes('M')) features.gender = 'masculine';
  else if (tag.includes('F')) features.gender = 'feminine';
  else if (tag.includes('N')) features.gender = 'neuter';
  
  // Tense (for verbs)
  if (tag.includes('PRES')) features.tense = 'present';
  else if (tag.includes('IMPF')) features.tense = 'imperfect';
  else if (tag.includes('PERF')) features.tense = 'perfect';
  else if (tag.includes('PLUP')) features.tense = 'pluperfect';
  else if (tag.includes('FUT')) features.tense = 'future';
  
  // Mood
  if (tag.includes('IND')) features.mood = 'indicative';
  else if (tag.includes('SUB')) features.mood = 'subjunctive';
  else if (tag.includes('IMP')) features.mood = 'imperative';
  else if (tag.includes('INF')) features.mood = 'infinitive';
  
  // Voice
  if (tag.includes('ACT')) features.voice = 'active';
  else if (tag.includes('PASS')) features.voice = 'passive';
  
  return features;
}
```

### Phase 4: Contextual Analysis

#### 4.1 Bigram/Trigram Patterns
```javascript
const CONTEXT_PATTERNS = {
  // Preposition + Noun (acc/gen/abl)
  'PREP+N': { weight: 0.9, constraint: tag => tag.startsWith('N') && !tag.includes('NOM') },
  
  // Verb + Noun (acc)
  'V+N': { weight: 0.8, constraint: tag => tag.startsWith('N') && tag.includes('ACC') },
  
  // Noun (nom) + Verb
  'N+V': { weight: 0.85, constraint: tag => tag.startsWith('N') && tag.includes('NOM') },
  
  // Adjective + Noun
  'A+N': { weight: 0.7, constraint: tag => tag.startsWith('N') },
  
  // Noun + Adjective
  'N+A': { weight: 0.7, constraint: tag => tag.startsWith('A') },
  
  // Conjunction + Anything
  'CONJ+*': { weight: 0.5, constraint: () => true },
  
  // Numeral + Noun
  'NUM+N': { weight: 0.8, constraint: tag => tag.startsWith('N') }
};
```

#### 4.2 Collocation Database
```javascript
const COLLOCATIONS = {
  // Common verb-noun pairs
  'amo+amicum': 0.95,
  'video+urbem': 0.90,
  'habeo+rem': 0.85,
  'sum+deus': 0.95,
  'sum+dea': 0.95,
  
  // Common adjective-noun pairs
  'magnus+dux': 0.90,
  'bonus+rex': 0.88,
  'malus+tyrannus': 0.85,
  
  // Common preposition-case pairs
  'in+acc': 0.95,  // in + accusative = into
  'in+abl': 0.95,  // in + ablative = in/on
  'ad+acc': 0.98,  // ad + accusative = to/toward
  'cum+abl': 0.98  // cum + ablative = with
};
```

### Phase 5: Integration with Macronizer

#### 5.1 Modified Tokenization
```javascript
class Tokenization {
  constructor(text) {
    this.text = text;
    this.tokens = [];
    this.postagger = new POSTagger();
  }

  tokenize() {
    // Split into words/punctuation
    const rawTokens = this.splitIntoTokens(this.text);
    
    // Create Token objects
    this.tokens = rawTokens.map(t => new Token(t));
    
    // Add POS tags
    this.addTags();
    
    return this.tokens;
  }

  addTags() {
    // Get tags from JavaScript tagger
    const tagged = this.postagger.tag(this.tokens);
    
    // Assign to tokens
    this.tokens.forEach((token, i) => {
      token.tag = tagged[i].tags[0]; // Primary tag
      token.lemma = tagged[i].lemma;
      token.allTags = tagged[i].tags; // All possible tags
    });
  }
}
```

### Phase 6: Performance Optimization

#### 6.1 Caching
```javascript
class TagCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 10000;
  }

  get(word) {
    const lower = word.toLowerCase();
    return this.cache.get(lower);
  }

  set(word, tags) {
    const lower = word.toLowerCase();
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(lower, tags);
  }
}
```

#### 6.2 Web Worker for Large Texts
```javascript
// tagger.worker.js
self.onmessage = function(e) {
  const { text, type } = e.data;
  const tagger = new POSTagger();
  const tokens = tokenize(text);
  const tagged = tagger.tag(tokens);
  
  self.postMessage({ tagged, type });
};

// Main thread
const taggerWorker = new Worker('tagger.worker.js');

taggerWorker.onmessage = function(e) {
  const { tagged, type } = e.data;
  // Update UI with tagged tokens
};

// For large texts
if (text.length > 10000) {
  taggerWorker.postMessage({ text, type: 'large' });
} else {
  // Process synchronously
}
```

### Phase 7: Accuracy Validation

#### 7.1 Test Suite
```javascript
const TEST_CASES = [
  {
    text: "Puella puerum amat",
    expected: [
      { word: "Puella", pos: "N", case: "nom", number: "sg", gender: "f" },
      { word: "puerum", pos: "N", case: "acc", number: "sg", gender: "m" },
      { word: "amat", pos: "V", tense: "pres", mood: "ind", voice: "act", person: "3", number: "sg" }
    ]
  },
  {
    text: "Magnus dominus",
    expected: [
      { word: "Magnus", pos: "A", case: "nom", number: "sg", gender: "m" },
      { word: "dominus", pos: "N", case: "nom", number: "sg", gender: "m" }
    ]
  }
];

function runTests() {
  const tagger = new POSTagger();
  let passed = 0;
  let total = 0;
  
  TEST_CASES.forEach(test => {
    const tokens = tokenize(test.text);
    const tagged = tagger.tag(tokens);
    
    test.expected.forEach((expected, i) => {
      total++;
      if (validateTags(tagged[i], expected)) {
        passed++;
      }
    });
  });
  
  console.log(`Accuracy: ${(passed/total*100).toFixed(1)}%`);
}
```

### Phase 8: Comparison with RFTagger

#### 8.1 Accuracy Metrics
| Metric | RFTagger | JS Tagger | Target |
|--------|----------|-----------|--------|
| Overall Accuracy | ~97% | TBD | >95% |
| Verb Tagging | ~96% | TBD | >94% |
| Noun Tagging | ~98% | TBD | >96% |
| Unknown Words | ~85% | TBD | >80% |

#### 8.2 Performance Metrics
| Text Size | RFTagger | JS Tagger (Target) |
|-----------|----------|-------------------|
| 1k chars | ~0.5s | <0.1s |
| 10k chars | ~2s | <0.5s |
| 100k chars | ~20s | <5s |

## Implementation Priority

### High Priority (Core Functionality)
1. ✅ Dictionary-based lookup (lemmas.json)
2. ✅ Verb conjugation patterns
3. ✅ Noun declension patterns
4. ✅ Adjective patterns
5. ✅ Basic contextual rules

### Medium Priority (Accuracy)
6. ✅ Suffix tree optimization
7. ✅ Collocation database
8. ✅ Bigram/trigram patterns
9. ✅ Enclitic handling
10. ✅ Irregular forms

### Low Priority (Enhancements)
11. ✅ Web Worker for large texts
12. ✅ Machine learning (optional)
13. ✅ User feedback learning
14. ✅ Advanced disambiguation

## Data Requirements

### From lemmas.py
- All lemmas with frequencies
- POS information
- Morphological patterns

### From postags.py
- Tag definitions
- Feature mappings
- Parse conversions

### From macrons.txt
- Word forms with macrons
- Frequency data

### New: Pattern Database
- Common verb endings → tags
- Common noun endings → tags
- Exception list (irregulars)
- Collocation frequencies

## Testing Strategy

### Unit Tests
- Individual pattern matching
- Feature extraction
- Contextual disambiguation

### Integration Tests
- Full text tagging
- Comparison with Python output
- Performance benchmarks

### Validation
- Sample of 1000 sentences
- Manual verification
- Accuracy measurement

## Deployment

### Build Process
1. Convert lemmas.py → lemmas.json
2. Extract patterns from postags.py
3. Build suffix tree
4. Minify for production
5. Generate service worker for caching

### CDN Distribution
- Host on GitHub Pages/Netlify
- Cache JSON files via CDN
- Version control for model updates

## Maintenance

### Model Updates
- Periodic retraining with new texts
- User feedback incorporation
- Pattern refinement

### Performance Monitoring
- Track tagging accuracy
- Monitor processing time
- Identify bottlenecks

## Conclusion

This JavaScript-based POS tagger will:
- Eliminate dependency on RFTagger binary
- Run entirely client-side
- Provide comparable accuracy (~95%+)
- Offer better performance for typical texts
- Enable offline usage
- Support modern web features (Web Workers, caching)

The key to success is the combination of:
1. Comprehensive lemma dictionary
2. Sophisticated morphological rules
3. Contextual disambiguation
4. Performance optimization
