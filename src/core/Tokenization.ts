/**
 * Tokenization module
 * Ported from latin_macronizer/tokenization.py
 * Handles Latin text tokenization with enclitic support
 */

import { Token } from './Token';
import { WasmTagger, TagResult } from '../analysis/WasmTagger';
import { LemmaEngine } from '../analysis/LemmaEngine';
import { EndingPatternEngine } from '../analysis/EndingPatternEngine';
import { normalizeTag } from '../utils/latin';
import { WordlistEngine, WordlistEntry } from '../analysis/WordlistEngine';
import { scanVerses as doScanVerses, MeterAutomaton } from './Scansion';
import { alignMacronized, AlignOptions } from './alignMacronized';
import { 
  toAscii, 
  isPunctuation, 
  isWhitespace, 
  isSentenceEnder,
  splitEnclitic,
  enclitics,
  tagDistance,
  levenshteinDistance,
  underscoreToUnicode,
  unicodeToUnderscore,
  prefixesWithShortJ
} from '../utils/latin';

export interface TokenizationOptions {
  preserveCase?: boolean;
  preserveWhitespace?: boolean;
}

/**
 * Tokenization class - splits Latin text into tokens
 * Handles enclitics (-que, -ve, -ne), sentence boundaries
 */
export class Tokenization {
  public tokens: Token[] = [];
  public text: string;
  public originalText: string;
  private _scannedFeet: string[] = [];
  
  // Enclitic compounds that must be split even if known (from Python tokenization.py)
  private static dividenda: Record<string, number> = {
    "nequid": 4, "attamen": 5, "unusquisque": 7, "unaquaeque": 7, "unumquodque": 7, "uniuscuiusque": 8,
    "uniuscujusque": 8, "unicuique": 6, "unumquemque": 7, "unamquamque": 7, "unoquoque": 6,
    "unaquaque": 6, "cuiusmodi": 4, "cujusmodi": 4, "quojusmodi": 4, "eiusmodi": 4, "ejusmodi": 4,
    "huiuscemodi": 4, "hujuscemodi": 4, "huiusmodi": 4, "hujusmodi": 4, "istiusmodi": 4, "nullomodo": 4,
    "quodammodo": 4, "nudiustertius": 7, "nonnisi": 4, "plusquam": 4, "proculdubio": 5, "quamplures": 6,
    "quamprimum": 6, "quinetiam": 5, "uerumetiam": 5, "verumetiam": 5, "verumtamen": 5, "uerumtamen": 5,
    "paterfamilias": 8, "patrisfamilias": 8, "patremfamilias": 8, "patrifamilias": 8, "patrefamilias": 8,
    "patresfamilias": 8, "patrumfamilias": 8, "patribusfamilias": 8, "materfamilias": 8,
    "matrisfamilias": 8, "matremfamilias": 8, "matrifamilias": 8, "matrefamilias": 8,
    "matresfamilias": 8, "matrumfamilias": 8, "matribusfamilias": 8,
    "respublica": 7, "reipublicae": 8, "rempublicam": 8, "senatusconsultum": 9, "senatusconsulto": 8,
    "senatusconsulti": 8, "usufructu": 6, "usumfructum": 7, "ususfructus": 7,
    "supradicti": 5, "supradictum": 6, "supradictus": 6, "supradicto": 5,
    "seipse": 4, "seipsa": 4, "seipsum": 5, "seipsam": 5, "seipso": 4, "seipsos": 5, "seipsas": 5,
    "seipsis": 5, "semetipse": 4, "semetipsa": 4, "semetipsum": 5, "semetipsam": 5, "semetipso": 4,
    "semetipsos": 5, "semetipsas": 5, "semetipsis": 5, "teipsum": 5, "temetipsum": 5, "vosmetipsos": 5,
    "idipsum": 5
  };
  
  // Special enclitic words that should be split even if known (from Python)
  private static specialEncliticWords = new Set(['nec', 'neque', 'necnon', 'seque', 'seseque', 'quique', 'mecumque', 'tecumque', 'secumque']);
  
