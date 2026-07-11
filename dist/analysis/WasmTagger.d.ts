/**
 * WasmTagger.ts
 * WebAssembly wrapper for RFTagger statistical POS tagger
 * Uses C++ class API from Emscripten (matching test-full-pipeline.html)
 */
export interface WasmTaggerOptions {
    wasmPath?: string;
    modelPath?: string;
    modelUrl?: string;
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
export declare class WasmTagger {
    private wasmModule;
    private tagger;
    private modelLoaded;
    private cache;
    private modelPath;
    private wasmPath;
    private wasmDir;
    private modelUrl;
    private useSentences;
    private beamSize;
    private debugMode;
    constructor(options?: WasmTaggerOptions);
    /**
     * Initialize WASM module and load model
     */
    initialize(): Promise<void>;
    /**
     * Load Emscripten-compiled WASM module
     * Handles both pre-instantiated global (from script tag) and dynamic import (factory function)
     */
    private loadWasmModule;
    /**
     * Load the statistical model
     * Fetches model data and writes it to virtual filesystem before loading
     */
    private loadModel;
    /**
     * Tag tokens using RFTagger statistical model
     * Supports both flat token array and sentence array
     */
    tag(tokens: string[]): TagResult[];
    /**
     * Tag multiple sentences (batch processing)
     */
    tagSentences(sentences: string[][]): TagResult[][];
    /**
     * Tag a sentence (convenience method)
     */
    tagSentence(sentence: string): TagResult[];
    /**
     * Get confidence score for a tag
     */
    private getConfidence;
    /**
     * Clear cache
     */
    clearCache(): void;
    /**
     * Get cache size
     */
    getCacheSize(): number;
    /**
     * Check if model is loaded
     */
    isReady(): boolean;
    /**
     * Destroy WASM instance and free resources
     */
    destroy(): void;
}
/**
 * Fallback tagger for when WASM is not available
 */
export declare class FallbackTagger {
    private patterns;
    constructor();
    tag(tokens: string[]): TagResult[];
}
//# sourceMappingURL=WasmTagger.d.ts.map