/**
 * WasmTagger.ts
 * WebAssembly wrapper for RFTagger statistical POS tagger
 * Uses C++ class API from Emscripten (matching test-full-pipeline.html)
 */

import { resolveAssetUrl } from '../utils/assets.js';

export interface WasmTaggerOptions {
  wasmPath?: string;      // Path to the WASM JavaScript wrapper (default: '../wasm/rftagger.js')
  modelUrl?: string;      // URL to fetch the model from (default: '/wasm/rftagger-ldt.model')
  memorySize?: number;
  enableCache?: boolean;
}

export interface TagResult {
  token: string;
  tag: string;
}

/**
 * WebAssembly-based RFTagger implementation
 * Uses Emscripten C++ class API (new RFTagger(), loadModel(), tagSentences())
 */
export class WasmTagger {
  private wasmModule: any;
  private tagger: any;
  private modelLoaded: boolean = false;
  private cache: Map<string, TagResult[]>;
  private readonly wasmPath: string;
  private readonly wasmDir: string;
  private readonly modelUrl: string;
  private readonly useSentences: boolean;
  private readonly beamSize: number;
  private readonly debugMode: boolean;

  constructor(options: WasmTaggerOptions = {}) {
    const effectiveWasmPath = options.wasmPath || '../wasm/rftagger.js';
    this.wasmPath = effectiveWasmPath;
    this.wasmDir = effectiveWasmPath.substring(0, effectiveWasmPath.lastIndexOf('/') + 1);
    this.modelUrl = options.modelUrl || '/wasm/rftagger-ldt.model';
    this.cache = new Map();
    this.useSentences = true;
    this.beamSize = 0.001;
    this.debugMode = false;
  }

    /**
     * Initialize WASM module and load model
     */
    async initialize(): Promise<void> {
      try {
        this.wasmModule = await this.loadWasmModule();
        await this.wasmModule.ready;
        this.tagger = new this.wasmModule.RFTagger();
        await this.loadModel();
        this.modelLoaded = true;
      } catch (error) {
        console.error('[RFTagger] Initialization failed:', error);
        throw new Error(`Failed to initialize WASM RFTagger: ${error}`);
      }
    }

  /**
   * Load Emscripten-compiled WASM module
   */
  private async loadWasmModule(): Promise<any> {
    if (typeof window === 'undefined') {
      throw new Error('WASM not supported in this environment');
    }

    const globalRFTagger = (window as any).RFTaggerModule;

    if (globalRFTagger && typeof globalRFTagger === 'function') {
      return await globalRFTagger({
        printErr: () => {},
        locateFile: (path: string) =>
          resolveAssetUrl(path, path.endsWith('.model') ? this.modelUrl : this.wasmDir + path)
      });
    }

    try {
      const module = await import(this.wasmPath);
      const exported = (module as any).default || module;

      if (typeof exported === 'function') {
        return await exported({
          locateFile: (path: string) => {
            if (path.endsWith('.wasm') || path.endsWith('.data')) {
              return resolveAssetUrl(path, this.wasmDir + path);
            }
            if (path.endsWith('.model')) {
              return resolveAssetUrl(path, this.modelUrl);
            }
            return path;
          }
        });
      }

      return exported;
    } catch (e) {
      throw new Error(`Failed to load RFTagger WASM module from ${this.wasmPath}: ${e}`);
    }
  }

    /**
     * Load the statistical model
     */
    private async loadModel(): Promise<void> {
      if (!this.tagger) {
        throw new Error('RFTagger instance not created');
      }

      try {
        const response = await fetch(resolveAssetUrl(this.modelUrl, this.modelUrl));
        if (!response.ok) {
          throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
        }
        const modelData = await response.arrayBuffer();
        try { this.wasmModule.FS.mkdir('/models'); } catch (e) {}
        this.wasmModule.FS.writeFile('/models/rftagger-ldt.model', new Uint8Array(modelData));
        this.tagger.loadModel('/models/rftagger-ldt.model', this.useSentences, this.beamSize, this.debugMode);
        this.modelLoaded = true;
      } catch (error) {
        console.error('[RFTagger] Failed to load model:', error);
        throw new Error(`Failed to load model: ${error}`);
      }
    }

  /**
   * Tag a vector of words using the RFTagger statistical model.
   * Returns tags without confidence values — the WASM embind wrapper does not
   * expose beam probabilities.
   */
  tag(tokens: string[]): TagResult[] {
    if (!this.modelLoaded) {
      throw new Error('Model not loaded. Call initialize() first.');
    }

    const cacheKey = tokens.join(' ');
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const sentences = [tokens];
    const results = this.tagger.tagSentences(sentences);

    const sentTags = results.get(0);
    const results_array: TagResult[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const tag = sentTags.get(i);
      results_array.push({ token: tokens[i], tag });
    }

    this.cache.set(cacheKey, results_array);
    return results_array;
  }

  /**
   * Tag multiple sentences (batch processing).
   * This is the primary method used by the macronization pipeline.
   */
  tagSentences(sentences: string[][]): TagResult[][] {
    if (!this.modelLoaded) {
      throw new Error('Model not loaded. Call initialize() first.');
    }

    const results = this.tagger.tagSentences(sentences);

    const allResults: TagResult[][] = [];

    for (let s = 0; s < sentences.length; s++) {
      const sentTags = results.get(s);
      const sentenceResults: TagResult[] = [];

      for (let i = 0; i < sentences[s].length; i++) {
        const tag = sentTags.get(i);
        sentenceResults.push({ token: sentences[s][i], tag });
      }

      allResults.push(sentenceResults);
    }

    return allResults;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if model is loaded
   */
  isReady(): boolean {
    return this.modelLoaded && this.tagger !== undefined;
  }

  /**
   * Destroy WASM instance and free resources
   */
  destroy(): void {
    if (this.tagger) {
      if (this.tagger.delete) {
        this.tagger.delete();
      }
      this.tagger = null;
    }
    this.cache.clear();
    this.modelLoaded = false;
    this.wasmModule = undefined;
  }
}

/**
 * Fallback tagger for when WASM is not available
 */
export class FallbackTagger {
  private patterns: Map<string, string>;

  constructor() {
    this.patterns = new Map([
      ['are', 'v1sp'], ['ēre', 'v2sp'], ['ere', 'v3sp'], ['īre', 'v4sp'],
      ['us', 'n-s--m'], ['um', 'n-s--n'], ['a', 'n-s--f'],
      ['us', 'a--s--m'], ['a', 'a--s--f'], ['um', 'a--s--n'],
    ]);
  }

  tag(tokens: string[]): TagResult[] {
    return tokens.map(token => {
      const lower = token.toLowerCase();
      let tag = '---------';

      for (const [suffix, patternTag] of this.patterns) {
        if (lower.endsWith(suffix)) {
          tag = patternTag;
          break;
        }
      }

      return { token, tag };
    });
  }
}
