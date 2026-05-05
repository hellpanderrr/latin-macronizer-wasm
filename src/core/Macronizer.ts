/**
 * Macronizer.ts
 * Core macronization engine integrating WASM RFTagger with Latin rules
 * Orchestrates tokenization, POS tagging, and vowel length assignment
 */

import { Token } from './Token';
import { Tokenizer } from './Tokenizer';
import { Tokenization } from './Tokenization';
import { WasmTagger, FallbackTagger } from '../analysis/WasmTagger';
import { LemmaEngine } from '../analysis/LemmaEngine';
import { EndingPatternEngine } from '../analysis/EndingPatternEngine';
import { EditDistanceEngine } from '../analysis/EditDistanceEngine';
import { WordlistEngine } from '../analysis/WordlistEngine';
import { MorpheusAnalyzer } from '../analysis/MorpheusAnalyzer';

export interface MacronizerOptions {
  useWasm?: boolean;
  wasmModelPath?: string;
  enableCache?: boolean;
  confidenceThreshold?: number;
  wordlistUrl?: string; // URL to load wordlist from
  morpheusWasmPath?: string; // Path to Morpheus WASM module
}

export interface MacronizeResult {
  original: string;
  macronized: string;
  tokens: Token[];
  taggedTokens: Token[];
  confidence: number;
  processingTime: number;
}

/**
 * Main macronization engine
 * Coordinates all components for Latin text processing
 */
export class Macronizer {
  private tokenizer: Tokenizer;
  private tokenization: Tokenization;
  private tagger: WasmTagger | FallbackTagger;
  private lemmaEngine: LemmaEngine;
  private endingEngine: EndingPatternEngine;
  private editDistanceEngine: EditDistanceEngine;
  private wordlistEngine: WordlistEngine;
  private morpheusAnalyzer: MorpheusAnalyzer | null = null;
  private useWasm: boolean;
  private confidenceThreshold: number;
  private cache: Map<string, MacronizeResult>;
  private wordlistUrl?: string;
  private morpheusWasmPath?: string;

  constructor(options: MacronizerOptions = {}) {
    this.useWasm = options.useWasm ?? true;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.80;
    this.cache = new Map();

    this.tokenizer = new Tokenizer();
    this.tokenization = new Tokenization('', { preserveWhitespace: true });
    this.lemmaEngine = new LemmaEngine();
    this.endingEngine = new EndingPatternEngine();
    this.editDistanceEngine = new EditDistanceEngine();
    this.wordlistEngine = new WordlistEngine();
    this.wordlistUrl = options.wordlistUrl;
    this.morpheusWasmPath = options.morpheusWasmPath || 'public/wasm/cruncher.js';

    // Initialize tagger based on configuration
    if (this.useWasm) {
      this.tagger = new WasmTagger({
        modelPath: options.wasmModelPath,
        enableCache: options.enableCache ?? true,
      });
    } else {
      this.tagger = new FallbackTagger();
    }

    // Initialize Morpheus for unknown word analysis
    this.morpheusAnalyzer = new MorpheusAnalyzer(this.morpheusWasmPath);
  }

  /**
   * Initialize the macronizer (load WASM module if enabled)
   */
  async initialize(): Promise<void> {
    if (this.useWasm) {
      const wasmTagger = this.tagger as WasmTagger;
      await wasmTagger.initialize();
    }

    // Load lemma dictionary and patterns
    await this.lemmaEngine.load();
    await this.endingEngine.load();
    
    // Initialize Morpheus and connect to WordlistEngine
    if (this.morpheusAnalyzer) {
      await this.morpheusAnalyzer.initialize();
      this.wordlistEngine.setMorpheusAnalyzer(this.morpheusAnalyzer);
      console.log('[Macronizer] Morpheus initialized and connected to WordlistEngine');
    }
    
    // Load wordlist if URL provided
    if (this.wordlistUrl) {
      const isPopulated = await this.wordlistEngine.isPopulated();
      if (!isPopulated) {
        console.log('Loading wordlist into IndexedDB...');
        await this.wordlistEngine.loadFromUrl(this.wordlistUrl, (count) => {
          if (count % 10000 === 0) {
            console.log(`Loaded ${count} wordlist entries...`);
          }
        });
        console.log(`Wordlist loaded: ${this.wordlistEngine.size()} entries`);
      } else {
        console.log(`Wordlist already in IndexedDB: ${this.wordlistEngine.size()} entries`);
      }
    }
  }