  constructor(text: string, options: TokenizationOptions = {}) {
    this.text = text;
    this.originalText = text;
    this.tokenize(text, options);
    this.detectSentenceBoundaries();
  }
  
  /**
   * Main tokenization method
   */
  /**
   * Tokenize text into words, whitespace, and punctuation.
   * Sentence boundary detection matches Python tokenization.py exactly:
   * - A punctuation mark (.;:?!) ends a sentence ONLY if the preceding word
   *   was longer than 1 character. This prevents false boundaries at Latin
   *   abbreviations like "M." (Marcus), "L." (Lucius), "ā. d." (ante diem).
   * - Single-char words + period do NOT end the sentence.
   */
  private tokenize(text: string, options: TokenizationOptions): void {
    const { preserveWhitespace = false } = options;
    this.tokens = [];

    let position = 0;
    let currentWord = '';
    let wordStart = 0;
    // Python: possiblesentenceend tracks whether the previous word token is
    // long enough to plausibly end a sentence
    let possibleSentenceEnd = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Check if character is part of a word
      if (/\w/.test(char) || char === '-' || char === '_') {
        if (currentWord === '') {
          wordStart = position;
        }
        currentWord += char;
      } else {
        // End of word - process it
        if (currentWord) {
          this.addWordToken(currentWord, wordStart, position);
          // Python: possiblesentenceend = (len(token.text) > 1)
          possibleSentenceEnd = (currentWord.length > 1);
          currentWord = '';
        }

        // Handle whitespace and punctuation
        if (isWhitespace(char)) {
          if (preserveWhitespace) {
            this.tokens.push(new Token(char, {
              isWord: false,
              isSpace: true,
              startIndex: position,
              endIndex: position + 1
            } as any));
          }
        } else {
          // Punctuation
          // Python: elif possiblesentenceend and any(i in token.text for i in '.;:?!'):
          const isSentEnder = isSentenceEnder(char);
          const endsSentence = possibleSentenceEnd && isSentEnder;

          this.tokens.push(new Token(char, {
            isWord: false,
            isSpace: false,
            endssentence: endsSentence,
            startIndex: position,
            endIndex: position + 1
          } as any));

          // After a sentence-ending punctuation, reset
          if (endsSentence) {
            possibleSentenceEnd = false;
          }
        }
      }

      position++;
    }

