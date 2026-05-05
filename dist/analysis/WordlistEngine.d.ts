/**
 * WordlistEngine.ts
 * IndexedDB-based wordlist for accurate Latin macronization
 * Stores exact wordform + tag → macronized form mappings from macrons.txt
 * Integrates with Morpheus for unknown words
 */
import { MorpheusAnalyzer } from './MorpheusAnalyzer';
export interface WordlistEntry {
    wordform: string;
    tag: string;
    macronized: string;
    accentedUnderscore: string;
    lemma: string;
}
export declare class WordlistEngine {
    private db;
    private loaded;
    private entryCount;
    private morpheusAnalyzer;
    private loadingPromise;
    private readonly DB_NAME;
    private readonly DB_VERSION;
    private readonly STORE_NAME;
    /**
     * Initialize IndexedDB database
     */
    init(): Promise<void>;
    /**
     * Check if database is populated
     */
    isPopulated(): Promise<boolean>;
    /**
     * Get entry count
     */
    size(): number;
    /**
     * Lookup exact macronized form for word + tag
     */
    lookup(wordform: string, tag: string): Promise<string | null>;
    /**
     * Get all entries for a wordform (for candidate generation)
     * Returns entries with accentedUnderscore populated
     */
    getAllEntries(wordform: string): Promise<WordlistEntry[]>;
    /**
     * Normalize tag format (convert dots to dashes for consistency with RFTagger)
     */
    private normalizeTag;
    /**
     * Add single entry to wordlist
     */
    addEntry(entry: WordlistEntry): Promise<void>;
    /**
     * Batch add entries (for file loading)
     */
    addEntries(entries: WordlistEntry[], onProgress?: (count: number) => void): Promise<void>;
    /**
     * Clear all entries
     */
    clear(): Promise<void>;
    /**
     * Convert macron marks to Unicode
     * ^ = breve (short vowel), _ = macron (long vowel)
     * a^ -> ă, a_ -> ā
     */
    private convertMacronMarks;
    /**
     * Load from parsed macrons.txt data
     * Expected format: whitespace-separated (tab or space) columns:
     *   wordform  tag  lemma  accented
     * e.g. "a\te--------\ta\ta_"
     */
    loadFromText(text: string, onProgress?: (count: number) => void): Promise<void>;
    /**
     * Load wordlist from URL (fetch + parse)
     */
    loadFromUrl(url: string, onProgress?: (count: number) => void): Promise<void>;
    /**
     * Check if loaded
     */
    isLoaded(): boolean;
    /**
     * Close database connection
     */
    close(): void;
    /**
     * Set Morpheus analyzer for unknown words
     */
    setMorpheusAnalyzer(analyzer: MorpheusAnalyzer): void;
    /**
     * Lookup word in wordlist, fallback to Morpheus analysis if not found
     */
    lookupOrAnalyze(wordform: string, tag: string): Promise<string | null>;
    /**
     * Analyze unknown words using Morpheus and cache results
     */
    analyzeUnknownWords(words: string[]): Promise<WordlistEntry[]>;
    /**
     * Check if word exists in wordlist
     */
    private wordExists;
    /**
     * Find analysis matching the given tag
     */
    private findMatchingAnalysis;
}
//# sourceMappingURL=WordlistEngine.d.ts.map