/**
 * MacronizerAPI.ts
 * Public API for the Latin Macronizer
 * Provides a clean interface for browser-based Latin text processing
 */
import { Macronizer } from '../core/Macronizer.js';
import { Tokenizer } from '../core/Tokenizer.js';
/**
 * Public API for the Latin Macronizer
 * Singleton pattern for easy browser integration
 */
export class MacronizerAPI {
    constructor(config = {}) {
        var _a, _b, _c;
        Object.defineProperty(this, "macronizer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "initialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = {
            useWasm: (_a = config.useWasm) !== null && _a !== void 0 ? _a : true,
            wasmModelPath: config.wasmModelPath,
            confidenceThreshold: (_b = config.confidenceThreshold) !== null && _b !== void 0 ? _b : 0.80,
            enableCache: (_c = config.enableCache) !== null && _c !== void 0 ? _c : true,
        };
        this.macronizer = null;
        this.initialized = false;
    }
    /**
     * Get singleton instance
     */
    static getInstance(config) {
        if (!MacronizerAPI.instance) {
            MacronizerAPI.instance = new MacronizerAPI(config);
        }
        return MacronizerAPI.instance;
    }
    /**
     * Initialize the macronizer
     */
    async initialize() {
        try {
            if (this.initialized && this.macronizer) {
                return true;
            }
            this.macronizer = new Macronizer({
                useWasm: this.config.useWasm,
                wasmModelPath: this.config.wasmModelPath,
                confidenceThreshold: this.config.confidenceThreshold,
                enableCache: this.config.enableCache,
            });
            await this.macronizer.initialize();
            this.initialized = true;
            console.log('Latin Macronizer initialized successfully');
            return true;
        }
        catch (error) {
            console.error('Failed to initialize Latin Macronizer:', error);
            this.initialized = false;
            return false;
        }
    }
    /**
     * Process Latin text and add macrons
     */
    async process(text) {
        if (!this.initialized || !this.macronizer) {
            return {
                success: false,
                error: 'Macronizer not initialized. Call initialize() first.',
            };
        }
        try {
            const result = await this.macronizer.macronize(text);
            // Check confidence threshold
            if (result.confidence < this.config.confidenceThreshold) {
                console.warn(`Low confidence (${result.confidence.toFixed(2)}) for text: ${text}`);
            }
            return {
                success: true,
                macronizedText: result.macronized,
                originalText: result.original,
                tokens: result.taggedTokens,
                confidence: result.confidence,
                processingTime: result.processingTime,
            };
        }
        catch (error) {
            console.error('Error processing text:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    /**
     * Batch process multiple texts
     */
    async processBatch(texts) {
        if (!this.initialized || !this.macronizer) {
            return texts.map(() => ({
                success: false,
                error: 'Macronizer not initialized',
            }));
        }
        const results = [];
        for (const text of texts) {
            const result = await this.process(text);
            results.push(result);
        }
        return results;
    }
    /**
     * Tokenize text without macronization
     */
    tokenize(text) {
        const tokenizer = new Tokenizer();
        return tokenizer.tokenize(text);
    }
    /**
     * Check if macronizer is ready
     */
    isReady() {
        return this.initialized && this.macronizer !== null && this.macronizer.isReady();
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Clear cache
     */
    clearCache() {
        if (this.macronizer) {
            this.macronizer.clearCache();
        }
    }
    /**
     * Get cache size
     */
    getCacheSize() {
        return this.macronizer ? this.macronizer.getCacheSize() : 0;
    }
    /**
     * Destroy resources
     */
    destroy() {
        if (this.macronizer) {
            this.macronizer.destroy();
        }
        this.macronizer = null;
        this.initialized = false;
    }
    /**
     * Reset to factory defaults
     */
    reset() {
        this.destroy();
        this.config = {
            useWasm: true,
            confidenceThreshold: 0.80,
            enableCache: true,
        };
    }
}
/**
 * Convenience function for one-off processing
 */
export async function macronize(text, config) {
    const api = MacronizerAPI.getInstance(config);
    if (!api.isReady()) {
        await api.initialize();
    }
    return api.process(text);
}
// Expose to global scope in browser
if (typeof window !== 'undefined') {
    window.LatinMacronizer = {
        API: MacronizerAPI,
        macronize,
        version: '1.0.0',
    };
}
//# sourceMappingURL=MacronizerAPI.js.map