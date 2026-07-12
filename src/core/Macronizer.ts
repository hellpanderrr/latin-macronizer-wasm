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
import { toAscii } from '../utils/latin';
import { MeterAutomaton } from './Scansion';

// Import meters data
import metersData from '../data/meters.json';

export interface MacronizerOptions {
  useWasm?: boolean;
  wasmModelPath?: string;
  wasmPath?: string;      // Path to the WASM JavaScript wrapper
  enableCache?: boolean;
  confidenceThreshold?: number;
  wordlistUrl?: string; // URL to load wordlist from
  morpheusWasmPath?: string; // Path to Morpheus WASM module
}

export interface MacronizeOptions {
  macronize?: boolean;
  alsomaius?: boolean;
  performutov?: boolean;
  performitoj?: boolean;
  scan?: string; // Meter: 'dactylichexameter', 'elegiacdistichs', 'hendecasyllable', 'iambic', or 'prose'
}

export interface Statistics {
  totalWords: number;
  knownWords: number;
  unknownWords: number;
  ambiguousForms: number;
}

export interface MacronizeOptions {
  macronize?: boolean;
  alsomaius?: boolean;
  performutov?: boolean;
  performitoj?: boolean;
  scan?: string;
}

export interface MacronizeResult {
  original: string;
  macronized: string;
  tokens: Token[];
  taggedTokens: Token[];
  confidence: number;
  processingTime: number;
  statistics: Statistics;
  scannedFeet?: string[];  // Scansion feet per verse (if scan option set)
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
    this.morpheusWasmPath = options.morpheusWasmPath || '../wasm/cruncher.js';

