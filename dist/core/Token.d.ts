/**
 * Token.ts
 * Core token representation for Latin macronizer
 * Immutable token with POS tagging and macronization capabilities
 */
import { MorpheusAnalysis } from '../analysis/MorpheusAnalyzer';
export interface TokenOptions {
    text?: string;
    tag?: string;
    lemma?: string;
    macronized?: boolean;
    macronizedText?: string;
    originalText?: string;
    confidence?: number;
    accented?: string[];
    isAmbiguous?: boolean;
    isUnknown?: boolean;
    morpheusAnalyzed?: boolean;
    morpheusResults?: MorpheusAnalysis | null;
    startssentence?: boolean;
    endssentence?: boolean;
    hasenclitic?: boolean;
    isenclitic?: boolean;
    isWord?: boolean;
    isSpace?: boolean;
    startIndex?: number;
    endIndex?: number;
}
/**
 * Immutable token class representing a word in Latin text
 */
export declare class Token {
    readonly text: string;
    readonly tag: string;
    readonly lemma: string;
    readonly macronized: boolean;
    readonly macronizedText?: string;
    readonly originalText: string;
    readonly confidence?: number;
    readonly accented?: string[];
    readonly isAmbiguous?: boolean;
    readonly isUnknown?: boolean;
    readonly morpheusAnalyzed?: boolean;
    readonly morpheusResults?: MorpheusAnalysis | null;
    readonly startssentence?: boolean;
    readonly endssentence?: boolean;
    readonly hasenclitic?: boolean;
    readonly isenclitic?: boolean;
    readonly isWord?: boolean;
    readonly isSpace?: boolean;
    readonly startIndex?: number;
    readonly endIndex?: number;
    constructor(text: string, options?: TokenOptions);
    /**
     * Create a new token with updated properties (immutable update)
     */
    with(options: Partial<TokenOptions>): Token;
    /**
     * Split token by hyphen (for compound words)
     */
    split(): Token[];
    /**
     * Display token with all metadata
     */
    show(): string;
    /**
     * Apply macronization to this token
     */
    macronize(macronizer: Macronizer): Token;
    /**
     * Check if token is punctuation
     */
    isPunctuation(): boolean;
    /**
     * Check if token is a number
     */
    isNumber(): boolean;
    /**
     * Get part of speech from tag
     */
    getPOS(): string;
    /**
     * Check if token has specific POS tag
     */
    hasPOS(pos: string): boolean;
    /**
     * Get case from LDT tag (positions 5-6)
     */
    getCase(): string;
    /**
     * Get number from LDT tag (positions 7-8)
     */
    getNumber(): string;
    /**
     * Get gender from LDT tag (position 9)
     */
    getGender(): string;
    /**
     * Check if token is a verb
     */
    isVerb(): boolean;
    /**
     * Check if token is a noun
     */
    isNoun(): boolean;
    /**
     * Check if token is an adjective
     */
    isAdjective(): boolean;
    /**
     * Check if token is an adverb
     */
    isAdverb(): boolean;
    /**
     * Check if token is a preposition
     */
    isPreposition(): boolean;
    /**
     * Check if token is a conjunction
     */
    isConjunction(): boolean;
    /**
     * Check if token is a pronoun
     */
    isPronoun(): boolean;
    /**
     * Convert token to JSON-serializable format
     */
    toJSON(): object;
    /**
     * Create token from JSON
     */
    static fromJSON(data: any): Token;
}
/**
 * Macronizer interface for dependency injection
 */
export interface Macronizer {
    macronize(token: Token): string;
}
//# sourceMappingURL=Token.d.ts.map