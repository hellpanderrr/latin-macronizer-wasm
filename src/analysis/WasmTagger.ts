/**
 * WasmTagger.ts
 * WebAssembly wrapper for RFTagger statistical POS tagger
 * Uses C++ class API from Emscripten (matching test-full-pipeline.html)
 */

export interface WasmTaggerOptions {
  wasmPath?: string;      // Path to the WASM JavaScript wrapper (default: '../wasm/rftagger.js')
  modelPath?: string;     // Virtual FS path for model (default: '/models/rftagger-ldt.model')
  modelUrl?: string;      // URL to fetch model from (default: '../wasm/rftagger-ldt.model')
  memorySize?: number;
  enableCache?: boolean;
}

export interface TagResult {
  token: string;
  tag: string;
  confidence?: number;
}

/**
 * WebAssembly-based RFTagger implementation
 * Uses Emscripten C++ class API (new RFTagger(), loadModel(), tagSentences())
 * This matches the API used in test-full-pipeline.html
 */
export class WasmTagger {
  private wasmModule: any;
  private tagger: any;
  private modelLoaded: boolean = false;
  private cache: Map<string, TagResult[]>;
  private modelPath: string;
  private wasmPath: string;
  private wasmDir: string = '';  // Directory containing WASM JS wrapper (for locateFile)
  private modelUrl: string;
  private useSentences: boolean;
  private beamSize: number;
  private debugMode: boolean;

  constructor(options: WasmTaggerOptions = {}) {
    console.log('[RFTagger] Constructor called with options:', options);
    this.modelPath = options.modelPath || '/wasm/rftagger-ldt.model';
    // Default wasmPath relative to this module's location (dist/analysis/WasmTagger.js -> dist/wasm/)
    const effectiveWasmPath = options.wasmPath || '../wasm/rftagger.js';
    this.wasmPath = effectiveWasmPath;
    console.log('[RFTagger] Effective wasmPath:', this.wasmPath);
    // Compute wasmDir for locateFile (trailing slash)
    this.wasmDir = effectiveWasmPath.substring(0, effectiveWasmPath.lastIndexOf('/') + 1);
    console.log('[RFTagger] wasmDir (for locateFile):', this.wasmDir);
    // Use absolute path from root for model URL
    const defaultModelUrl = '/wasm/rftagger-ldt.model';
    this.modelUrl = options.modelUrl || defaultModelUrl;
    console.log('[RFTagger] modelUrl:', this.modelUrl);
    this.cache = new Map();
    // Default parameters matching test-full-pipeline.html
    this.useSentences = true;  // normalize (default true in rft-annotate)
    this.beamSize = 0.001;    // beamThreshold
    this.debugMode = true;    // sentStartHeuristic — matches Python -s flag
  }

    /**
     * Initialize WASM module and load model
     */
    async initialize(): Promise<void> {
      console.log('[RFTagger] Initializing...');
      try {
        // Load (or get) already-instantiated Emscripten module
        this.wasmModule = await this.loadWasmModule();
        
        // Wait for module to be ready (already resolved if pre-instantiated)
        await this.wasmModule.ready;
        
        // Create RFTagger instance (C++ class)
        this.tagger = new this.wasmModule.RFTagger();
        console.log('[RFTagger] RFTagger instance created');
        
        // Load the statistical model (uses locateFile to find .model file)
        await this.loadModel();
        
        this.modelLoaded = true;
        console.log('[RFTagger] Model loaded successfully');
      } catch (error) {
        console.error('[RFTagger] Initialization failed:', error);
        throw new Error(`Failed to initialize WASM RFTagger: ${error}`);
      }
    }