    // Initialize tagger based on configuration
     if (this.useWasm) {
       this.tagger = new WasmTagger({
         modelPath: options.wasmModelPath,
         wasmPath: options.wasmPath,
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
  async initialize(onProgress?: (percent: number, message: string) => void): Promise<void> {
    if (this.useWasm) {
      onProgress?.(5, 'Loading RFTagger WASM...');
      const wasmTagger = this.tagger as WasmTagger;
      await wasmTagger.initialize();
    }

    onProgress?.(15, 'Loading lemma dictionary...');
    await this.lemmaEngine.load();
    await this.endingEngine.load();

    // Initialize Morpheus and connect to WordlistEngine
    if (this.morpheusAnalyzer) {
      onProgress?.(20, 'Initializing Morpheus...');
      await this.morpheusAnalyzer.initialize();
      this.wordlistEngine.setMorpheusAnalyzer(this.morpheusAnalyzer);
      console.log('[Macronizer] Morpheus initialized and connected to WordlistEngine');
    }

    // Load wordlist if URL provided
    console.log('[Macronizer] wordlistUrl:', this.wordlistUrl);
    if (this.wordlistUrl) {
      console.log('[Macronizer] Checking if wordlist is populated...');
      const isPopulated = await this.wordlistEngine.isPopulated();
      console.log('[Macronizer] isPopulated:', isPopulated, 'size:', this.wordlistEngine.size());
      if (!isPopulated) {
        console.log('[Macronizer] Loading wordlist from:', this.wordlistUrl);
        onProgress?.(25, 'Loading wordlist...');
        await this.wordlistEngine.loadFromUrl(this.wordlistUrl, (count) => {
          // Map 0..812k entries → 25..95%
          const percent = 25 + Math.round(count / 812588 * 70);
          onProgress?.(percent, `Loading wordlist: ${count.toLocaleString()} entries...`);
        });
        console.log(`[Macronizer] Wordlist loaded: ${this.wordlistEngine.size()} entries`);
      } else {
        console.log(`[Macronizer] Wordlist already in IndexedDB: ${this.wordlistEngine.size()} entries`);
      }
    } else {
      console.warn('[Macronizer] No wordlistUrl set, wordlist will not be loaded!');
    }

    onProgress?.(95, 'Finalizing...');
  }

  /**
   * Macronize Latin text
   * Main entry point for text processing
   * Uses Tokenization pipeline with DP alignment
   */
  async macronize(text: string, options: MacronizeOptions = {}): Promise<MacronizeResult> {
    const startTime = performance.now();

    // Clear the wordlist entry cache so each macronize() starts fresh.
    // The cache repopulates on the first pass (ensureAnalyzed) and serves
    // subsequent passes (addLemmas, getAccents) without redundant IDB trips.
    this.wordlistEngine.clearEntriesCache();

    // Default options
    const doMacronize = options.macronize !== false; // default true
    const alsomaius = options.alsomaius === true; // default false
    const performutov = options.performutov === true; // default false
    const performitoj = options.performitoj === true; // default false
    const scanOption = options.scan || 'prose'; // default: no scansion

    // Check cache (key includes options to avoid returning stale results)
    const cacheKey = `${text}|m=${doMacronize}|a=${alsomaius}|v=${performutov}|j=${performitoj}|s=${scanOption}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Step 1: Tokenize (preserve whitespace for accurate reconstruction)
    const tokenization = new Tokenization(text, { preserveWhitespace: true });
    const originalTokens = tokenization.tokens.map(t => t.with({}));

    // Step 1.5: Split enclitics (deferred, Python-compatible strategy)
    const splitWordForms = await tokenization.splitEnclitics(this.wordlistEngine);

    // Step 1.75: Pre-analyze unknown words with Morpheus (matches Python wordlist.loadwords())
    const allWordForms = [
      ...tokenization.allWordForms(),
      ...splitWordForms
    ];
    await this.wordlistEngine.ensureAnalyzed(allWordForms);

    // Mark tokens as analyzed by Morpheus and attach full Morpheus results for UI display
    // Only tokens for words that were actually analyzed by Morpheus (not just in wordlist) get morpheusAnalyzed=true
    for (let i = 0; i < tokenization.tokens.length; i++) {
      const t = tokenization.tokens[i];
      if ((t as any).isWord && !(t as any).isenclitic) {
        // Normalize same way as ensureAnalyzed (toAscii + lowercase + trim) for cache lookup
        const wordNorm = toAscii(t.text).toLowerCase().trim();
        // Check if this word has Morpheus analysis cached (i.e., was unknown and analyzed)
        if (this.wordlistEngine.hasMorpheusAnalysis(wordNorm)) {
          const morpheusResults = this.wordlistEngine.getMorpheusAnalysis(wordNorm);
          tokenization.tokens[i] = t.with({
            morpheusAnalyzed: true,
            morpheusResults: morpheusResults ?? null
          } as any);
        }
      }
    }

    // Step 2: POS Tagging (WASM or fallback)
    if (this.useWasm && (this.tagger as WasmTagger).isReady()) {
      const t0 = performance.now();
      await tokenization.tagWithWasm(this.tagger as WasmTagger);
      console.error(`WASM tag: ${(performance.now() - t0).toFixed(0)}ms`);
    } else {
      const wordsToTag = tokenization.allWordForms();
      const fallbackResults = (this.tagger as FallbackTagger).tag(wordsToTag);
      tokenization.addTags(fallbackResults.map(r => ({ word: r.token, tag: r.tag })));
    }

    // Step 3: Add lemmas (two-tier: corpus lookup + wordlist frequency fallback)
    await tokenization.addLemmas(this.lemmaEngine, this.wordlistEngine);

    // Step 4: Get accents (wordlist lookup + candidate ranking)
    await tokenization.getAccents(this.wordlistEngine, this.endingEngine);

    // Step 4.5: Scansion (reorder accented candidates for best meter fit)
    let scannedFeet: string[] = [];
    if (scanOption !== 'prose') {
      const allMeters = metersData as unknown as Record<string, MeterAutomaton>;
      // Compound meter dispatch: some options alternate between two meters
      const meterMap: Record<string, MeterAutomaton[]> = {
        'dactylichexameter': [allMeters['dactylichexameter']],
        'hendecasyllable': [allMeters['hendecasyllable']],
        'elegiacdistichs': [allMeters['dactylichexameter'], allMeters['dactylicpentameter']],
        'iambic': [allMeters['iambictrimeter'], allMeters['iambicdimeter']],
      };
      const automatons = meterMap[scanOption];
      if (automatons) {
        const meterNames = automatons.map(a => Object.keys(a)[0]?.split("'")[1] ?? '?').join(', ');
        console.log(`[Macronizer] Scanning verse as ${scanOption} (${meterNames})...`);
        tokenization.scanVerses(automatons);
        scannedFeet = tokenization.scannedFeet;
        console.log(`[Macronizer] Scansion complete: ${scannedFeet.length} verse(s) scanned`);
      }
    }

    // Step 5: Macronize (DP alignment with alsomaius)
    console.log('[Macronizer] Calling tokenization.macronize()...');
    tokenization.macronize(doMacronize, alsomaius, performutov, performitoj, this.endingEngine);
    console.log('[Macronizer] tokenization.macronize() done');

    // Final tokens
    const macronizedTokens = tokenization.tokens;

    // Step 6: Reconstruct text
    const macronizedText = tokenization.detokenize();

    // Calculate confidence
    const confidence = this.calculateConfidence(originalTokens, macronizedTokens);

    // Calculate statistics
    const statistics = this.calculateStatistics(originalTokens, macronizedTokens);

    const result: MacronizeResult = {
      original: text,
      macronized: macronizedText,
      tokens: originalTokens,
      taggedTokens: macronizedTokens,
      confidence,
      processingTime: performance.now() - startTime,
      statistics,
      scannedFeet: scannedFeet.length > 0 ? scannedFeet : undefined,
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
   * Calculate statistics about the macronization
   */
  private calculateStatistics(tokens: Token[], macronized: Token[]): Statistics {
    let totalWords = 0;
    let knownWords = 0;
    let unknownWords = 0;
    let ambiguousForms = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const mac = macronized[i];

      // Skip punctuation and non-word tokens
      if (!this.isWordToken(token)) {
        continue;
      }

      totalWords++;

      // Check if known (has lemma or pattern match)
      if (this.lemmaEngine.hasLemma(token.text) || this.endingEngine.hasPattern(token.text)) {
        knownWords++;
      } else {
        unknownWords++;
      }

      // Check if ambiguous (original has diacritics or multiple forms)
      if ((mac as any).isAmbiguous || (mac as any).accented?.length > 1) {
        ambiguousForms++;
      }
    }

    return {
      totalWords,
      knownWords,
      unknownWords,
      ambiguousForms,
    };
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

  /**
   * Load wordlist (exposed for API — used when wordlist not loaded during initialize).
   */
  async loadWordlist(onProgress?: (progress: any) => void): Promise<void> {
    if (!this.wordlistUrl) {
      throw new Error('No wordlistUrl configured');
    }
    const isPopulated = await this.wordlistEngine.isPopulated();
    if (isPopulated) {
      console.log('[Macronizer] Wordlist already loaded, skipping');
      return;
    }
    await this.wordlistEngine.loadFromUrl(this.wordlistUrl, (count) => {
      if (onProgress) {
        onProgress({ phase: 'parse', current: count, total: 812588 });
      }
    });
  }

  isWordlistLoaded(): boolean {
    return this.wordlistEngine.size() > 0;
  }

  getWordlistMode(): string {
    // Always 'indexeddb' — the wordlist engine always uses IndexedDB when available
    return 'indexeddb';
  }

  async clearWordlistCache(): Promise<void> {
    this.wordlistEngine.close();
    // Reload needed after clear
  }
}
