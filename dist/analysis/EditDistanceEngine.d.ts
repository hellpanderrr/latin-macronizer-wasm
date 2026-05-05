/**
 * EditDistanceEngine.ts
 * Edit distance-based lookup for Latin macronization
 * Finds closest known words using Levenshtein distance
 */
export interface EditResult {
    word: string;
    distance: number;
    macronized: string;
    confidence: number;
}
export declare class EditDistanceEngine {
    private knownWords;
    private maxDistance;
    private loaded;
    constructor(maxDistance?: number);
    /**
     * Load known words dictionary
     */
    load(data?: any): Promise<void>;
    /**
     * Initialize common Latin words
     */
    private initializeCommonWords;
    /**
     * Load words from data
     */
    private loadFromData;
    /**
     * Find closest known word using edit distance
     */
    findClosest(word: string, posTag?: string): EditResult | null;
    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(a: string, b: string): number;
    /**
     * Calculate confidence based on edit distance and word length
     */
    private calculateConfidence;
    /**
     * Add a word to the dictionary
     */
    addWord(word: string, macronized: string): void;
    /**
     * Check if word is known
     */
    hasWord(word: string): boolean;
    /**
     * Get macronized form
     */
    getMacronized(word: string): string | null;
    /**
     * Get dictionary size
     */
    size(): number;
    /**
     * Check if loaded
     */
    isLoaded(): boolean;
    /**
     * Find all words within max distance
     */
    findAllWithinDistance(word: string, maxDistance?: number): EditResult[];
}
//# sourceMappingURL=EditDistanceEngine.d.ts.map