/**
 * Macronizer.ts
 * Core macronization engine integrating WASM RFTagger with Latin rules
 * Orchestrates tokenization, POS tagging, and vowel length assignment
 */

import { Token } from './Token';
import { Tokenization } from './Tokenization';
import { WasmTagger, FallbackTagger } from '../analysis/WasmTagger';
import { LemmaEngine } from '../analysis/LemmaEngine';
import { EndingPatternEngine } from '../analysis/EndingPatternEngine';
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

export interface MacronizeResult {
  original: string;
  macronized: string;
  tokens: Token[];
  taggedTokens: Token[];
  /** Word coverage fraction (0..1): proportion recognized by lemma/pattern engine.
   *  NOT a probabilistic confidence score — a word known to the lemma engine
   *  contributes 0.95, a pattern match 0.85, an unknown word 0.60. */
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
  private tagger: WasmTagger | FallbackTagger;
  private lemmaEngine: LemmaEngine;
  private endingEngine: EndingPatternEngine;
  private wordlistEngine: WordlistEngine;
  private morpheusAnalyzer: MorpheusAnalyzer | null = null;
  private useWasm: boolean;
  private cache: Map<string, MacronizeResult>;
  private wordlistUrl?: string;
  private morpheusWasmPath?: string;

  constructor(options: MacronizerOptions = {}) {
    this.useWasm = options.useWasm ?? true;
    this.cache = new Map();

    this.lemmaEngine = new LemmaEngine();
    this.endingEngine = new EndingPatternEngine();
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

    // Check cache (hashing the text avoids multi-kilobyte cache keys)
    const textHash = hashFnv32(text);
    const cacheKey = `${textHash}|m=${doMacronize}|a=${alsomaius}|v=${performutov}|j=${performitoj}|s=${scanOption}`;
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
      if (t.isWord && !t.isenclitic) {
        // Normalize same way as ensureAnalyzed (toAscii + lowercase + trim) for cache lookup
        const wordNorm = toAscii(t.text).toLowerCase().trim();
        // Check if this word has Morpheus analysis cached (i.e., was unknown and analyzed)
        if (this.wordlistEngine.hasMorpheusAnalysis(wordNorm)) {
          const morpheusResults = this.wordlistEngine.getMorpheusAnalysis(wordNorm);
          tokenization.tokens[i] = t.with({
            morpheusAnalyzed: true,
            morpheusResults: morpheusResults ?? null
          });
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
        console.log(`[Macronizer] Scanning verse as ${scanOption}...`);
        tokenization.scanVerses(automatons);
        scannedFeet = tokenization.scannedFeet;
        console.log(`[Macronizer] Scansion complete: ${scannedFeet.length} verse(s) scanned`);
      }
    }

    // Step 5: Macronize (DP alignment with alsomaius)
    tokenization.macronize(doMacronize, alsomaius, performutov, performitoj);

    // Final tokens
    const macronizedTokens = tokenization.tokens;

    // Step 6: Reconstruct text
    const macronizedText = tokenization.detokenize();

    // Calculate word coverage (fraction of tokens recognized by lemma or pattern engine)
    const coverage = this.calcCoverage(originalTokens, macronizedTokens);
    const statistics = this.calculateStatistics(originalTokens, macronizedTokens);

    const result: MacronizeResult = {
      original: text,
      macronized: macronizedText,
      tokens: originalTokens,
      taggedTokens: macronizedTokens,
      confidence: coverage,
      processingTime: performance.now() - startTime,
      statistics,
      scannedFeet,
    };

    // Cache result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Calculate word coverage fraction: what proportion of tokens are recognized
   * by the lemma or ending-pattern engine.  This is NOT a probabilistic
   * confidence score — it measures whether each token was even known to any
   * lookup table.  A word that hits the lemma engine gets 0.95, a word that
   * only matches an ending pattern gets 0.85, and an entirely unknown word
   * gets 0.60.  These are arbitrary labels, not Viterbi beam probabilities.
   */
  private calcCoverage(tokens: Token[], macronized: Token[]): number {
    let totalConfidence = 0;
    let count = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // High confidence for lemma matches
      if (this.lemmaEngine.hasLemma(token.text)) {
        totalConfidence += 0.95;
      }
      // Medium confidence for pattern matches
      else if (this.endingEngine.hasPattern(token.text)) {
        totalConfidence += 0.85;
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
      if (!token.isWord) {
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
      if (mac.isAmbiguous || (mac.accented && mac.accented.length > 1)) {
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

  getWordlistEntryCount(): number {
    return this.wordlistEngine.size();
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

/**
 * FNV-1a 32-bit hash — fast, deterministic, keeps cache keys short
 * even when the input text spans thousands of characters.
 */
function hashFnv32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Return unsigned hex to keep the key readable
  return (h >>> 0).toString(16);
}
