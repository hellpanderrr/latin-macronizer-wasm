/**
 * MacronizerAPI.ts
 * Simple API wrapper for the Latin Macronizer (used by index.html)
 * Imports compiled TypeScript modules from dist/ and exposes a clean interface
 */

import { Macronizer } from '../core/Macronizer.js';
import { WasmTagger } from '../analysis/WasmTagger.js';
import { LemmaEngine } from '../analysis/LemmaEngine.js';
import { EndingPatternEngine } from '../analysis/EndingPatternEngine.js';
import { WordlistEngine } from '../analysis/WordlistEngine.js';
import { MorpheusAnalyzer } from '../analysis/MorpheusAnalyzer.js';

export class MacronizerAPI {
  private macronizer: Macronizer | null = null;
  private initialized: boolean = false;

  constructor() {
    this.macronizer = null;
    this.initialized = false;
  }

  async initialize(onProgress?: (percent: number, message: string) => void): Promise<void> {
    if (this.initialized) return;

    console.log('[MacronizerAPI] initialize() called');

    // Create macronizer with default options
     this.macronizer = new Macronizer({
       useWasm: true,
       enableCache: true,
       confidenceThreshold: 0.80,
       // Paths relative to Vite server root (public/ serves as /)
       wasmModelPath: '/wasm/rftagger-ldt.model',  // Path to the model file
       wasmPath: '/wasm/rftagger.js',               // Path to the JS wrapper
       morpheusWasmPath: '/wasm/cruncher.js',
       wordlistUrl: '/macrons.txt'  // ← ADDED: Load wordlist from public/
     });

    console.log('[MacronizerAPI] Macronizer created, wordlistUrl:', '/macrons.txt');

    console.log('[MacronizerAPI] Calling macronizer.initialize()...');
    await this.macronizer.initialize((percent, message) => {
      onProgress?.(percent, message);
    });
    console.log('[MacronizerAPI] macronizer.initialize() completed');

    onProgress?.(100, 'Ready!');
    this.initialized = true;
    console.log('MacronizerAPI: initialized');
  }

  async process(text: string, options: any = {}): Promise<any> {
    if (!this.initialized || !this.macronizer) {
      throw new Error('Macronizer not initialized. Call initialize() first.');
    }

    const result = await this.macronizer.macronize(text, {
      macronize: options.macronize !== false,
      alsomaius: options.alsomaius || false,
      performutov: options.performutov || false,
      performitoj: options.performitoj || false,
      scan: options.scan || 'prose'
    });

    // Convert Token objects to plain JSON for serialization
    const tokens = result.taggedTokens.map((t: any) => ({
      text: t.text,
      tag: t.tag,
      lemma: t.lemma,
      macronizedText: t.macronizedText,
      isAmbiguous: t.isAmbiguous,
      isUnknown: t.isUnknown,
      morpheusAnalyzed: t.morpheusAnalyzed,
      morpheusResults: t.morpheusResults ? {
        word: t.morpheusResults.word,
        analyses: t.morpheusResults.analyses.map((a: any) => ({
          lemma: a.lemma,
          stem: a.stem,
          ending: a.ending,
          accented: a.accented,
          formInfo: a.formInfo,
          raw: a.raw
        })),
        success: t.morpheusResults.success,
        raw: t.morpheusResults.raw
      } : null,
      startIndex: t.startIndex,
      endIndex: t.endIndex,
      accented: t.accented
    }));

    return {
      original: result.original,
      macronized: result.macronized,
      tokens,
      statistics: result.statistics,
      confidence: result.confidence,
      processingTime: result.processingTime,
      scannedFeet: result.scannedFeet
    };
  }

  destroy(): void {
    if (this.macronizer) {
      this.macronizer.destroy();
      this.macronizer = null;
      this.initialized = false;
    }
  }

  isReady(): boolean {
    return this.initialized && this.macronizer !== null && this.macronizer.isReady();
  }

  /**
   * Load wordlist (called from UI). If already loaded during initialize(), this is a no-op.
   * Otherwise, loads from the configured wordlistUrl.
   */
  async loadWordlist(_mode: 'indexeddb' | 'memory', onProgress?: (progress: any) => void): Promise<void> {
    if (!this.macronizer) {
      throw new Error('Macronizer not created. Call initialize() first.');
    }
    console.log(`[MacronizerAPI] loadWordlist(mode=${_mode}) called`);
    await this.macronizer.loadWordlist(onProgress);
  }

  isWordlistLoaded(): boolean {
    return this.macronizer?.isWordlistLoaded() ?? false;
  }

  getWordlistMode(): string {
    return this.macronizer?.getWordlistMode() ?? 'indexeddb';
  }

  async clearWordlistCache(): Promise<void> {
    await this.macronizer?.clearWordlistCache();
  }
}

export default MacronizerAPI;
