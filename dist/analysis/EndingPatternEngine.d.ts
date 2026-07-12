/**
 * EndingPatternEngine.ts
 * Pattern-based vowel length determination for Latin macronization
 * Uses suffix patterns and morphological rules
 */
export interface EndingPattern {
    suffix: string;
    replacement: string;
    posTags?: string[];
    priority?: number;
}
export declare class EndingPatternEngine {
    private patterns;
    private suffixTree;
    private loaded;
    /** Raw Python tag_to_endings: exact 9-char LDT tag → ORDERED accented endings
     *  (underscore/caret notation), straight from endings.json. */
    private rawEndings;
    constructor();
    /**
     * Python: tag_to_endings.get(tag, []) — exact-tag lookup, list order preserved.
     */
    getEndingsForTag(tag: string): string[];
    /**
     * Load ending patterns
     */
    load(data?: any): Promise<void>;
    /**
     * Initialize common Latin ending patterns
     */
    private initializeCommonPatterns;
    /**
     * Load patterns from JSON data
     */
    private loadFromData;
    /**
     * Build suffix tree for efficient lookup
     */
    private buildSuffixTree;
    /**
     * Apply ending patterns to a word
     */
    apply(word: string, posTag?: string): string | null;
    /**
     * Infer POS tag from word ending
     */
    inferTag(word: string): string;
    /**
     * Check if a pattern exists for this word
     */
    hasPattern(word: string): boolean;
    /**
     * Get all patterns for a word
     */
    getPatterns(word: string, posTag?: string): EndingPattern[];
    /**
     * Get number of patterns
     */
    size(): number;
    /**
     * Check if loaded
     */
    isLoaded(): boolean;
    /**
     * Normalize RFTagger tag format (n.-.s.-.-.-.f.b.-) to pattern format (n-s--f-)
     */
    private normalizeTag;
    /**
     * Apply ending patterns to macronize a word
     * Returns macronized form or null if no pattern matches
     */
    macronizeWithPatterns(word: string, posTag?: string): string | null;
}
//# sourceMappingURL=EndingPatternEngine.d.ts.map