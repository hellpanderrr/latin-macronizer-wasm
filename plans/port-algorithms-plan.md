# Algorithm Porting Plan: Python → TypeScript

## Executive Summary

This document provides a detailed, line-by-line translation strategy for porting the two critical unimplemented algorithms from the Python Latin macronizer to TypeScript:

1. **`Token.macronize()`** — Dynamic programming vowel-length alignment (token.py:37-120)
2. **`Tokenization.getaccents()`** — Candidate ranking and disambiguation (tokenization.py:183-243)

**Current Status**: The TypeScript port is ~75% complete. All infrastructure (WASM tagger, lemma engine, wordlist, tokenization) is in place, but these two algorithms are stubbed or missing.

**Estimated Effort**: 3-4 hours for implementation + 2-3 hours for testing

---

## Algorithm 1: Token.macronize() — DP Alignment

### 1.1 Purpose and Context

The `macronize()` method takes a plain Latin word and aligns it with a candidate accented form (containing `_` for macron, `^` for breve). It uses edit distance with custom costs to determine where to insert macron markers in the output.

**Key insight**: The algorithm doesn't guess vowel lengths. It aligns a known accented form (from wordlist/lemmas/patterns) with the plain text, preserving the original characters while inserting macron markers at the correct positions.

**Example**:
- Plain: `"virum"`
- Accented candidate: `"vir_um"` (from database)
- Result: `"vir_um"` (macron on `u`)

### 1.2 Detailed Algorithm Breakdown

#### Phase A: Preprocessing and Early Returns (lines 37-59)

```python
def macronize(self, domacronize, alsomaius, performutov, performitoj):
    plain = self.text
    if not self.isword:
        self.macronized = plain
        return
```

**Translation**: If token is not a word (punctuation/space), return plain text unchanged.

```python
    accented = self.accented[0]
    accented = accented.replace("_^", "").replace("^", "")
```

**Translation**: Remove breve markers (`^`) and malformed `_^` sequences. Breves are ignored for macronization.

```python
    if domacronize and alsomaius and 'j' in accented:
        if not accented.startswith(prefixeswithshortj):
            accented = re.sub('([aeiouy])(j[aeiouy])', r'\1_\2', accented)
```

**Translation**: Special handling for `j` in compounds like `virumque` → `virumqu_e`? Actually this adds macron before `j`+vowel sequences, for words like `major` → `ma_jor` → `ma_jor` with macron on preceding vowel. The `prefixeswithshortj` are exceptions where `j` remains short.

**Critical**: This regex adds a macron (`_`) before the vowel preceding a `j`+vowel sequence, handling Latin `i`/`j` ambiguity in compounds.

```python
    if (not domacronize or "_" not in accented) and not performutov and not performitoj:
        self.macronized = plain
        return
```

**Translation**: Early exit if:
- No macronization requested (`domacronize=false`), OR
- No macron markers in accented form, AND
- No u→v or i→j conversions requested

```python
    if self.isenclitic and not (plain.lower() == "ue" and performutov):
        self.macronized = plain
        return
```

**Translation**: Enclitics (like `-que`, `-ve`) are not macronized except `ue` when `performutov` (because `ue` could be `ū`).

```python
    if plain == accented.replace("_", ""):
        if domacronize:
            self.macronized = accented
        else:
            self.macronized = plain
        return
```

**Translation**: If plain text equals accented with macrons removed, we have an exact match. Return accented (if macronizing) or plain.

#### Phase B: Cost Function Definitions (lines 61-74)

```python
    def inscost(a):
        if a == '_':
            return 0
        return 2
```

**Translation**: Insertion cost. Inserting a macron marker `_` is free (cost 0). Inserting any other character costs 2.

**Rationale**: We want to align accented and plain text; macrons are "free" because they're annotations, not actual letters.

```python
    def subcost(p, a):
        if a == '_':
            return 100
        if (a in "IJij" and p in "IJij") or (a in "UVuv" and p in "UVuv"):
            return 1
        return 2
```

