/**
 * WasmTagger.ts
 * WebAssembly wrapper for RFTagger statistical POS tagger
 * Uses C++ class API from Emscripten (matching test-full-pipeline.html)
 */
/**
 * WebAssembly-based RFTagger implementation
 * Uses Emscripten C++ class API (new RFTagger(), loadModel(), tagSentences())
 * This matches the API used in test-full-pipeline.html
 */
export class WasmTagger {
    constructor(options = {}) {
        Object.defineProperty(this, "wasmModule", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tagger", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "modelLoaded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "modelPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "useSentences", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "beamSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "debugMode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.modelPath = options.modelPath || '/models/rftagger-ldt.model';
        this.cache = new Map();
        // Default parameters matching test-full-pipeline.html
        this.useSentences = true;
        this.beamSize = 0.001;
        this.debugMode = false;
    }
    /**
     * Initialize WASM module and load model
     */
    async initialize() {
        try {
            // Load Emscripten-compiled RFTagger module
            const RFTaggerModule = await this.loadWasmModule();
            // Initialize module with locateFile for WASM
            this.wasmModule = await RFTaggerModule({
                locateFile: (path) => {
                    if (path === 'rftagger.wasm') {
                        return 'public/wasm/rftagger.wasm';
                    }
                    return path;
                }
            });
            // Wait for module to be ready
            await this.wasmModule.ready;
            // Load model into Emscripten filesystem
            await this.loadModelIntoFS();
            // Create RFTagger instance (C++ class)
            this.tagger = new this.wasmModule.RFTagger();
            // Load the statistical model
            await this.loadModel();
            this.modelLoaded = true;
        }
        catch (error) {
            throw new Error(`Failed to initialize WASM RFTagger: ${error}`);
        }
    }
    /**
     * Load Emscripten-compiled WASM module
     */
    async loadWasmModule() {
        // Dynamic import of rftagger.js
        if (typeof window !== 'undefined') {
            // Try to load from global first (if script tag loaded it)
            if (window.RFTaggerModule) {
                return window.RFTaggerModule;
            }
            // Otherwise, try dynamic import
            try {
                // @ts-expect-error WASM module has no TypeScript declarations
                const module = await import('../../../public/wasm/rftagger.js');
                return module.default || module;
            }
            catch (e) {
                throw new Error('Failed to load RFTagger WASM module. Make sure rftagger.js is loaded.');
            }
        }
        throw new Error('WASM not supported in this environment');
    }
    /**
     * Load RFTagger model into Emscripten filesystem
     */
    async loadModelIntoFS() {
        try {
            // Fetch model file
            const modelUrl = 'latin_macronizer/rftagger-ldt.model';
            const response = await fetch(modelUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
            }
            const modelData = await response.arrayBuffer();
            // Create /models directory if doesn't exist
            try {
                this.wasmModule.FS.mkdir('/models');
            }
            catch (e) {
                // Directory might already exist
            }
            // Write model to filesystem
            this.wasmModule.FS.writeFile(this.modelPath, new Uint8Array(modelData));
            console.log('[RFTagger] Model loaded into FS:', this.modelPath, `(${modelData.byteLength} bytes)`);
        }
        catch (error) {
            throw new Error(`Failed to load model into FS: ${error}`);
        }
    }
    /**
     * Load the statistical model
     */
    async loadModel() {
        if (!this.tagger) {
            throw new Error('RFTagger instance not created');
        }
        // Call C++ class method: loadModel(path, useSentences, beamSize, debugMode)
        // Parameters matching test-full-pipeline.html
        this.tagger.loadModel(this.modelPath, this.useSentences, this.beamSize, this.debugMode);
        this.modelLoaded = true;
    }
    /**
     * Tag tokens using RFTagger statistical model
     * Supports both flat token array and sentence array
     */
    tag(tokens) {
        if (!this.modelLoaded) {
            throw new Error('Model not loaded. Call initialize() first.');
        }
        // Check cache
        const cacheKey = tokens.join(' ');
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        // Prepare sentences array (array of string vectors)
        // RFTagger expects: vector<vector<string>> (sentences of words)
        const sentences = [tokens];
        // Call C++ class method: tagSentences(sentences)
        const results = this.tagger.tagSentences(sentences);
        // Parse results (VectorVectorString from embind)
        const sentTags = results.get(0);
        const results_array = [];
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
    tagSentences(sentences) {
        if (!this.modelLoaded) {
            throw new Error('Model not loaded. Call initialize() first.');
        }
        // Call C++ class method: tagSentences(sentences)
        const results = this.tagger.tagSentences(sentences);
        // Parse results (VectorVectorString from embind)
        const allResults = [];
        for (let s = 0; s < sentences.length; s++) {
            const sentTags = results.get(s);
            const sentenceResults = [];
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
    tagSentence(sentence) {
        // Simple tokenization for WASM input
        const tokens = sentence.split(/\s+/).filter(t => t.length > 0);
        return this.tag(tokens);
    }
    /**
     * Get confidence score for a tag
     */
    getConfidence(token, tag) {
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
    clearCache() {
        this.cache.clear();
    }
    /**
     * Get cache size
     */
    getCacheSize() {
        return this.cache.size;
    }
    /**
     * Check if model is loaded
     */
    isReady() {
        return this.modelLoaded && this.tagger !== undefined;
    }
    /**
     * Destroy WASM instance and free resources
     */
    destroy() {
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
    constructor() {
        Object.defineProperty(this, "patterns", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.patterns = new Map([
            // Common verb endings
            ['are', 'v1sp'], ['ēre', 'v2sp'], ['ere', 'v3sp'], ['īre', 'v4sp'],
            // Common noun endings
            ['us', 'n-s--m'], ['um', 'n-s--n'], ['a', 'n-s--f'],
            // Common adjective endings
            ['us', 'a--s--m'], ['a', 'a--s--f'], ['um', 'a--s--n'],
        ]);
    }
    tag(tokens) {
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
//# sourceMappingURL=WasmTagger.js.map