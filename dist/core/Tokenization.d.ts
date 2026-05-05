/**
 * Tokenization module
 * Ported from latin_macronizer/tokenization.py
 * Handles Latin text tokenization with enclitic support
 */
import { Token } from './Token';
import { WasmTagger } from '../analysis/WasmTagger';
import { LemmaEngine } from '../analysis/LemmaEngine';
import { EndingPatternEngine } from '../analysis/EndingPatternEngine';
import { WordlistEngine } from '../analysis/WordlistEngine';
export interface TokenizationOptions {
    preserveCase?: boolean;
    preserveWhitespace?: boolean;
}
/**
 * Tokenization class - splits Latin text into tokens
 * Handles enclitics (-que, -ve, -ne), sentence boundaries
 */
export declare class Tokenization {
    tokens: Token[];
    text: string;
    constructor(text: string, options?: TokenizationOptions);
    /**
     * Main tokenization method
     */
    private tokenize;
    /**
     * Detect sentence boundaries and mark startssentence on tokens
     */
    private detectSentenceBoundaries;
    /**
     * Add a word token, handling enclitics
     */
    private addWordToken;
    /**
     * Get all word forms for lookup
     */
    allWordForms(): string[];
    /**
     * Split tokens for wordlist lookup
     */
    splitTokens(wordlist: any): string[];
    /**
     * Add tags to tokens from RFTagger output
     */
    addTags(tags: Array<{
        word: string;
        tag: string;
    }>): void;
    /**
     * Tag tokens using WasmTagger
     * Gets words from tokens and applies POS tags from RFTagger
     */
    tagWithWasm(tagger: WasmTagger): Promise<void>;
    /**
     * Add lemmas to tokens using LemmaEngine
     */
    addLemmas(lemmaEngine: LemmaEngine): void;
    /**
     * Get accents for tokens
     * Ported from latin_macronizer/tokenization.py (getaccents method)
     * Determines the best accented form (with _ markers) for each token
     */
    getAccents(wordlistEngine: WordlistEngine, endingEngine: EndingPatternEngine): Promise<void>;
    /**
     * Apply macronization to all tokens
     */
    macronize(domacronize: boolean, alsomaius: boolean, performutov: boolean, performitoj: boolean, endingEngine?: EndingPatternEngine): void;
    /**
     * Macronize single token
     * Ported from latin_macronizer/tokenization.py (macronize method)
     * Uses DP alignment to add macrons to the token's accented form
     */
    private macronizeToken;
    /**
     * Convert tokens back to text
     */
    detokenize(markAmbigs?: boolean): string;
    /**
     * Get plain text without HTML
     */
    getPlainText(): string;
    /**
     * Scan verses using meter automata
     */
    scanVerses(meters: any): void;
    /**
     * Get scanned feet (if scansion was performed)
     */
    get scannedFeet(): string[];
}
//# sourceMappingURL=Tokenization.d.ts.map