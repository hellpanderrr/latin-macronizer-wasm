/**
 * RFTagger JavaScript Wrapper
 * 
 * Provides a high-level API for using the RFTagger WebAssembly module.
 * 
 * Usage:
 *   const tagger = new RFTagger();
 *   await tagger.load('/wasm/rftagger-ldt.model');
 *   const results = tagger.tag(['Gallia', 'est', 'omnis']);
 *   // results = ['n-s--f-', 'v3sp---', 'a--s--f-']
 */

class RFTagger {
    constructor() {
        this.module = null;
        this.tagger = null;
        this.loaded = false;
    }

    /**
     * Initialize the WASM module
     * @param {string} wasmPath - Path to the rftagger.js file
     */
    async initialize(wasmPath = '/wasm/rftagger.js') {
        if (this.module) return;

        // Dynamic import of the WASM module
        if (typeof window !== 'undefined') {
            // Browser environment
            const script = document.createElement('script');
            script.src = wasmPath;
            script.async = true;
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });

            this.module = await window.RFTaggerModule();
        } else {
            // Node.js environment
            const RFTaggerModule = require(wasmPath);
            this.module = await RFTaggerModule();
        }
    }

    /**
     * Load a model file
     * @param {string} modelPath - Path to the .par model file
     * @param {Object} options - Loading options
     * @param {boolean} options.normalize - Normalize probabilities (default: true)
     * @param {number} options.beamThreshold - Beam threshold (default: 0.001)
     * @param {boolean} options.sentStartHeuristic - Use sentence start heuristic (default: false)
     * @returns {boolean} True if model loaded successfully
     */
    async load(modelPath, options = {}) {
        if (!this.module) {
            await this.initialize();
        }

        const opts = {
            normalize: true,
            beamThreshold: 0.001,
            sentStartHeuristic: false,
            ...options
        };

        // Create tagger instance
        this.tagger = new this.module.RFTagger();

        // Load model (the model file must be available in the virtual filesystem)
        const success = this.tagger.loadModel(
            modelPath,
            opts.normalize,
            opts.beamThreshold,
            opts.sentStartHeuristic
        );

        this.loaded = success;
        return success;
    }

    /**
     * Tag an array of tokens
     * @param {string[]} tokens - Array of word tokens
     * @returns {string[]} Array of POS tags
     */
    tag(tokens) {
        if (!this.loaded || !this.tagger) {
            throw new Error('RFTagger: Model not loaded. Call load() first.');
        }

        if (!Array.isArray(tokens)) {
            throw new Error('RFTagger: Expected array of tokens');
        }

        // Convert to StringVector (required by Embind)
        const vec = new this.module.StringVector();
        for (const token of tokens) {
            vec.push_back(token);
        }

        // Tag the tokens
        const result = this.tagger.tagTokens(vec);

        // Clean up
        vec.delete();

        // Convert result to JS array
        const tags = [];
        for (let i = 0; i < result.size(); i++) {
            tags.push(result.get(i));
        }

        return tags;
    }

    /**
     * Tag a single token
     * @param {string} token - Word to tag
     * @returns {string} POS tag
     */
    tagToken(token) {
        if (!this.loaded || !this.tagger) {
            throw new Error('RFTagger: Model not loaded. Call load() first.');
        }

        return this.tagger.tagToken(token);
    }

    /**
     * Get the number of tags in the model
     * @returns {number} Number of tags
     */
    getTagCount() {
        if (!this.loaded || !this.tagger) {
            return 0;
        }
        return this.tagger.getTagCount();
    }

    /**
     * Get tag name by index
     * @param {number} index - Tag index
     * @returns {string} Tag name
     */
    getTagName(index) {
        if (!this.loaded || !this.tagger) {
            return '';
        }
        return this.tagger.getTagName(index);
    }

    /**
     * Check if a model is loaded
     * @returns {boolean}
     */
    isLoaded() {
        return this.loaded && this.tagger && this.tagger.isLoaded();
    }

    /**
     * Destroy the tagger and free memory
     */
    destroy() {
        if (this.tagger) {
            this.tagger.delete();
            this.tagger = null;
        }
        this.loaded = false;
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RFTagger };
}
if (typeof window !== 'undefined') {
    window.RFTagger = RFTagger;
}
