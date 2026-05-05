/**
 * Core types for the Latin Macronizer
 * Ported from Python latin_macronizer module
 */
export interface POSTag {
    tag: string;
    probability: number;
}
export interface Token {
    text: string;
    isWord: boolean;
    isSpace: boolean;
    endssentence: boolean;
    tag?: string;
    lemma?: string;
    accented: string[];
    macronized?: string;
    isUnknown: boolean;
    isEnclitic: boolean;
    hasEnclitic: boolean;
    startIndex: number;
    endIndex: number;
}
export interface WordEntry {
    form: string;
    lemma: string;
    accented: string[];
    tags: string[];
    frequency?: number;
}
export interface LemmaEntry {
    lemma: string;
    patterns: string[];
    endings?: string[];
}
export interface MacronizerOptions {
    macronize: boolean;
    alsomaius: boolean;
    performutov: boolean;
    performitoj: boolean;
    markambigs: boolean;
    scan: ScanOption;
    evaluate?: boolean;
}
export type ScanOption = 'prose' | 'dactylichexameter' | 'dactylicpentameter' | 'hendecasyllable' | 'iambictrimeter' | 'iambicdimeter';
export interface MacronizerResult {
    text: string;
    html: string;
    tokens: Token[];
    scannedFeet?: string[];
    statistics: {
        totalWords: number;
        knownWords: number;
        unknownWords: number;
        ambiguousForms: number;
        accuracy?: number;
    };
}
export interface EvaluationResult {
    vowelCount: number;
    correctCount: number;
    accuracy: number;
    errors: Array<{
        word: string;
        expected: string;
        actual: string;
        position: number;
    }>;
}
export interface MacronizerDatabase {
    words: WordEntry;
    lemmas: LemmaEntry;
    endings: {
        suffix: string;
        macronized: string;
    };
}
export interface WasmTagger {
    loadModel(modelPath: string): Promise<void>;
    tagTokens(words: string[]): Promise<POSTag[]>;
    dispose(): void;
}
export type MeterState = number;
export type VowelLength = 'L' | 'S' | 'D' | '?' | 'T';
export interface ScansionResult {
    feet: string[];
    vowelLengths: VowelLength[];
    valid: boolean;
}
//# sourceMappingURL=index.d.ts.map