/**
 * Macronizer.ts
 * Core macronization engine integrating WASM RFTagger with Latin rules
 * Orchestrates tokenization, POS tagging, and vowel length assignment
 */
import { Token } from './Token';
export interface MacronizerOptions {
    useWasm?: boolean;
    wasmModelPath?: string;
    wasmPath?: string;
    enableCache?: boolean;
    confidenceThreshold?: number;
    wordlistUrl?: string;
    morpheusWasmPath?: string;
}
export interface MacronizeOptions {
    macronize?: boolean;
    alsomaius?: boolean;
    performutov?: boolean;
    performitoj?: boolean;
    scan?: string;
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
    scannedFeet?: string[];
}
/**
 * Main macronization engine
 * Coordinates all components for Latin text processing
 */
export declare class Macronizer {
    private tokenizer;
    private tokenization;
    private tagger;
    private lemmaEngine;
    private endingEngine;
    private editDistanceEngine;
    private wordlistEngine;
    private morpheusAnalyzer;
    private useWasm;
    private confidenceThreshold;
    private cache;
    private wordlistUrl?;
    private morpheusWasmPath?;
    constructor(options?: MacronizerOptions);
    /**
     * Initialize the macronizer (load WASM module if enabled)
     */
    initialize(onProgress?: (percent: number, message: string) => void): Promise<void>;
    /**
     * Macronize Latin text
     * Main entry point for text processing
     * Uses Tokenization pipeline with DP alignment
     */
    macronize(text: string, options?: MacronizeOptions): Promise<MacronizeResult>;
    /**
     * Tag tokens with POS tags
     */
    private tagTokens;
    /**
     * Check if token is a word (not punctuation or number)
     */
    private isWordToken;
    /**
     * Fallback tagging using morphological rules
     */
    private fallbackTagging;
    /**
     * Calculate overall confidence score
     */
    private calculateConfidence;
    /**
     * Calculate statistics about the macronization
     */
    private calculateStatistics;
    /**
     * Batch process multiple texts
     */
    macronizeBatch(texts: string[]): Promise<MacronizeResult[]>;
    /**
     * Clear cache
     */
    clearCache(): void;
    /**
     * Get cache size
     */
    getCacheSize(): number;
    /**
     * Check if initialized
     */
    isReady(): boolean;
    /**
     * Destroy resources
     */
    destroy(): void;
    /**
     * Load wordlist (exposed for API — used when wordlist not loaded during initialize).
     */
    loadWordlist(onProgress?: (progress: any) => void): Promise<void>;
    isWordlistLoaded(): boolean;
    getWordlistMode(): string;
    clearWordlistCache(): Promise<void>;
}
//# sourceMappingURL=Macronizer.d.ts.map