/**
 * LemmaEngine.ts
 * Lemma dictionary lookup for Latin macronization
 * Compressed dictionary of known lemmas with macronized forms
 */
export interface LemmaEntry {
    lemma: string;
    macronized: string;
    frequency: number;
    tags: string[];
}
export declare class LemmaEngine {
    private lemmaMap;
    private reverseMap;
    private loaded;
    constructor();
    /**
     * Load lemma dictionary from JSON data
     */
    load(data?: any): Promise<void>;
    /**
     * Initialize with most common Latin lemmas
     */
    private initializeCommonLemmas;
    /**
     * Add a lemma to the dictionary
     */
    private addLemma;
    /**
     * Load lemmas from JSON data
     */
    private loadFromData;
    /**
     * Look up a lemma
     */
    lookup(word: string, tag?: string): LemmaEntry | null;
    /**
     * Check if a lemma exists
     */
    hasLemma(word: string, tag?: string): boolean;
    /**
     * Get all lemmas for a macronized form
     */
    getLemmasByMacronized(macronized: string): LemmaEntry[];
    /**
     * Get frequency for a lemma by direct name lookup (not keyed by tag).
     * Matches Python's lemma_frequency dict.
     */
    getFrequency(lemma: string): number;
    /**
     * Get dictionary size
     */
    size(): number;
    /**
     * Normalize key for lookup
     */
    private normalizeKey;
    /**
     * Check if loaded
     */
    isLoaded(): boolean;
}
//# sourceMappingURL=LemmaEngine.d.ts.map