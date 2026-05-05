/**
 * Macronizer.ts
 * Core macronization engine integrating WASM RFTagger with Latin rules
 * Orchestrates tokenization, POS tagging, and vowel length assignment
 */
import { Tokenizer } from './Tokenizer.js';
import { Tokenization } from './Tokenization.js';
import { WasmTagger, FallbackTagger } from '../analysis/WasmTagger.js';
import { LemmaEngine } from '../analysis/LemmaEngine.js';
import { EndingPatternEngine } from '../analysis/EndingPatternEngine.js';
import { EditDistanceEngine } from '../analysis/EditDistanceEngine.js';
import { WordlistEngine } from '../analysis/WordlistEngine.js';
import { MorpheusAnalyzer } from '../analysis/MorpheusAnalyzer.js';
/**
 * Main macronization engine
 * Coordinates all components for Latin text processing
 */
export class Macronizer {
    constructor(options = {}) {
        var _a, _b, _c;
        Object.defineProperty(this, "tokenizer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tokenization", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tagger", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lemmaEngine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "endingEngine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "editDistanceEngine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "wordlistEngine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "morpheusAnalyzer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "useWasm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "confidenceThreshold", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "wordlistUrl", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "morpheusWasmPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.useWasm = (_a = options.useWasm) !== null && _a !== void 0 ? _a : true;
        this.confidenceThreshold = (_b = options.confidenceThreshold) !== null && _b !== void 0 ? _b : 0.80;
        this.cache = new Map();
        this.tokenizer = new Tokenizer();
        this.tokenization = new Tokenization('', { preserveWhitespace: true });
        this.lemmaEngine = new LemmaEngine();
        this.endingEngine = new EndingPatternEngine();
        this.editDistanceEngine = new EditDistanceEngine();
        this.wordlistEngine = new WordlistEngine();
        this.wordlistUrl = options.wordlistUrl;
        this.morpheusWasmPath = options.morpheusWasmPath || 'public/wasm/cruncher.js';
        // Initialize tagger based on configuration
        if (this.useWasm) {
            this.tagger = new WasmTagger({
                modelPath: options.wasmModelPath,
                enableCache: (_c = options.enableCache) !== null && _c !== void 0 ? _c : true,
            });
        }
        else {
            this.tagger = new FallbackTagger();
        }
        // Initialize Morpheus for unknown word analysis
        this.morpheusAnalyzer = new MorpheusAnalyzer(this.morpheusWasmPath);
    }
    /**
     * Initialize the macronizer (load WASM module if enabled)
     */
    async initialize() {
        if (this.useWasm) {
            const wasmTagger = this.tagger;
            await wasmTagger.initialize();
        }
        // Load lemma dictionary and patterns
        await this.lemmaEngine.load();
        await this.endingEngine.load();
        // Initialize Morpheus and connect to WordlistEngine
        if (this.morpheusAnalyzer) {
            await this.morpheusAnalyzer.initialize();
            this.wordlistEngine.setMorpheusAnalyzer(this.morpheusAnalyzer);
            console.log('[Macronizer] Morpheus initialized and connected to WordlistEngine');
        }
        // Load wordlist if URL provided
        if (this.wordlistUrl) {
            const isPopulated = await this.wordlistEngine.isPopulated();
            if (!isPopulated) {
                console.log('Loading wordlist into IndexedDB...');
                await this.wordlistEngine.loadFromUrl(this.wordlistUrl, (count) => {
                    if (count % 10000 === 0) {
                        console.log(`Loaded ${count} wordlist entries...`);
                    }
                });
                console.log(`Wordlist loaded: ${this.wordlistEngine.size()} entries`);
            }
            else {
                console.log(`Wordlist already in IndexedDB: ${this.wordlistEngine.size()} entries`);
            }
        }
    }
    /**
     * Macronize Latin text
     * Main entry point for text processing
     * Uses Tokenization pipeline with DP alignment
     */
    async macronize(text) {
        const startTime = performance.now();
        // Check cache
        const cacheKey = text;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        // Step 1: Tokenize (preserve whitespace for accurate reconstruction)
        const tokenization = new Tokenization(text, { preserveWhitespace: true });
        const originalTokens = tokenization.tokens.map(t => t.with({}));
        // Step 2: POS Tagging (WASM or fallback)
        if (this.useWasm && this.tagger.isReady()) {
            await tokenization.tagWithWasm(this.tagger);
        }
        else {
            const wordsToTag = tokenization.allWordForms();
            const fallbackResults = this.tagger.tag(wordsToTag);
            tokenization.addTags(fallbackResults.map(r => ({ word: r.token, tag: r.tag })));
        }
        // Step 3: Add lemmas
        tokenization.addLemmas(this.lemmaEngine);
        // Step 4: Get accents (wordlist lookup + candidate ranking)
        await tokenization.getAccents(this.wordlistEngine, this.endingEngine);
        // Step 5: Macronize (DP alignment with alsomaius)
        console.log('[Macronizer] Calling tokenization.macronize()...');
        tokenization.macronize(true, true, false, false, this.endingEngine);
        console.log('[Macronizer] tokenization.macronize() done');
        // Final tokens
        const macronizedTokens = tokenization.tokens;
        // Step 6: Reconstruct text
        const macronizedText = tokenization.detokenize();
        // Calculate confidence
        const confidence = this.calculateConfidence(originalTokens, macronizedTokens);
        const result = {
            original: text,
            macronized: macronizedText,
            tokens: originalTokens,
            taggedTokens: macronizedTokens,
            confidence,
            processingTime: performance.now() - startTime,
        };
        // Cache result
        this.cache.set(cacheKey, result);
        return result;
    }
    /**
     * Tag tokens with POS tags
     */
    async tagTokens(tokens) {
        // Filter only word tokens (exclude punctuation, numbers)
        const wordTokens = tokens.filter(t => this.isWordToken(t));
        const tokenTexts = wordTokens.map(t => t.text.toLowerCase());
        if (tokenTexts.length === 0) {
            return tokens;
        }
        try {
            // Use WASM tagger if available
            if (this.useWasm && this.tagger.isReady()) {
                const tagResults = this.tagger.tag(tokenTexts);
                // Map tags back to word tokens only
                let resultIdx = 0;
                return tokens.map((token) => {
                    if (!this.isWordToken(token)) {
                        // Non-word tokens keep their original tag (or empty)
                        return token.with({ tag: 'u.-.-.-.-.-.-.-.-' });
                    }
                    const tagResult = tagResults[resultIdx++];
                    return token.with({
                        tag: tagResult.tag,
                        confidence: tagResult.confidence,
                    });
                });
            }
            else {
                // Fallback to JavaScript tagger
                const tagResults = this.tagger.tag(tokenTexts);
                let resultIdx = 0;
                return tokens.map((token) => {
                    if (!this.isWordToken(token)) {
                        return token.with({ tag: 'u.-.-.-.-.-.-.-.-' });
                    }
                    const tagResult = tagResults[resultIdx++];
                    return token.with({
                        tag: tagResult.tag,
                    });
                });
            }
        }
        catch (error) {
            console.warn('POS tagging failed, using fallback:', error);
            // Fallback to morphological analysis
            return this.fallbackTagging(tokens);
        }
    }
    /**
     * Check if token is a word (not punctuation or number)
     */
    isWordToken(token) {
        const text = token.text;
        // Must contain at least one letter
        return /[a-zA-Z\u00C0-\u024F]/.test(text);
    }
    /**
     * Fallback tagging using morphological rules
     */
    fallbackTagging(tokens) {
        return tokens.map(token => {
            const tag = this.endingEngine.inferTag(token.text);
            return token.with({ tag });
        });
    }
    /**
     * Apply macronization to tagged tokens
     */
    async applyMacronization(tokens) {
        const results = [];
        for (const token of tokens) {
            const macronized = await this.macronizeToken(token);
            results.push(macronized);
        }
        return results;
    }
    /**
     * Macronize a single token
     * Priority: Wordlist → Lemma lookup → Pattern matching → Edit distance → Heuristics
     */
    async macronizeToken(token) {
        // Skip punctuation and numbers
        if (token.isPunctuation() || token.isNumber()) {
            return token.with({ macronized: true });
        }
        const text = token.text;
        const tag = token.tag;
        // Step 0: Wordlist lookup with Morpheus fallback for unknown words
        const wordlistResult = await this.wordlistEngine.lookupOrAnalyze(text, tag);
        if (wordlistResult) {
            return token.with({
                text: wordlistResult,
                macronized: true,
                confidence: 0.95
            });
        }
        // Step 1: Lemma dictionary lookup
        const lemmaResult = this.lemmaEngine.lookup(text, tag);
        if (lemmaResult) {
            return token.with({
                macronized: true,
                lemma: lemmaResult.lemma,
            });
        }
        // Step 2: Ending pattern matching
        const patternResult = this.endingEngine.apply(text, tag);
        if (patternResult) {
            return token.with({
                text: patternResult,
                macronized: true,
            });
        }
        // Step 3: Edit distance to known forms
        const editResult = this.editDistanceEngine.findClosest(text, tag);
        if (editResult && editResult.distance <= 2) {
            return token.with({
                text: editResult.word,
                macronized: true,
            });
        }
        // Step 4: Heuristic rules based on POS tag
        const heuristicResult = this.applyHeuristics(text, tag);
        if (heuristicResult) {
            return token.with({
                text: heuristicResult,
                macronized: true,
            });
        }
        // Return unchanged if no macronization possible
        return token.with({ macronized: true });
    }
    /**
     * Apply heuristic rules for vowel length
     */
    applyHeuristics(word, tag) {
        const lower = word.toLowerCase();
        // Verbs: long vowels in certain positions
        if (tag.charAt(0) === 'v') {
            // Infinitives often have long vowels
            if (lower.endsWith('re') || lower.endsWith('ēre')) {
                return this.ensureLongVowel(word, -3);
            }
        }
        // Nouns: common patterns
        if (tag.charAt(0) === 'n') {
            // First declension nominative singular often long
            if (lower.endsWith('a') && !lower.endsWith('ia')) {
                return this.ensureLongVowel(word, -2);
            }
        }
        return null;
    }
    /**
     * Ensure vowel at position is long (add macron)
     */
    ensureLongVowel(word, position) {
        const idx = position < 0 ? word.length + position : position;
        if (idx < 0 || idx >= word.length)
            return word;
        const vowel = word[idx].toLowerCase();
        if ('aeiouy'.includes(vowel)) {
            const macronMap = {
                'a': 'ā', 'e': 'ē', 'i': 'ī', 'o': 'ō', 'u': 'ū', 'y': 'ȳ',
            };
            return word.substring(0, idx) + macronMap[vowel] + word.substring(idx + 1);
        }
        return word;
    }
    /**
     * Calculate overall confidence score
     */
    calculateConfidence(tokens, macronized) {
        let totalConfidence = 0;
        let count = 0;
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const mac = macronized[i];
            // High confidence for lemma matches
            if (this.lemmaEngine.hasLemma(token.text)) {
                totalConfidence += 0.95;
            }
            // Medium confidence for pattern matches
            else if (this.endingEngine.hasPattern(token.text)) {
                totalConfidence += 0.85;
            }
            // Lower confidence for edit distance
            else if (mac.text !== token.text) {
                totalConfidence += 0.75;
            }
            // Default confidence
            else {
                totalConfidence += 0.60;
            }
            count++;
        }
        return count > 0 ? totalConfidence / count : 0;
    }
    /**
     * Batch process multiple texts
     */
    async macronizeBatch(texts) {
        const results = [];
        for (const text of texts) {
            const result = await this.macronize(text);
            results.push(result);
        }
        return results;
    }
    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        if (this.useWasm) {
            this.tagger.clearCache();
        }
    }
    /**
     * Get cache size
     */
    getCacheSize() {
        return this.cache.size;
    }
    /**
     * Check if initialized
     */
    isReady() {
        if (this.useWasm) {
            return this.tagger.isReady();
        }
        return true;
    }
    /**
     * Destroy resources
     */
    destroy() {
        if (this.useWasm) {
            this.tagger.destroy();
        }
        this.wordlistEngine.close();
        this.cache.clear();
    }
}
//# sourceMappingURL=Macronizer.js.map