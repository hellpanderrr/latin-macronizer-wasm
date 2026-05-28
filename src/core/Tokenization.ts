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
  private tokenize(text: string, options: TokenizationOptions): void {
    const { preserveWhitespace = false } = options;
    this.tokens = [];
    
    let position = 0;
    let currentWord = '';
    let wordStart = 0;
    
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
          const isSentEnder = isSentenceEnder(char);
          this.tokens.push(new Token(char, {
            isWord: false,
            isSpace: false,
            endssentence: isSentEnder,
            startIndex: position,
            endIndex: position + 1
          } as any));
          
          // Mark previous token as sentence ender if needed
          if (isSentEnder && this.tokens.length > 1) {
            const prevIdx = this.tokens.length - 2;
            this.tokens[prevIdx] = this.tokens[prevIdx].with({ 
              endssentence: true 
            } as any);
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
        [stemText, encliticText] = splitResult;
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
    // Extract word forms for tagging (only words, not punctuation/enclitics)
    const wordsToTag: string[] = [];
    const tokenIndices: number[] = []; // Keep track of which tokens get tags
    
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      if ((token as any).isWord && !(token as any).isenclitic) {
        wordsToTag.push(toAscii(token.text).toLowerCase());
        tokenIndices.push(i);
      }
    }
    
    if (wordsToTag.length === 0) {
      return;
    }
    
    // Tag with RFTagger
    const tagResults = tagger.tag(wordsToTag);
    
    // Apply tags back to tokens (clean RFTagger dots: "n.-.s." → "n-s--")
    for (let i = 0; i < tokenIndices.length && i < tagResults.length; i++) {
      const tokenIdx = tokenIndices[i];
      const result = tagResults[i];
      this.tokens[tokenIdx] = this.tokens[tokenIdx].with({
        // Normalize RFTagger 17-char tags to 9-char LDT format (matches Python behavior)
        tag: normalizeTag(result.tag.replace(/\./g, '')),
        confidence: result.confidence
      });
    }
  }
  
  /**
   * Add lemmas to tokens using LemmaEngine
   */
  addLemmas(lemmaEngine: LemmaEngine): void {
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      
      // Only add lemmas to word tokens
      if ((token as any).isWord && !(token as any).isenclitic) {
        // Look up lemma by word form and POS tag
        const lemmaEntry = lemmaEngine.lookup(token.text, token.tag);
        
        if (lemmaEntry) {
          this.tokens[i] = token.with({
            lemma: lemmaEntry.lemma
          });
        } else {
          // Fallback: use normalized word form as lemma
          this.tokens[i] = token.with({
            lemma: toAscii(token.text).toLowerCase()
          });
        }
      }
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

      const wordformAscii = toAscii(token.text);
      const wordformLower = wordformAscii.toLowerCase();
      const tag = token.tag;
      const lemma = token.lemma;
      const isCapital = /^[A-Z]/.test(token.text);

      let accented: string[] = [];
      let isUnknown = false;
      let isAmbiguous = false;

      // Special enclitic cases
      if (token.isenclitic) {
        accented = [token.text.toLowerCase() === 'ue' ? 've' : token.text.toLowerCase()];
      } else if (token.text.toLowerCase() === 'ne' && token.hasenclitic) {
        accented = ['ne'];
        } else {
          // Try wordlist: get all entries for this wordform
          let entries: WordlistEntry[] = [];
          try {
            entries = await wordlistEngine.getAllEntries(wordformLower);
          } catch (error) {
            // Wordlist lookup failed (e.g., IndexedDB error); treat as unknown
            console.warn('getAllEntries error for', wordformLower, error);
            entries = [];
          }
          // DEBUG logging for problematic words
          const debugWords = ['matrona', 'longissime', 'minime', 'sequana', 'eos', 'hi'];
          const shouldLog = debugWords.includes(wordformLower);
          if (shouldLog) {
            console.log(`\n=== DEBUG ${wordformLower} ===`);
            console.log('Token:', token.text, 'Tag:', tag, 'Lemma:', lemma);
            console.log('Entries count:', entries.length);
          }
          if (entries.length > 0) {
          const allAccented = entries.map(e => e.accentedUnderscore).filter(a => a !== undefined) as string[];
          const uniqueAccented = Array.from(new Set(allAccented));
          if (uniqueAccented.length === 1) {
            accented = [uniqueAccented[0]];
            if (shouldLog) console.log('Single candidate:', accented[0]);
          } else {
            // Multiple candidates: rank them
            const candidates: Array<{ casedist: number; tagdist: number; lemdist: number; accented: string }> = [];
            for (const entry of entries) {
              if (!entry.accentedUnderscore) continue;
              const lexLemma = entry.lemma;
              const lexTag = entry.tag;
              const lexIsTitle = isTitleCase(lexLemma);
              const tokenIsTitle = isTitleCase(token.text);
              const casedist = (tokenIsTitle === lexIsTitle || (token.startssentence && tokenIsTitle)) ? 0 : 1;
              const tagdist = tagDistance(tag, lexTag);
              const lemdist = levenshteinDistance(lemma, lexLemma);
              candidates.push({ casedist, tagdist, lemdist, accented: entry.accentedUnderscore });
              if (shouldLog) {
                console.log(`  Entry: lemma=${lexLemma}, tag=${lexTag}, accented=${entry.accentedUnderscore}`);
                console.log(`    -> casedist=${casedist}, tagdist=${tagdist}, lemdist=${lemdist}`);
              }
            }
            // Sort by casedist, then tagdist, then lemdist (exact match to Python)
            candidates.sort((a, b) => {
              if (a.casedist !== b.casedist) return a.casedist - b.casedist;
              if (a.tagdist !== b.tagdist) return a.tagdist - b.tagdist;
              return a.lemdist - b.lemdist;
            });
            if (candidates.length > 0) {
              // Already sorted by (casedist, tagdist, lemdist)
              // Get all candidates with the best (lowest) casedist
              const bestCasedist = candidates[0].casedist;
              // Sort by full ranking again to ensure best (tagdist, lemdist) comes first
              const bestCandidates = candidates
                .filter(c => c.casedist === bestCasedist)
                .sort((a, b) => {
                  if (a.tagdist !== b.tagdist) return a.tagdist - b.tagdist;
                  return a.lemdist - b.lemdist;
                });
              // Extract accented forms preserving order
              const bestAccented = bestCandidates.map(c => c.accented);
              // Deduplicate while preserving order
              const seen = new Set<string>();
              const uniq: string[] = [];
              for (const acc of bestAccented) {
                if (!seen.has(acc)) {
                  seen.add(acc);
                  uniq.push(acc);
                }
              }
              accented = uniq;
              isAmbiguous = uniq.length > 1;
              if (shouldLog) {
                console.log(`Sorted candidates (first 5):`, candidates.slice(0, 5));
                console.log(`Selected first: ${accented[0]}, ambiguous=${isAmbiguous}`);
              }
            } else {
              accented = [token.text];
            }
          }
        } else {
          // Unknown word: try ending patterns
          isUnknown = true;
          accented = [token.text];
          if (/[aeiouy]/i.test(token.text)) {
            const patterns = endingEngine.getPatterns(token.text, tag);
            for (const pattern of patterns) {
              const plainEnding = pattern.suffix;
              if (wordformLower.endsWith(plainEnding)) {
                const originalLower = token.text.toLowerCase();
                const stemOriginal = originalLower.slice(0, -plainEnding.length);
                // Convert Unicode macron in replacement to underscore notation for accented field
                const replacementUnderscore = unicodeToUnderscore(pattern.replacement);
                const candidate = stemOriginal + replacementUnderscore;
                accented = [candidate];
                break;
              }
            }
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
    console.log(`[macronize] START: tokens=${this.tokens.length}, domacronize=${domacronize}`);
    const debugWords = ['matrona', 'matrona'];
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      const shouldLog = debugWords.includes(token.text.toLowerCase());
      if (shouldLog) console.log(`[macronize] Processing token[${i}]: "${token.text}", isWord=${(token as any).isWord}`);
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
    // DEBUG logging for problematic words - EARLY
    const debugWordsAlign = ['matrona', 'longissime', 'minime', 'sequana', 'eos', 'hi', 'matrona'];
    const shouldLogAlign = debugWordsAlign.includes(token.text.toLowerCase());
    if (shouldLogAlign) {
      console.log(`\n[macronizeToken] START: token="${token.text}", domacronize=${domacronize}`);
    }
    
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
      if (shouldLogAlign) console.log(`  domacronize=false, returning early with text="${text}"`);
      return token.with({ text, macronized: true } as any);
    }
    
    // Get the accented form (with _ markers) from getAccents
    const accentedCandidates = token.accented;
    
    if (shouldLogAlign) {
      console.log(`  accentedCandidates:`, accentedCandidates);
    }
    
    if (!accentedCandidates || accentedCandidates.length === 0) {
      // No accented form available, fallback
      if (shouldLogAlign) console.log(`  ${token.text}: NO accented candidates, fallback to plain`);
      return token.with({ text, macronized: true } as any);
    }
    
    // Use the first (best) accented candidate
    let accentedUnderscore = accentedCandidates[0];
    if (shouldLogAlign) {
      console.log(`\n=== ALIGN ${token.text} ===`);
      console.log('  Input text:', text);
      console.log('  Accented candidates:', accentedCandidates);
      console.log('  Selected accented[0]:', accentedUnderscore);
    }
    
    // Clean: remove '^' markers and '_^' sequences (as in Python Token.macronize)
    // This ensures breve markers are ignored and only macrons (underscore) are used
    // NOTE: In JS regex, '^' is an anchor unless escaped. Use /\^/ for literal caret.
    const accentedBeforeClean = accentedUnderscore;
    accentedUnderscore = accentedUnderscore.replace(/_\^/g, '').replace(/\^/g, '');
    if (shouldLogAlign && accentedBeforeClean !== accentedUnderscore) {
      console.log('  After breve cleaning:', accentedUnderscore);
    }

    // Apply alsomaius: add macron before 'j' (or 'i') after short vowel, unless prefix with short j
    // Ported from Python Token.macronize: if domacronize and alsomaius and 'j' in accented:
    // NOTE: Python wordlist uses 'j' orthography, but our macrons.txt uses 'i' orthography.
    // Match BOTH 'i' and 'j' between vowels to handle both cases (bug fix).
    if (alsomaius && /[ij]/.test(accentedUnderscore)) {
      const lowerAcc = accentedUnderscore.toLowerCase();
      const startsWithShortJ = prefixesWithShortJ.some(prefix => lowerAcc.startsWith(prefix));
      if (!startsWithShortJ) {
        // Insert underscore between vowel and 'i'/'j' followed by vowel
        // e.g., "maior" → "ma_ior" (wordlist 'i') or "major" → "ma_jor" (Morpheus 'j')
        accentedUnderscore = accentedUnderscore.replace(/([aeiouy])([ij][aeiouy])/gi, '$1_$2');
        if (shouldLogAlign) {
          console.log('  After alsomaius:', accentedUnderscore);
        }
      }
    }

    // If accented form became empty after cleaning, fallback to plain text
    if (!accentedUnderscore) {
      if (shouldLogAlign) console.log('  Accented became empty after cleaning, fallback to plain');
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
    if (shouldLogAlign) {
      console.log('  DP result (underscore):', macronizedUnderscore);
      console.log('  DP result (unicode):', macronizedUnderscore ? underscoreToUnicode(macronizedUnderscore) : 'null');
    }
    
    let macronizedUnicode: string;
    if (macronizedUnderscore === null) {
      // Alignment failed, fallback: convert accentedUnderscore directly
      macronizedUnicode = underscoreToUnicode(accentedUnderscore);
    } else {
      macronizedUnicode = underscoreToUnicode(macronizedUnderscore);
    }

    // Apply u→v and i→j conversions to non-macronized characters only.
    // Macronized vowels (ū, ī) are preserved as vowels; plain 'u'/'i' → 'v'/'j'.
    // The DP already produces 'v'/'j' from wordlist accented forms for consonantal
    // positions (via subCost=1). This handles remaining cases like "lupus" → "lvpus".
    if (performutov) {
      // Convert only plain 'u'/'U', NOT macronized 'ū'/'Ū'
      macronizedUnicode = macronizedUnicode
        .replace(/u/g, 'v').replace(/U/g, 'V');
    }
    if (performitoj) {
      // Convert only plain 'i'/'I', NOT macronized 'ī'/'Ī'
      macronizedUnicode = macronizedUnicode
        .replace(/i/g, 'j').replace(/I/g, 'J');
    }

    if (shouldLogAlign) {
      console.log(`  Final unicode: "${macronizedUnicode}"`);
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