    // Handle final word
    if (currentWord) {
      this.addWordToken(currentWord, wordStart, position);
    }
  }
   
  /**
   * Detect sentence boundaries and mark startssentence on tokens
   */
  private detectSentenceBoundaries(): void {
    let startOfSentence = true;
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      if ((token as any).isWord) {
        if (startOfSentence) {
          this.tokens[i] = token.with({ startssentence: true } as any);
          startOfSentence = false;
        }
        if (token.endssentence) {
          startOfSentence = true;
        }
      } else if (token.endssentence) {
        startOfSentence = true;
      }
    }
  }
   
  /**
   * Add a word token (without splitting enclitics yet)
   */
  private addWordToken(word: string, start: number, end: number): void {
    // Simply add the word as a single token; enclitic splitting will be done later
    this.tokens.push(new Token(word, {
      isWord: true,
      isSpace: false,
      startIndex: start,
      endIndex: end,
      text: word
    } as any));
  }

  /**
   * Split enclitics after wordlist is loaded (Python's two-pass strategy)
   * Returns list of word forms that need to be tagged (excluding enclitics)
   */
  async splitEnclitics(wordlistEngine: WordlistEngine): Promise<string[]> {
    const newTokens: Token[] = [];
    const wordFormsToTag: string[] = [];

    for (const token of this.tokens) {
      if (!(token as any).isWord || (token as any).isenclitic) {
        newTokens.push(token);
        continue;
      }

      const asciiLower = toAscii(token.text).toLowerCase();
      
      // Check if we should split this word (use getAllEntries since wordExists is private)
      const existingEntries = await wordlistEngine.getAllEntries(asciiLower);
      const exists = existingEntries.length > 0;
      const shouldSplit = asciiLower !== 'que' && (
        !exists || Tokenization.specialEncliticWords.has(asciiLower)
      );

      if (!shouldSplit) {
        newTokens.push(token);
        if (token.isWord) wordFormsToTag.push(asciiLower);
        continue;
      }

      // Determine how to split
      let parts: Token[] = [];
      let stemText: string = '';
      let encliticText: string | null = null;
      let isEncliticSplit = false;
      const tokenStart = (token as any).startIndex ?? 0;
      const tokenEnd = (token as any).endIndex ?? tokenStart + token.text.length;

      // Special cases: nec, necnon, dividenda
      if (asciiLower === 'nec') {
        stemText = token.text.slice(0, -1);
        encliticText = token.text.slice(-1);
        isEncliticSplit = true;
      } else if (asciiLower === 'necnon') {
        // Split at 3 (no enclitic), then split first part at 1 (with enclitic)
        const part1Text = token.text.slice(0, -3); // "nec"
        const part2Text = token.text.slice(-3);   // "non"
        const part1Stem = part1Text.slice(0, -1); // "ne"
        const part1Enclitic = part1Text.slice(-1); // "c"
        // Create tokens: "ne" (hasEnclitic), "c" (isEnclitic), "non" (regular)
        const neToken = new Token(part1Stem, {
          isWord: true,
          isSpace: false,
          hasenclitic: true,
          startssentence: token.startssentence,
          startIndex: tokenStart,
          endIndex: tokenStart + part1Stem.length,
          text: part1Stem
        } as any);
        const cToken = new Token(part1Enclitic, {
          isWord: true,
          isSpace: false,
          isenclitic: true,
          startIndex: tokenStart + part1Stem.length,
          endIndex: tokenStart + part1Stem.length + part1Enclitic.length,
          text: part1Enclitic
        } as any);
        const nonToken = new Token(part2Text, {
          isWord: true,
          isSpace: false,
          startIndex: tokenStart + part1Stem.length + part1Enclitic.length,
          endIndex: tokenEnd,
          text: part2Text
        } as any);
        parts = [neToken, cToken, nonToken];
        // Add non-enclitic word forms for tagging
        wordFormsToTag.push(toAscii(part1Stem).toLowerCase());
        wordFormsToTag.push(toAscii(part2Text).toLowerCase());
        newTokens.push(...parts);
        continue;
      } else if (asciiLower in Tokenization.dividenda && !exists) {
        // Only split dividenda compounds if word is unknown (matches Python behavior)
        const splitPos = Tokenization.dividenda[asciiLower];
        const stemPart = token.text.slice(0, -splitPos);
        const restPart = token.text.slice(-splitPos);
        const stemToken = new Token(stemPart, {
          isWord: true,
          isSpace: false,
          startssentence: token.startssentence,
          startIndex: tokenStart,
          endIndex: tokenStart + stemPart.length,
          text: stemPart
        } as any);
        const restToken = new Token(restPart, {
          isWord: true,
          isSpace: false,
          startIndex: tokenStart + stemPart.length,
          endIndex: tokenEnd,
          text: restPart
        } as any);
        parts = [stemToken, restToken];
        wordFormsToTag.push(toAscii(stemPart).toLowerCase());
        wordFormsToTag.push(toAscii(restPart).toLowerCase());
        newTokens.push(...parts);
        continue;
      } else {
        // Generic enclitic split using utility
        const splitResult = splitEnclitic(asciiLower);
        if (!splitResult) {
          // No split pattern matched, keep original
          newTokens.push(token);
          wordFormsToTag.push(asciiLower);
          continue;
        }
        // Slice the ORIGINAL text (Python Token.split preserves case);
        // only the match is done on the lowercased form.
        const encLen = splitResult[1].length;
        stemText = token.text.slice(0, -encLen);
        encliticText = token.text.slice(-encLen);
        isEncliticSplit = true;
      }

      // Create tokens for enclitic split (nec or generic)
      if (isEncliticSplit) {
        const stemToken = new Token(stemText, {
          isWord: true,
          isSpace: false,
          hasenclitic: true,
          startssentence: token.startssentence,
          startIndex: tokenStart,
          endIndex: tokenStart + stemText.length,
          text: stemText
        } as any);
        const encliticToken = new Token(encliticText, {
          isWord: true,
          isSpace: false,
          isenclitic: true,
          startIndex: tokenStart + stemText.length,
          endIndex: tokenEnd,
          text: encliticText
        } as any);
        parts = [stemToken, encliticToken];
        wordFormsToTag.push(toAscii(stemText).toLowerCase());
        newTokens.push(stemToken, encliticToken);
      }
    }

    this.tokens = newTokens;
    return wordFormsToTag;
  }
  
  /**
   * Get all word forms for lookup
   */
  allWordForms(): string[] {
    const forms: string[] = [];
    for (const token of this.tokens) {
      if ((token as any).isWord && !(token as any).isenclitic) {
        forms.push(toAscii(token.text).toLowerCase());
      }
    }
    return [...new Set(forms)]; // Remove duplicates
  }
  
  /**
   * Split tokens for wordlist lookup
   */
  splitTokens(wordlist: any): string[] {
    // TODO: Implement token splitting based on wordlist
    // This handles compound words and contractions
    return [];
  }
  
  /**
   * Add tags to tokens from RFTagger output
   */
  addTags(tags: Array<{word: string, tag: string}>): void {
    let tagIdx = 0;
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      if ((token as any).isWord && !(token as any).isenclitic) {
        if (tagIdx < tags.length) {
          this.tokens[i] = token.with({
            // Convert RFTagger dots to dashes to match wordlist format (n.-.s. → n-s--)
            tag: tags[tagIdx].tag.replace(/\./g, '-')
          });
          tagIdx++;
        }
      }
    }
  }
  
  /**
   * Tag tokens using WasmTagger
   * Gets words from tokens and applies POS tags from RFTagger
   */
  async tagWithWasm(tagger: WasmTagger): Promise<void> {
    // Match Python addtags() exactly:
    // - Skip whitespace
    // - ALL-CAPS → lowercase
    // - hasenclitic: save bearer, skip
    // - isenclitic: write enclitic text, then write saved bearer
    // - endssentence: sentence boundary
    const sentences: string[][] = [[]];
    const sentenceTokenIndices: number[][] = [[]];
    let savedBearer: string | null = null;
    let savedBearerIdx: number = -1;

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i] as any;
      if (!token.isSpace) {
        // Python: if tokentext == tokentext.upper(): tokentext = tokentext.lower()
        // No length check — single letters like "M" (abbreviation) become "m",
        // and punctuation is unaffected (",".toUpperCase() === ",").
        let tokentext: string = token.text;
        if (tokentext === tokentext.toUpperCase()) {
          tokentext = tokentext.toLowerCase();
        }
        if (token.hasenclitic) {
          savedBearer = toAscii(tokentext);
          savedBearerIdx = i;
        } else {
          sentences[sentences.length - 1].push(toAscii(tokentext));
          sentenceTokenIndices[sentenceTokenIndices.length - 1].push(i);
          if (token.isenclitic && savedBearer !== null) {
            sentences[sentences.length - 1].push(savedBearer);
            sentenceTokenIndices[sentenceTokenIndices.length - 1].push(savedBearerIdx);
            savedBearer = null;
          }
        }
      }
      if (token.endssentence) {
        sentences.push([]);
        sentenceTokenIndices.push([]);
      }
    }

    // Remove trailing empty sentence
    while (sentences.length > 0 && sentences[sentences.length - 1].length === 0) {
      sentences.pop();
      sentenceTokenIndices.pop();
    }
    if (sentences.length === 0) return;

    // Tag all sentences
    const allResults = tagger.tagSentences(sentences);

    // Apply tags back to tokens
    for (let s = 0; s < sentences.length; s++) {
      const sentTags = allResults[s];
      const indices = sentenceTokenIndices[s];
      for (let w = 0; w < indices.length && w < sentTags.length; w++) {
        const tokenIdx = indices[w];
        const result = sentTags[w];
        this.tokens[tokenIdx] = this.tokens[tokenIdx].with({
          tag: normalizeTag(result.tag.replace(/\./g, '')),
          confidence: result.confidence
        });
      }
    }
  }
  
  /**
   * Add lemmas to tokens.
   * Exact port of Python tokenization.py addlemmas():
   *   wordform = toascii(token.text)          # ORIGINAL case
   *   best_lemma = "-"; max_freq = -1
   *   Tier 1: wordform in wordform_to_corpus_lemmas →
   *           best corpus lemma by word_lemma_freq[(wordform, lemma)]
   *   Tier 2: wordform.lower() in wordlist.formtolemmas →
   *           best wordlist lemma by lemma_frequency.get(lemma, 0)
   * (No POS tag involved; strict > keeps the FIRST max in iteration order.)
   */
  async addLemmas(lemmaEngine: LemmaEngine, wordlistEngine?: WordlistEngine): Promise<void> {
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      // Lemmas are only consumed downstream for non-enclitic word tokens
      if (!(token as any).isWord || (token as any).isenclitic) continue;

      const wordform = toAscii(token.text); // original case, like Python
      let bestLemma = '-';
      let maxFreq = -1;

      const corpus = lemmaEngine.getCorpusLemmas(wordform);
      if (corpus && corpus.length > 0) {
        for (const [lemma, freq] of corpus) {
          if (freq > maxFreq) {
            maxFreq = freq;
            bestLemma = lemma;
          }
        }
      } else if (wordlistEngine) {
        try {
          // Entries come back in macrons.txt file order (seq-keyed store),
          // matching Python's formtolemmas list order.
          const entries = await wordlistEngine.getAllEntries(wordform.toLowerCase());
          for (const entry of entries) {
            const freq = lemmaEngine.getFrequency(entry.lemma);
            if (freq > maxFreq) {
              maxFreq = freq;
              bestLemma = entry.lemma;
            }
          }
        } catch (_e) {
          // Wordlist lookup failed; keep "-"
        }
      }

      this.tokens[i] = token.with({ lemma: bestLemma });
    }
  }
  
  /**
   * Get accents for tokens
   * Ported from latin_macronizer/tokenization.py (getaccents method)
   * Determines the best accented form (with _ markers) for each token
   */
  async getAccents(wordlistEngine: WordlistEngine, endingEngine: EndingPatternEngine): Promise<void> {
    // Helper: check if string is title case (first letter uppercase, rest lowercase)
    const isTitleCase = (s: string): boolean => {
      if (!s) return false;
      return s[0] === s[0].toUpperCase() && s.slice(1) === s.slice(1).toLowerCase();
    };

    for (let idx = 0; idx < this.tokens.length; idx++) {
      const token = this.tokens[idx];
      if (!(token as any).isWord) continue;

      // Python: wordform = toascii(token.text); iscapital = wordform.istitle();
      //         wordform = wordform.lower()
      const wordformAscii = toAscii(token.text);
      const isCapital = isTitleCase(wordformAscii);
      const wordformLower = wordformAscii.toLowerCase();
      const tag = token.tag;
      const lemma = token.lemma;

      let accented: string[] = [];
      let isUnknown = false;
      let isAmbiguous = false;

      // Special enclitic cases
      if (token.isenclitic) {
        accented = [token.text.toLowerCase() === 'ue' ? 've' : token.text.toLowerCase()];
      } else if (token.text.toLowerCase() === 'ne' && token.hasenclitic) {
        accented = ['ne'];
      } else {
        // Try wordlist: get all entries for this wordform (macrons.txt file order)
        let entries: WordlistEntry[] = [];
        try {
          entries = await wordlistEngine.getAllEntries(wordformLower);
        } catch (error) {
          // Wordlist lookup failed (e.g., IndexedDB error); treat as unknown
          console.warn('getAllEntries error for', wordformLower, error);
          entries = [];
        }
        entries = entries.filter(e => e.accentedUnderscore !== undefined);

        // Python formtoaccenteds stores accented.lower(); the unique check and
        // the single-candidate result both use the LOWERCASED accented form.
        const loweredAccenteds = entries.map(e => e.accentedUnderscore.toLowerCase());

        if (entries.length > 0 && new Set(loweredAccenteds).size === 1) {
          accented = [loweredAccenteds[0]];
        } else if (entries.length > 0) {
          // Multiple candidates: rank exactly like Python candidates.sort() on
          // the tuple (casedist, tagdist, lemdist, accented) — the accented
          // string is the final tiebreaker.
          const candidates: Array<{ casedist: number; tagdist: number; lemdist: number; accented: string }> = [];
          for (const entry of entries) {
            const lexLemma = entry.lemma;
            const lexTag = entry.tag;
            // Python: casedist = 0 if iscapital == lexlemma.istitle()
            //                      or token.startssentence and iscapital else 1
            const casedist = (isCapital === isTitleCase(lexLemma) || (token.startssentence && isCapital)) ? 0 : 1;
            const tagdist = tagDistance(tag, lexTag);
            const lemdist = levenshteinDistance(lemma, lexLemma);
            candidates.push({ casedist, tagdist, lemdist, accented: entry.accentedUnderscore });
          }
          candidates.sort((a, b) =>
            (a.casedist - b.casedist) ||
            (a.tagdist - b.tagdist) ||
            (a.lemdist - b.lemdist) ||
            (a.accented < b.accented ? -1 : a.accented > b.accented ? 1 : 0)
          );
          // Python: append unseen accenteds while casedist == best casedist
          const bestCasedist = candidates[0].casedist;
          accented = [];
          for (const c of candidates) {
            if (c.casedist === bestCasedist && !accented.includes(c.accented)) {
              accented.push(c.accented);
            }
          }
          isAmbiguous = accented.length > 1;
        } else {
          // Unknown word — Python: accented = [token.text]; if it has vowels,
          // scan tag_to_endings[tag] IN ORDER and take the first suffix match
          // (built on the lowercase ascii wordform), then mark as unknown.
          accented = [token.text];
          if (/[aeiouyAEIOUY]/.test(token.text)) {
            const endings = endingEngine.getEndingsForTag(tag);
            for (const accentedEnding of endings) {
              const plainEnding = accentedEnding.replace(/[_^]/g, '');
              if (wordformLower.endsWith(plainEnding)) {
                accented = [wordformLower.slice(0, wordformLower.length - plainEnding.length) + accentedEnding];
                break;
              }
            }
            isUnknown = true;
          }
        }
      }

      // Update token with accented candidates and flags
      this.tokens[idx] = token.with({
        accented,
        isAmbiguous,
        isUnknown
      } as any);
    }
  }
  
  /**
   * Apply macronization to all tokens
   */
  macronize(
    domacronize: boolean,
    alsomaius: boolean,
    performutov: boolean,
    performitoj: boolean,
    endingEngine?: EndingPatternEngine
  ): void {
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      if ((token as any).isWord) {
        this.tokens[i] = this.macronizeToken(
          token, 
          domacronize, 
          alsomaius, 
          performutov, 
          performitoj,
          endingEngine
        );
      }
    }
  }
  
  /**
   * Macronize single token
   * Ported from latin_macronizer/tokenization.py (macronize method)
   * Uses DP alignment to add macrons to the token's accented form
   */
  private macronizeToken(
    token: Token,
    domacronize: boolean,
    alsomaius: boolean,
    performutov: boolean,
    performitoj: boolean,
    endingEngine?: EndingPatternEngine
  ): Token {
    // Use original text for alignment (alignMacronized will handle u->v, i->j conversions)
    let text = token.text;

    if (!domacronize) {
      // Even if not macronizing, still apply orthographic conversions if requested
      if (performutov) {
        text = text.replace(/u/g, 'v').replace(/U/g, 'V');
      }
      if (performitoj) {
        text = text.replace(/i/g, 'j').replace(/I/g, 'J');
      }
      return token.with({ text, macronized: true } as any);
    }

    // Get the accented form (with _ markers) from getAccents
    const accentedCandidates = token.accented;

    if (!accentedCandidates || accentedCandidates.length === 0) {
      // No accented form available, fallback
      return token.with({ text, macronized: true } as any);
    }

    // Use the first (best) accented candidate
    let accentedUnderscore = accentedCandidates[0];

    // Clean: remove '^' markers and '_^' sequences (as in Python Token.macronize)
    accentedUnderscore = accentedUnderscore.replace(/_\^/g, '').replace(/\^/g, '');

    // Apply alsomaius: add macron before 'j' (or 'i') after short vowel, unless prefix with short j
    if (alsomaius && /[ij]/.test(accentedUnderscore)) {
      const lowerAcc = accentedUnderscore.toLowerCase();
      const startsWithShortJ = prefixesWithShortJ.some(prefix => lowerAcc.startsWith(prefix));
      if (!startsWithShortJ) {
        accentedUnderscore = accentedUnderscore.replace(/([aeiouy])([ij][aeiouy])/gi, '$1_$2');
      }
    }

    // If accented form became empty after cleaning, fallback to plain text
    if (!accentedUnderscore) {
      return token.with({ text, macronized: true } as any);
    }

    // Apply DP alignment to produce macronized output
    const alignOptions: AlignOptions = {
      domacronize: true,
      alsomaius: alsomaius,
      performutov: performutov,
      performitoj: performitoj
    };

    const macronizedUnderscore = alignMacronized(text, accentedUnderscore, alignOptions);

    let macronizedUnicode: string;
    if (macronizedUnderscore === null) {
      macronizedUnicode = underscoreToUnicode(accentedUnderscore);
    } else {
      macronizedUnicode = underscoreToUnicode(macronizedUnderscore);
    }

    // Apply u→v and i→j conversions to non-macronized characters only
    if (performutov) {
      macronizedUnicode = macronizedUnicode
        .replace(/u/g, 'v').replace(/U/g, 'V');
    }
    if (performitoj) {
      macronizedUnicode = macronizedUnicode
        .replace(/i/g, 'j').replace(/I/g, 'J');
    }

    return token.with({
      macronizedText: macronizedUnicode,
      macronized: true
    } as any);
  }
  
  /**
   * Convert tokens back to text
   */
  detokenize(markAmbigs: boolean = false): string {
    let result = '';
    let lastEnd = 0;
    
    for (const token of this.tokens) {
      const start = (token as any).startIndex ?? lastEnd;
      
      // Add original whitespace between tokens
      if (start > lastEnd) {
        const whitespace = this.originalText?.substring(lastEnd, start) || ' ';
        result += whitespace;
      }
      
      // Add token text - convert underscore notation to Unicode
      let text = (token as any).macronizedText ?? token.text;
      // Strip remaining underscores that aren't part of macron notation
      // (should already be converted, but double-check)
      if (text) {
        text = text.replace(/_/g, '');
      }
      result += text;
      
      lastEnd = (token as any).endIndex ?? (start + (token as any).text?.length || text.length);
    }
    
    return result;
  }
  
  /**
   * Get plain text without HTML
   */
  getPlainText(): string {
    return this.tokens
      .map(t => (t as any).macronizedText ?? t.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Scan verses using meter automata
   */
  scanVerses(meterAutomatons: MeterAutomaton[]): void {
    this._scannedFeet = doScanVerses(this.tokens as any, meterAutomatons);
  }
  
  /**
   * Get scanned feet (if scansion was performed)
   */
  get scannedFeet(): string[] {
    return this._scannedFeet;
  }
}