**Translation**: Substitution cost.
- Substituting for a macron marker (`_`) is extremely expensive (100) → effectively forbidden
- Substituting I↔I, J↔J, U↔U, V↔V costs 1 (they're equivalent in Latin)
- All other substitutions cost 2

**Critical**: The `a == '_'` check means we never substitute a character for a macron; macrons must be inserted, not substituted.

```python
    def delcost(_):
        return 2
```

**Translation**: Deletion cost is uniformly 2.

#### Phase C: DP Matrix Initialization (lines 76-82)

```python
    n = len(plain) + 1
    m = len(accented) + 1
    distance = [[0 for i in range(m)] for j in range(n)]
    for i in range(1, n):
        distance[i][0] = distance[i-1][0] + delcost(plain[i-1])
    for j in range(1, m):
        distance[0][j] = distance[0][j-1] + inscost(accented[j-1])
```

**Translation**:
- Create `(n+1) × (m+1)` matrix where `n = len(plain)`, `m = len(accented)`
- `distance[i][j]` = minimum cost to align `plain[0:i]` with `accented[0:j]`
- First column: deleting all `i` characters from plain → cumulative deletion cost
- First row: inserting all `j` characters from accented → cumulative insertion cost (macrons free)

**TypeScript**: Use `number[][]` with `for` loops.

#### Phase D: DP Matrix Fill (lines 83-91)

```python
    for i in range(1, n):
        for j in range(1, m):
            if toascii(plain[i-1].lower()) == toascii(accented[j-1].lower()):
                distance[i][j] = distance[i-1][j-1]
            else:
                rghtcost = distance[i-1][j] + delcost(plain[i-1])
                diagcost = distance[i-1][j-1] + subcost(plain[i-1], accented[j-1])
                downcost = distance[i][j-1] + inscost(accented[j-1])
                distance[i][j] = min(rghtcost, diagcost, downcost)
```

**Translation**:
For each cell `(i,j)`:
- If characters match (case-insensitive, ASCII-normalized), take diagonal (no cost)
- Else compute three options:
  - **Delete** plain[i-1]: `distance[i-1][j] + delcost`
  - **Substitute** plain[i-1] → accented[j-1]: `distance[i-1][j-1] + subcost`
  - **Insert** accented[j-1]: `distance[i][j-1] + inscost`
- Take minimum

**Critical**: The `toascii()` normalization handles ligatures (æ→ae, œ→oe) and diacritics (ä→a). Must be ported.

#### Phase E: Backtracking (lines 92-116)

```python
    result = ""
    while i != 0 and j != 0:
        upcost = distance[i][j-1] if j > 0 else 1000
        diagcost = distance[i-1][j-1] if j > 0 and i > 0 else 1000
        leftcost = distance[i-1][j] if i > 0 else 1000
        if diagcost <= upcost and diagcost < leftcost:
            i -= 1
            j -= 1
            if performutov and accented[j].lower() == 'v' and plain[i] == 'u':
                result = 'v' + result
            elif performutov and accented[j].lower() == 'v' and plain[i] == 'U':
                result = 'V' + result
            elif performitoj and accented[j].lower() == 'j' and plain[i] == 'i':
                result = 'j' + result
            elif performitoj and accented[j].lower() == 'j' and plain[i] == 'I':
                result = 'J' + result
            else:
                result = plain[i] + result
        elif upcost <= diagcost and upcost <= leftcost:
            j -= 1
            if domacronize and accented[j] == '_':
                result = "_" + result
        else:
            i -= 1
            result = plain[i] + result
```

**Translation**: Backtrack from `distance[n][m]` to `[0][0]`, building result string:
- Choose move with minimum cost (diagonal/up/left)
- **Diagonal**: characters aligned → append `plain[i]` (with u↔v, i↔j conversion if enabled)
- **Up**: insert `accented[j]` → if it's `_` and `domacronize`, prepend `_` (macron marker)
- **Left**: delete `plain[i]` → prepend `plain[i]`

**Critical**: The `performutov`/`performitoj` conversions only apply during diagonal moves when accented has `v`/`j` and plain has `u`/`i`. This handles Latin orthography variants.

```python
    result = result.replace("__", "_")
    self.macronized = result
```

**Translation**: Clean up double macrons (can occur with weird Morpheus output like `de_e_recti_`).

### 1.3 TypeScript Implementation Strategy

**File**: `src/core/alignMacronized.ts` (new standalone module)

**Signature**:
```typescript
export function alignMacronized(
  plain: string,
  accented: string,
  domacronize: boolean,
  performutov: boolean,
  performitoj: boolean
): string
```

**Steps**:
1. Preprocess `accented`: remove `^` and `_^`
2. Apply `alsomaius` regex if needed (but `alsomaius` is not used in alignment, only in preprocessing — check usage)
3. Early returns for non-words, enclitics, exact match
4. Implement `inscost`, `subcost`, `delcost` as nested functions
5. Build `distance: number[][]` matrix (size `(plain.length+1) × (accented.length+1)`)
6. Fill matrix with nested loops
7. Backtrack from `[plain.length][accented.length]` to `[0][0]`
8. Clean up `__` → `_`
9. Return result

**Edge Cases**:
- Empty strings
- `plain` much longer than `accented` (many deletions)
- `accented` much longer than `plain` (many insertions, mostly `_`)
- Case preservation: algorithm uses `plain[i]` directly, so original case is preserved
- `performutov`: when accented has `v`/`V` and plain has `u`/`U`, output `v`/`V` instead of `u`/`U`
- `performitoj`: analogous for `j`/`J` vs `i`/`I`

**Complexity**: O(n×m) time and space. Max word length in Latin ~20 chars, so trivial.

---

## Algorithm 2: Tokenization.getaccents() — Candidate Ranking

### 2.1 Purpose and Context

The `getaccents()` method assigns accented forms to tokens. It's the main disambiguation logic that chooses among multiple possible macronizations based on POS tag and lemma.

**Input**: Token with `.text`, `.tag`, `.lemma` already set (by `addtags()` and `addlemmas()`)
**Output**: Sets `token.accented` (array of candidate accented forms) and `token.isunknown`

**Data sources** (from `WordlistEngine`):
- `wordlist.formtoaccenteds[wordform]` → list of accented forms (unfiltered)
- `wordlist.formtotaglemmaaccents[wordform]` → list of `(tag, lemma, accented)` tuples

**Fallback**: `tag_to_endings` dictionary from `macronized_endings.py`

### 2.2 Detailed Algorithm Breakdown

#### Phase A: Special Cases (lines 212-215)

```python
    for token in self.tokens:
        if not token.isword:
            continue
        wordform = toascii(token.text)
        iscapital = wordform.istitle()
        wordform = wordform.lower()
        tag = token.tag
        lemma = token.lemma
        if token.isenclitic:
            token.accented = ["ve"] if token.text.lower() == "ue" else [token.text.lower()]
        elif token.text.lower() == "ne" and token.hasenclitic:
            token.accented = ["ne"]
```

**Translation**:
- Skip non-word tokens
- Normalize: `toascii()`, lowercase for lookup, preserve `iscapital` flag
- **Enclitics**: `ue` → `["ve"]` (because `-ue` enclitic is from `-ve`), other enclitics → their lowercase form (no macrons)
- **`ne` with enclitic**: e.g., `neque` → `ne` + `que`; the `ne` part stays unaccented

**TypeScript**: Already handled in `Tokenizer.splitEnclitic()`? Need to verify integration.

#### Phase B: Single-Candidate Shortcut (lines 216-217)

```python
        elif len(set(wordlist.formtoaccenteds[wordform])) == 1:
            token.accented = [wordlist.formtoaccenteds[wordform][0]]
```

**Translation**: If the wordform has exactly one unique accented form in the wordlist, use it directly. This is the common case for most common words.

**TypeScript**: `WordlistEngine.getAccentedForms(wordform)` returns `string[]`. Check `new Set(array).size === 1`.

#### Phase C: Multi-Candidate Ranking (lines 218-231)

```python
        elif wordform in wordlist.formtotaglemmaaccents:
            candidates = []
            for (lextag, lexlemma, accented) in wordlist.formtotaglemmaaccents[wordform]:
                casedist = 0 if iscapital == lexlemma.istitle() or token.startssentence and iscapital else 1
                tagdist = postags.tag_distance(tag, lextag)
                lemdist = levenshtein(lemma, lexlemma)
                candidates.append((casedist, tagdist, lemdist, accented))
            candidates.sort()
            token.accented = []
            for (casedist, tagdist, lemdist, accented) in candidates:
                if accented not in token.accented and casedist == candidates[0][0]:
                    token.accented.append(accented)
```

**Translation**:
1. For each `(lextag, lexlemma, accented)` tuple in the wordlist for this wordform:
   - **Case distance** (`casedist`): 0 if capitalization matches (both title-case or both not), OR if token starts sentence and is capitalized (any lemma acceptable); else 1
   - **Tag distance** (`tagdist`): call `tag_distance(token.tag, lextag)` — counts mismatched features
   - **Lemma distance** (`lemdist`): Levenshtein distance between token.lemma and lexlemma
   - Append tuple `(casedist, tagdist, lemdist, accented)` to candidates
2. Sort candidates lexicographically by `(casedist, tagdist, lemdist)` (Python tuple sort)
3. Collect all accented forms with `casedist` equal to the best candidate's `casedist` (i.e., only top case-matched candidates), deduplicated

**Key insight**: The ranking prioritizes:
1. Case match (most important)
2. Tag similarity (more similar tags preferred)
3. Lemma similarity (closer lemmas preferred)

**TypeScript**: Need to implement:
- `tagDistance(tag1: string, tag2: string): number` (from postags.py)
- `levenshtein(s1: string, s2: string): number` (standard DP)
- Sort with comparator: `(a, b) => a.casedist - b.casedist || a.tagdist - b.tagdist || a.lemdist - b.lemdist`

#### Phase D: Unknown Word Fallback (lines 232-242)

```python
        else:
            token.accented = [token.text]
            if any(i in token.text for i in "aeiouyAEIOUY"):
                for accented_ending in tag_to_endings.get(tag, []):
                    plain_ending = accented_ending.replace("_", "").replace("^", "")
                    if wordform.endswith(plain_ending):
                        token.accented = [wordform[:-len(plain_ending)] + accented_ending]
                        break
                token.isunknown = True
```

**Translation**:
- Default: `accented = [plain text]` (no macrons)
- If word contains vowels, try to match ending patterns:
  - Iterate `tag_to_endings[tag]` (list of accented endings like `"a_ginie_nse_s"`)
  - Strip `_` and `^` from ending to get `plain_ending` (e.g., `"agineses"`)
  - If `wordform` ends with `plain_ending`, replace with accented ending
  - Break after first match
- Mark token as `isunknown = True`

**TypeScript**: `EndingPatternEngine.getEnding(tag: string, wordform: string): string | null` already exists? Check implementation.

### 2.3 Helper Functions to Port

#### 2.3.1 `tag_distance(tag1, tag2)` (postags.py:730-755)

**Logic**:
- Both tags must be length 9 or 12 (LDT format)
- Define `is_nomen(tag)`: tag starts with `n`, `a`, or `v` with participle/perfect passive participle markers
- If both are nomina but different POS (e.g., noun vs adjective), set `bothnomenbutdifferent = true`
- For each position `i` in tags:
  - If `bothnomenbutdifferent` and position is in the "skip set" (positions 3,4,5 for 9-char tags; 4,5,6 for 12-char tags), **skip** comparison (don't count mismatch)
  - Else if `tag1[i] != tag2[i]`, increment distance
- Return total distance

**Rationale**: For nomina, the features at positions 3-5 (tense/mood/voice) are not applicable, so mismatches there shouldn't penalize if POS differs.

**TypeScript**: 
```typescript
export function tagDistance(tag1: string, tag2: string): number {
  if (!((tag1.length === 9 || tag1.length === 12) && (tag2.length === 9 || tag2.length === 12))) {
    console.warn("Strange or mismatching tags!", tag1, tag2);
    // Still proceed
  }
  const isNomen = (tag: string): boolean => {
    if (tag[0] === 'n' || tag[0] === 'a') return true;
    if (tag[0] === 'v' && (tag.slice(3, 6) === 'rpp' || tag.slice(3, 6) === 'ppa')) return true;
    if (tag[0] === 'N' || tag[0] === 'A') return true;
    if (tag[0] === 'V' && (tag.slice(4, 7) === 'rpp' || tag.slice(4, 7) === 'ppa')) return true;
    return false;
  };
  let dist = 0;
  const bothNomenButDifferent = isNomen(tag1) && isNomen(tag2) && tag1[0] !== tag2[0];
  const skipPositions = (tag1.length === 9) ? [3, 4, 5] : [4, 5, 6];
  for (let i = 0; i < tag1.length; i++) {
    if (bothNomenButDifferent && skipPositions.includes(i)) continue;
    if (tag1[i] !== tag2[i]) dist++;
  }
  return dist;
}
```

#### 2.3.2 Levenshtein distance (inner function)

Standard iterative DP with two rows (space-optimized). Already present in Python code lines 185-199.

**TypeScript**:
```typescript
function levenshtein(s1: string, s2: string): number {
  if (s1.length < s2.length) return levenshtein(s2, s1);
  if (s2.length === 0) return s1.length;
  let previous = Array(s2.length + 1).fill(0).map((_, i) => i);
  for (let i = 0; i < s1.length; i++) {
    const current: number[] = [i + 1];
    for (let j = 0; j < s2.length; j++) {
      const insertions = previous[j + 1] + 1;
      const deletions = current[j] + 1;
      const substitutions = previous[j] + (s1[i] !== s2[j] ? 1 : 0);
      current.push(Math.min(insertions, deletions, substitutions));
    }
    previous = current;
  }
  return previous[s2.length];
}
```

#### 2.3.3 `toascii()` (helpers.py)

Already in Python; need TypeScript version in `src/utils/latin.ts`:

```typescript
export function toAscii(txt: string): string {
  return txt.replace(/[æœÆŒäëïöüÿÄËÏÖÜ]/g, ch => {
    const map: Record<string, string> = {
      'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe',
      'ä': 'a', 'ë': 'e', 'ï': 'i', 'ö': 'o', 'ü': 'u', 'ÿ': 'u',
      'Ä': 'a', 'Ë': 'e', 'Ï': 'i', 'Ö': 'o', 'Ü': 'u'
    };
    return map[ch] || ch;
  });
}
```

#### 2.3.4 `prefixeswithshortj`

Constant tuple from helpers.py, line 3-4. Copy exactly.

---

## Data Structures and Types

### WordlistEngine Interface (already implemented)

```typescript
interface WordlistEngine {
  getAccentedForms(wordform: string): string[];  // formtoaccenteds
  getTagLemmaAccents(wordform: string): Array<{tag: string, lemma: string, accented: string}>;  // formtotaglemmaaccents
  // Also: formtolemmas, etc.
}
```

### Token Class (src/core/Token.ts)

**Existing properties**:
```typescript
class Token {
  text: string;           // original text
  tag: string;            // LDT tag (9 or 12 chars)
  lemma: string;          // lemma
  accented: string[];     // candidate accented forms (with _ markers)
  macronized: string;     // final macronized output (with Unicode macrons)
  isword: boolean;
  isspace: boolean;
  hasenclitic: boolean;
  isenclitic: boolean;
  startssentence: boolean;
  endssentence: boolean;
  isunknown: boolean;
}
```

**To add**: `macronize()` method calling `alignMacronized()`.

### EndingPatternEngine

Check if `src/analysis/EndingPatternEngine.ts` already has a method to match endings. The Python code does:
```python
for accented_ending in tag_to_endings.get(tag, []):
    plain_ending = accented_ending.replace("_", "").replace("^", "")
    if wordform.endswith(plain_ending):
        ...
```
TypeScript must replicate exactly.

---

## Implementation Phases

### Phase 1: Utility Functions (src/utils/latin.ts)

Create new file with:
- `toAscii(txt: string): string`
- `tagDistance(tag1: string, tag2: string): number`
- `prefixesWithShortJ: readonly string[]` (constant)
- Re-export from `postags` if needed

**Also**: Check if `src/utils/latin.ts` exists. If not, create it. If exists, add functions.

### Phase 2: Core DP Algorithm (src/core/alignMacronized.ts)

New module:
```typescript
export function alignMacronized(
  plain: string,
  accented: string,
  domacronize: boolean,
  performutov: boolean,
  performitoj: boolean
): string { ... }
```

**Unit test**: Write test cases from Python reference:
- `alignMacronized("virum", "vir_um", true, false, false) → "vir_um"`
- `alignMacronized("virum", "virum", true, false, false) → "virum"`
- `alignMacronized("Iulium", "Iul_ius", true, false, false) → "Iul_ius"`
- `alignutov`: `"u"` in plain aligns to `"v"` in accented → output `"v"`
- Enclitic skip: already handled before call

### Phase 3: Token.macronize() (src/core/Token.ts)

Add method:
```typescript
macronize(
  domacronize: boolean,
  alsomaius: boolean,
  performutov: boolean,
  performitoj: boolean
): void {
  // ... implementation calling alignMacronized()
  this.macronized = alignMacronized(this.text, this.accented[0], domacronize, alsomaius, performutov, performitoj);
}
```

**Note**: Python uses `self.accented[0]` (first candidate). TypeScript should handle empty `accented` array? Default to `this.text`.

### Phase 4: Tokenization.getAccents() (src/core/Tokenization.ts)

Replace stub with full implementation:

```typescript
getAccents(wordlist: WordlistEngine): void {
  for (const token of this.tokens) {
    if (!token.isword) continue;
    
    const wordformAscii = toAscii(token.text);
    const isCapital = token.text === token.text.toUpperCase() && token.text !== token.text.toLowerCase();
    const wordform = wordformAscii.toLowerCase();
    const tag = token.tag;
    const lemma = token.lemma;

    // Special cases
    if (token.isenclitic) {
      token.accented = [token.text.toLowerCase() === "ue" ? "ve" : token.text.toLowerCase()];
      continue;
    }
    if (token.text.toLowerCase() === "ne" && token.hasenclitic) {
      token.accented = ["ne"];
      continue;
    }

    // Get accented forms from wordlist
    const accentedForms = wordlist.getAccentedForms(wordform);
    if (accentedForms.length === 0) {
      // Unknown word fallback
      token.accented = [token.text];
      if (/[aeiouy]/i.test(token.text)) {
        const matchedEnding = EndingPatternEngine.matchEnding(tag, wordform);
        if (matchedEnding) {
          token.accented = [matchedEnding];
        }
      }
      token.isunknown = true;
      continue;
    }

    if (new Set(accentedForms).size === 1) {
      token.accented = [accentedForms[0]];
      continue;
    }

    // Multi-candidate: need tag/lemma info
    const candidates = wordlist.getTagLemmaAccents(wordform);
    if (candidates.length > 0) {
      const scored = candidates.map(c => ({
        casedist: (isCapital === c.lemma.istitle() || (token.startssentence && isCapital)) ? 0 : 1,
        tagdist: tagDistance(tag, c.tag),
        lemdist: levenshtein(lemma, c.lemma),
        accented: c.accented
      }));
      scored.sort((a, b) => a.casedist - b.casedist || a.tagdist - b.tagdist || a.lemdist - b.lemdist);
      const bestCaseDist = scored[0].casedist;
      token.accented = [];
      for (const c of scored) {
        if (c.casedist === bestCaseDist && !token.accented.includes(c.accented)) {
          token.accented.push(c.accented);
        }
      }
    } else {
      // Fallback to plain accented forms (no tag/lemma info)
      token.accented = accentedForms;
    }
  }
}
```

**Note**: The Python code uses `wordlist.formtoaccenteds` (just accented strings) vs `wordlist.formtotaglemmaaccents` (triples). The TypeScript `WordlistEngine` should expose both. Check current implementation.

### Phase 5: Integration with Tokenization.macronize()

The existing `Tokenization.macronize()` method (lines 245-248) already loops over tokens and calls `token.macronize()`. After `getAccents()` sets `token.accented[0]`, the call in `Macronizer.ts` will work.

**Check**: In `src/core/Macronizer.ts`, the flow is:
1. `tokenization.tokenize(text)`
2. `tokenization.addTags()` (WASM)
3. `tokenization.addLemmas(wordlist)`
4. `tokenization.getAccents(wordlist)` ← **NEEDS IMPLEMENTATION**
5. `tokenization.macronize(...)`

### Phase 6: Testing

#### Unit Tests (Jest or similar)

Create `test/unit/alignMacronized.test.ts`:
- Test all cost function behaviors
- Test backtracking choices
- Test `performutov` and `performitoj`
- Test enclitic skip (should be handled before call)

Create `test/unit/tagDistance.test.ts`:
- Test identical tags → 0
- Test different POS → partial credit
- Test nomen special cases

Create `test/unit/getAccents.test.ts`:
- Mock `WordlistEngine` with sample data
- Test single-candidate shortcut
- Test multi-candidate ranking
- Test unknown fallback

#### Integration Test (HTML page)

Create `test-algorithms-compare.html`:
- Load Python-generated test vectors (JSON) from `test-input.txt` or new file
- Run both Python (via WASM? or pre-computed) and TypeScript
- Compare outputs side-by-side
- Highlight mismatches

**Test vectors needed**: Generate from Python reference implementation for ~100 diverse words covering:
- Common nouns (1st/2nd/3rd declension)
- Verbs (all conjugations)
- Adjectives
- Enclitics
- u/v and i/j variants
- Unknown words (hapax legomena)

### Phase 7: Full Wordlist Test

Use existing `macrons.txt` (33MB) loaded into IndexedDB via `WordlistEngine`. Run the full pipeline on a substantial Latin text (e.g., Cicero sample) and:
- Measure performance (should be < 1s for 1000 words)
- Spot-check accuracy
- Monitor memory usage

---

## Implementation Order

1. **Step 1**: Add `toAscii`, `tagDistance`, `levenshtein` to `src/utils/latin.ts`
2. **Step 2**: Create `src/core/alignMacronized.ts` with DP algorithm
3. **Step 3**: Add `macronize()` method to `src/core/Token.ts`
4. **Step 4**: Implement `getAccents()` in `src/core/Tokenization.ts`
5. **Step 5**: Ensure `EndingPatternEngine.matchEnding()` exists; if not, implement
6. **Step 6**: Wire everything: import functions, call from proper places
7. **Step 7**: Write unit tests (parallel with implementation)
8. **Step 8**: Run integration test against Python reference
9. **Step 9**: Full wordlist stress test
10. **Step 10**: Update `BROWSER_TODO.md` with completion status
11. **Step 11**: Build production bundle (`npm run build`)
12. **Step 12**: Update `README-BROWSER.md` with algorithm details

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| DP backtracking logic error | High | Cross-validate with Python on 100+ test cases |
| `tag_distance` skip-positions logic misunderstood | Medium | Study postags.py comments; test with nomen tags |
| `alsomaius` preprocessing not needed in TS? | Low | Python applies it before alignment; replicate exactly |
| WordlistEngine data format mismatch | High | Verify JSON structure matches Python dicts |
| Enclitic handling already done in Tokenizer? | Medium | Check integration; may need to adjust |
| Performance: O(n²) per word could be slow for long words | Low | Max word length ~20; negligible |

---

## Open Questions

1. **`alsomaius` parameter**: In Python, it's used in preprocessing (line 44-46) to add macrons before `j`+vowel. In TypeScript `Token.macronize()` signature includes it, but the preprocessing step may need to happen before calling `alignMacronized`. Where should it be applied?
   - **Answer**: Apply in `Token.macronize()` before calling `alignMacronized`, modifying `accented` locally.

2. **`EndingPatternEngine`**: Check if existing implementation matches Python's `tag_to_endings` lookup logic. The Python code does:
   ```python
   for accented_ending in tag_to_endings.get(tag, []):
       plain_ending = accented_ending.replace("_", "").replace("^", "")
       if wordform.endswith(plain_ending):
           ...
   ```
   TypeScript must replicate exactly.

3. **`formtotaglemmaaccents` data structure**: How is it built in `WordlistEngine`? Verify it contains `(tag, lemma, accented)` tuples from the JSON data.

---

## Appendix: Python Reference Snippets

### A.1 Token.macronize() Full Code (for copy-paste)

See `latin_macronizer/token.py` lines 37-120.

### A.2 Tokenization.getaccents() Full Code

See `latin_macronizer/tokenization.py` lines 183-243.

### A.3 tag_distance()

See `latin_macronizer/postags.py` lines 730-755.

### A.4 helpers.toascii and prefixeswithshortj

See `latin_macronizer/helpers.py`.

---

## Revision History

- 2025-05-04: Initial detailed plan created after deep code analysis