  /**
   * Macronize Latin text
   * Main entry point for text processing
   * Uses Tokenization pipeline with DP alignment
   */
  async macronize(text: string): Promise<MacronizeResult> {
    const startTime = performance.now();

    // Check cache
    const cacheKey = text;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Step 1: Tokenize (preserve whitespace for accurate reconstruction)
    const tokenization = new Tokenization(text, { preserveWhitespace: true });
    const originalTokens = tokenization.tokens.map(t => t.with({}));

    // Step 2: POS Tagging (WASM or fallback)
    if (this.useWasm && (this.tagger as WasmTagger).isReady()) {
      await tokenization.tagWithWasm(this.tagger as WasmTagger);
    } else {
      const wordsToTag = tokenization.allWordForms();
      const fallbackResults = (this.tagger as FallbackTagger).tag(wordsToTag);
      tokenization.addTags(fallbackResults.map(r => ({ word: r.token, tag: r.tag })));
    }

    // Step 3: Add lemmas
    tokenization.addLemmas(this.lemmaEngine);

    // Step 4: Get accents (wordlist lookup + candidate ranking)
    await tokenization.getAccents(this.wordlistEngine, this.endingEngine);

    // Step 5: Macronize (DP alignment with alsomaius)
    console.log('[Macronizer] Calling tokenization.macronize()...');
    tokenization.macronize(true, true, false, false, this.endingEngine);
    console.log('[Macronizer] tokenization.macronize() done');

    // Final tokens
    const macronizedTokens = tokenization.tokens;

    // Step 6: Reconstruct text
    const macronizedText = tokenization.detokenize();

    // Calculate confidence
    const confidence = this.calculateConfidence(originalTokens, macronizedTokens);

    const result: MacronizeResult = {
      original: text,
      macronized: macronizedText,
      tokens: originalTokens,
      taggedTokens: macronizedTokens,
      confidence,
      processingTime: performance.now() - startTime,
    };

    // Cache result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Tag tokens with POS tags
   */
  private async tagTokens(tokens: Token[]): Promise<Token[]> {
    // Filter only word tokens (exclude punctuation, numbers)
    const wordTokens = tokens.filter(t => this.isWordToken(t));
    const tokenTexts = wordTokens.map(t => t.text.toLowerCase());

    if (tokenTexts.length === 0) {
      return tokens;
    }

    try {
      // Use WASM tagger if available
      if (this.useWasm && (this.tagger as WasmTagger).isReady()) {
        const tagResults = (this.tagger as WasmTagger).tag(tokenTexts);
        
        // Map tags back to word tokens only
        let resultIdx = 0;
        return tokens.map((token) => {
          if (!this.isWordToken(token)) {
            // Non-word tokens keep their original tag (or empty)
            return token.with({ tag: 'u.-.-.-.-.-.-.-.-' });
          }
          
          const tagResult = tagResults[resultIdx++];
          return token.with({
            tag: tagResult.tag,
            confidence: tagResult.confidence,
          });
        });
      } else {
        // Fallback to JavaScript tagger
        const tagResults = (this.tagger as FallbackTagger).tag(tokenTexts);
        
        let resultIdx = 0;
        return tokens.map((token) => {
          if (!this.isWordToken(token)) {
            return token.with({ tag: 'u.-.-.-.-.-.-.-.-' });
          }
          
          const tagResult = tagResults[resultIdx++];
          return token.with({
            tag: tagResult.tag,
          });
        });
      }
    } catch (error) {
      console.warn('POS tagging failed, using fallback:', error);
      // Fallback to morphological analysis
      return this.fallbackTagging(tokens);
    }
  }

  /**
   * Check if token is a word (not punctuation or number)
   */
  private isWordToken(token: Token): boolean {
    const text = token.text;
    // Must contain at least one letter
    return /[a-zA-Z\u00C0-\u024F]/.test(text);
  }

  /**
   * Fallback tagging using morphological rules
   */
  private fallbackTagging(tokens: Token[]): Token[] {
    return tokens.map(token => {
      const tag = this.endingEngine.inferTag(token.text);
      return token.with({ tag });
    });
  }

  /**
   * Apply macronization to tagged tokens
   */
  private async applyMacronization(tokens: Token[]): Promise<Token[]> {
    const results: Token[] = [];

    for (const token of tokens) {
      const macronized = await this.macronizeToken(token);
      results.push(macronized);
    }

    return results;
  }

  /**
   * Macronize a single token
   * Priority: Wordlist → Lemma lookup → Pattern matching → Edit distance → Heuristics
   */
  private async macronizeToken(token: Token): Promise<Token> {
    // Skip punctuation and numbers
    if (token.isPunctuation() || token.isNumber()) {
      return token.with({ macronized: true });
    }

    const text = token.text;
    const tag = token.tag;

    // Step 0: Wordlist lookup with Morpheus fallback for unknown words
    const wordlistResult = await this.wordlistEngine.lookupOrAnalyze(text, tag);
    if (wordlistResult) {
      return token.with({
        text: wordlistResult,
        macronized: true,
        confidence: 0.95
      });
    }

    // Step 1: Lemma dictionary lookup
    const lemmaResult = this.lemmaEngine.lookup(text, tag);
    if (lemmaResult) {
      return token.with({
        macronized: true,
        lemma: lemmaResult.lemma,
      });
    }

    // Step 2: Ending pattern matching
    const patternResult = this.endingEngine.apply(text, tag);
    if (patternResult) {
      return token.with({
        text: patternResult,
        macronized: true,
      });
    }

    // Step 3: Edit distance to known forms
    const editResult = this.editDistanceEngine.findClosest(text, tag);
    if (editResult && editResult.distance <= 2) {
      return token.with({
        text: editResult.word,
        macronized: true,
      });
    }

    // Step 4: Heuristic rules based on POS tag
    const heuristicResult = this.applyHeuristics(text, tag);
    if (heuristicResult) {
      return token.with({
        text: heuristicResult,
        macronized: true,
      });
    }

    // Return unchanged if no macronization possible
    return token.with({ macronized: true });
  }

  /**
   * Apply heuristic rules for vowel length
   */
  private applyHeuristics(word: string, tag: string): string | null {
    const lower = word.toLowerCase();
    
    // Verbs: long vowels in certain positions
    if (tag.charAt(0) === 'v') {
      // Infinitives often have long vowels
      if (lower.endsWith('re') || lower.endsWith('ēre')) {
        return this.ensureLongVowel(word, -3);
      }
    }

    // Nouns: common patterns
    if (tag.charAt(0) === 'n') {
      // First declension nominative singular often long
      if (lower.endsWith('a') && !lower.endsWith('ia')) {
        return this.ensureLongVowel(word, -2);
      }
    }

    return null;
  }

  /**
   * Ensure vowel at position is long (add macron)
   */
  private ensureLongVowel(word: string, position: number): string {
    const idx = position < 0 ? word.length + position : position;
    if (idx < 0 || idx >= word.length) return word;

    const vowel = word[idx].toLowerCase();
    if ('aeiouy'.includes(vowel)) {
      const macronMap: { [key: string]: string } = {
        'a': 'ā', 'e': 'ē', 'i': 'ī', 'o': 'ō', 'u': 'ū', 'y': 'ȳ',
      };
      return word.substring(0, idx) + macronMap[vowel] + word.substring(idx + 1);
    }

    return word;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(tokens: Token[], macronized: Token[]): number {
    let totalConfidence = 0;
    let count = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const mac = macronized[i];

      // High confidence for lemma matches
      if (this.lemmaEngine.hasLemma(token.text)) {
        totalConfidence += 0.95;
      }
      // Medium confidence for pattern matches
      else if (this.endingEngine.hasPattern(token.text)) {
        totalConfidence += 0.85;
      }
      // Lower confidence for edit distance
      else if (mac.text !== token.text) {
        totalConfidence += 0.75;
      }
      // Default confidence
      else {
        totalConfidence += 0.60;
      }

      count++;
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  /**
   * Batch process multiple texts
   */
  async macronizeBatch(texts: string[]): Promise<MacronizeResult[]> {
    const results: MacronizeResult[] = [];

    for (const text of texts) {
      const result = await this.macronize(text);
      results.push(result);
    }

    return results;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    if (this.useWasm) {
      (this.tagger as WasmTagger).clearCache();
    }
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    if (this.useWasm) {
      return (this.tagger as WasmTagger).isReady();
    }
    return true;
  }

  /**
   * Destroy resources
   */
  destroy(): void {
    if (this.useWasm) {
      (this.tagger as WasmTagger).destroy();
    }
    this.wordlistEngine.close();
    this.cache.clear();
  }
}
