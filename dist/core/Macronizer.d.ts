/**
 * Macronizer.ts
 * Core macronization engine integrating WASM RFTagger with Latin rules
 * Orchestrates tokenization, POS tagging, and vowel length assignment
 */
import { Token } from './Token';
export interface MacronizerOptions {
    useWasm?: boolean;
    wasmModelPath?: string;
    enableCache?: boolean;
    confidenceThreshold?: number;
    wordlistUrl?: string;
    morpheusWasmPath?: string;
}
export interface MacronizeResult {
    original: string;
    macronized: string;
    tokens: Token[];
    taggedTokens: Token[];
    confidence: number;
    processingTime: number;
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
    initialize(): Promise<void>;
    /**
     * Macronize Latin text
     * Main entry point for text processing
     * Uses Tokenization pipeline with DP alignment
     */
    macronize(text: string): Promise<MacronizeResult>;
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
     * Apply macronization to tagged tokens
     */
    private applyMacronization;
    /**
     * Macronize a single token
     * Priority: Wordlist → Lemma lookup → Pattern matching → Edit distance → Heuristics
     */
    private macronizeToken;
    /**
     * Apply heuristic rules for vowel length
     */
    private applyHeuristics;
    /**
     * Ensure vowel at position is long (add macron)
     */
    private ensureLongVowel;
    /**
     * Calculate overall confidence score
     */
    private calculateConfidence;
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
}
//# sourceMappingURL=Macronizer.d.ts.map