  /**
   * Load Emscripten-compiled WASM module
   * Handles both pre-instantiated global (from script tag) and dynamic import (factory function)
   */
  private async loadWasmModule(): Promise<any> {
    if (typeof window === 'undefined') {
      throw new Error('WASM not supported in this environment');
    }

    const globalRFTagger = (window as any).RFTaggerModule;

    // Use global RFTaggerModule (loaded via script tag, matching test-full-pipeline.html)
     if (globalRFTagger && typeof globalRFTagger === 'function') {
       console.log('[RFTagger] Instantiating from global factory RFTaggerModule');
       return await globalRFTagger({
         locateFile: (path: string) => {
           // Handle .wasm and .data files (matching test-full-pipeline.html)
           if (path.endsWith('.wasm') || path.endsWith('.data')) {
             return '/wasm/' + path;
           }
           // Don't handle .model files here - we'll write them to virtual filesystem
           return path;
         }
       });
     }

    // Fallback: try dynamic import
    try {
      console.log('[RFTagger] Dynamically importing from:', this.wasmPath);
      const module = await import(this.wasmPath);
      const exported = (module as any).default || module;

      if (typeof exported === 'function') {
        console.log('[RFTagger] Instantiating from dynamic import factory');
        return await exported({
          locateFile: (path: string) => {
            if (path.endsWith('.wasm') || path.endsWith('.data')) {
              return this.wasmDir + path;
            }
            if (path.endsWith('.model')) {
              return '/wasm/rftagger-ldt.model';
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
     * Fetches model data and writes it to virtual filesystem before loading
     */
    private async loadModel(): Promise<void> {
      if (!this.tagger) {
        throw new Error('RFTagger instance not created');
      }

      try {
        // Fetch model data and write to virtual filesystem (like test-full-pipeline.html)
        console.log('[RFTagger] Fetching model from:', this.modelUrl);
        const response = await fetch(this.modelUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
        }
        const modelData = await response.arrayBuffer();
        
        // Write model to virtual filesystem
        // Ensure the directory exists
        try { this.wasmModule.FS.mkdir('/models'); } catch (e) {}
        // Write the model file
        this.wasmModule.FS.writeFile('/models/rftagger-ldt.model', new Uint8Array(modelData));
        console.log('[RFTagger] Model written to virtual filesystem at /models/rftagger-ldt.model');
        
        // Call C++ class method: loadModel(path, useSentences, beamSize, debugMode)
        // Parameters matching test-full-pipeline.html
        this.tagger.loadModel('/models/rftagger-ldt.model', this.useSentences, this.beamSize, this.debugMode);
        this.modelLoaded = true;
        console.log('[RFTagger] Model loaded successfully');
      } catch (error) {
        console.error('[RFTagger] Failed to load model:', error);
        throw new Error(`Failed to load model: ${error}`);
      }
    }

  /**
   * Tag tokens using RFTagger statistical model
   * Supports both flat token array and sentence array
   */
  tag(tokens: string[]): TagResult[] {
    if (!this.modelLoaded) {
      throw new Error('Model not loaded. Call initialize() first.');
    }

    // Check cache
    const cacheKey = tokens.join(' ');
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Prepare sentences array (array of string vectors)
    // RFTagger expects: vector<vector<string>> (sentences of words)
    const sentences = [tokens];
    
    // Call C++ class method: tagSentences(sentences)
    const results = this.tagger.tagSentences(sentences);
    
    // Parse results (VectorVectorString from embind)
    const sentTags = results.get(0);
    const results_array: TagResult[] = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const tag = sentTags.get(i);
      results_array.push({
        token: tokens[i],
        tag: tag,
        confidence: this.getConfidence(tokens[i], tag)
      });
    }

    // Cache results
    this.cache.set(cacheKey, results_array);

    return results_array;
  }

  /**
   * Tag multiple sentences (batch processing)
   */
  tagSentences(sentences: string[][]): TagResult[][] {
    if (!this.modelLoaded) {
      throw new Error('Model not loaded. Call initialize() first.');
    }

    // Call C++ class method: tagSentences(sentences)
    const results = this.tagger.tagSentences(sentences);
    
    // Parse results (VectorVectorString from embind)
    const allResults: TagResult[][] = [];
    
    for (let s = 0; s < sentences.length; s++) {
      const sentTags = results.get(s);
      const sentenceResults: TagResult[] = [];
      
      for (let i = 0; i < sentences[s].length; i++) {
        const tag = sentTags.get(i);
        sentenceResults.push({
          token: sentences[s][i],
          tag: tag,
          confidence: this.getConfidence(sentences[s][i], tag)
        });
      }
      
      allResults.push(sentenceResults);
    }

    return allResults;
  }

  /**
   * Tag a sentence (convenience method)
   */
  tagSentence(sentence: string): TagResult[] {
    // Simple tokenization for WASM input
    const tokens = sentence.split(/\s+/).filter(t => t.length > 0);
    return this.tag(tokens);
  }

  /**
   * Get confidence score for a tag
   */
  private getConfidence(token: string, tag: string): number {
    // RFTagger doesn't provide confidence scores directly
    // Estimate based on token characteristics
    const lowerToken = token.toLowerCase();
    
    // Known words have higher confidence
    const knownWords = ['sum', 'es', 'est', 'et', 'in', 'ad', 'cum', 'de', 'ab'];
    if (knownWords.includes(lowerToken)) {
      return 0.95;
    }
    
    // Common suffixes
    const commonSuffixes = ['are', 'ere', 'ire', 'atus', 'ens', 'bilis'];
    if (commonSuffixes.some(s => lowerToken.endsWith(s))) {
      return 0.90;
    }
    
    return 0.85;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
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
      // Delete C++ object if delete method exists
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
      // Common verb endings
      ['are', 'v1sp'], ['ēre', 'v2sp'], ['ere', 'v3sp'], ['īre', 'v4sp'],
      // Common noun endings
      ['us', 'n-s--m'], ['um', 'n-s--n'], ['a', 'n-s--f'],
      // Common adjective endings
      ['us', 'a--s--m'], ['a', 'a--s--f'], ['um', 'a--s--n'],
    ]);
  }

  tag(tokens: string[]): TagResult[] {
    return tokens.map(token => {
      const lower = token.toLowerCase();
      let tag = '---------';
      
      // Try pattern matching
      for (const [suffix, patternTag] of this.patterns) {
        if (lower.endsWith(suffix)) {
          tag = patternTag;
          break;
        }
      }
      
      return {
        token,
        tag,
        confidence: 0.70
      };
    });
  }
}
