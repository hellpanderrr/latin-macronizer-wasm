/**
 * MorpheusAnalyzer.ts
 * TypeScript wrapper for Morpheus WASM morphological analyzer
 *
 * Provides clean API for analyzing Latin words using Morpheus engine
 * compiled to WebAssembly. Matches Python latin_macronizer.wordlist.crunchwords()
 */
export interface MorpheusAnalysis {
    word: string;
    analyses: Array<{
        lemma: string;
        stem: string;
        ending: string;
        formInfo: {
            partOfSpeech?: string;
            case?: string;
            number?: string;
            gender?: string;
            tense?: string;
            mood?: string;
            voice?: string;
            person?: string;
            degree?: string;
        };
        raw: string;
    }>;
    success: boolean;
    raw: string;
}
export interface MorpheusOptions {
    format?: 'full' | 'lemma';
    ignoreAccents?: boolean;
    strictCase?: boolean;
    checkPreverb?: boolean;
    verbsOnly?: boolean;
}
/**
 * MorpheusAnalyzer class
 * WebAssembly wrapper for Morpheus morphological analyzer
 */
export declare class MorpheusAnalyzer {
    private wasmModule;
    private initialized;
    private defaultLanguage;
    private wasmPath;
    constructor(wasmPath?: string);
    /**
     * Initialize the WASM module
     */
    initialize(): Promise<void>;
    /**
     * Analyze a single word
     */
    analyze(word: string, options?: MorpheusOptions): MorpheusAnalysis;
    /**
     * Analyze multiple words in batch
     */
    analyzeBatch(words: string[], options?: MorpheusOptions): MorpheusAnalysis[];
    /**
     * Set analysis language
     */
    setLanguage(lang: string): void;
    /**
     * Destroy the analyzer and free resources
     */
    destroy(): void;
    isInitialized(): boolean;
    private loadWasmModule;
    private optionsToFlags;
    private parseOutput;
    private parseAnalysisLine;
    private parseFormInfo;
    private posCodeToName;
}
export default MorpheusAnalyzer;
//# sourceMappingURL=MorpheusAnalyzer.d.ts.map