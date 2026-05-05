/**
 * Tokenization module
 * Ported from latin_macronizer/tokenization.py
 * Handles Latin text tokenization with enclitic support
 */
import { Token } from './Token.js';
import { alignMacronized } from './alignMacronized.js';
import { toAscii, isWhitespace, isSentenceEnder, splitEnclitic, tagDistance, levenshteinDistance, underscoreToUnicode, unicodeToUnderscore } from '../utils/latin.js';
/**
 * Tokenization class - splits Latin text into tokens
 * Handles enclitics (-que, -ve, -ne), sentence boundaries
 */
export class Tokenization {
    constructor(text, options = {}) {
        Object.defineProperty(this, "tokens", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "text", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.text = text;
        this.tokenize(text, options);
        this.detectSentenceBoundaries();
    }
    /**
     * Main tokenization method
     */
    tokenize(text, options) {
        const { preserveWhitespace = false } = options;
        this.tokens = [];
        let position = 0;
        let currentWord = '';
        let wordStart = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            // Check if character is part of a word
            if (/\w/.test(char) || char === '-' || char === '_') {
                if (currentWord === '') {
                    wordStart = position;
                }
                currentWord += char;
            }
            else {
                // End of word - process it
                if (currentWord) {
                    this.addWordToken(currentWord, wordStart, position);
                    currentWord = '';
                }
                // Handle whitespace and punctuation
                if (isWhitespace(char)) {
                    if (preserveWhitespace) {
                        this.tokens.push(new Token(char, {
                            isWord: false,
                            isSpace: true,
                            startIndex: position,
                            endIndex: position + 1
                        }));
                    }
                }
                else {
                    // Punctuation
                    const isSentEnder = isSentenceEnder(char);
                    this.tokens.push(new Token(char, {
                        isWord: false,
                        isSpace: false,
                        endssentence: isSentEnder,
                        startIndex: position,
                        endIndex: position + 1
                    }));
                    // Mark previous token as sentence ender if needed
                    if (isSentEnder && this.tokens.length > 1) {
                        const prevIdx = this.tokens.length - 2;
                        this.tokens[prevIdx] = this.tokens[prevIdx].with({
                            endssentence: true
                        });
                    }
                }
            }
            position++;
        }
        // Handle final word
        if (currentWord) {
            this.addWordToken(currentWord, wordStart, position);
        }
    }
    /**
     * Detect sentence boundaries and mark startssentence on tokens
     */
    detectSentenceBoundaries() {
        let startOfSentence = true;
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            if (token.isWord) {
                if (startOfSentence) {
                    this.tokens[i] = token.with({ startssentence: true });
                    startOfSentence = false;
                }
                if (token.endssentence) {
                    startOfSentence = true;
                }
            }
            else if (token.endssentence) {
                startOfSentence = true;
            }
        }
    }
    /**
     * Add a word token, handling enclitics
     */
    addWordToken(word, start, end) {
        const asciiWord = toAscii(word);
        const encliticSplit = splitEnclitic(asciiWord);
        if (encliticSplit) {
            const [stem, enclitic] = encliticSplit;
            // Add stem token (marked as having enclitic)
            this.tokens.push(new Token(stem, {
                isWord: true,
                isSpace: false,
                hasEnclitic: true,
                startIndex: start,
                endIndex: start + stem.length,
                text: stem
            }));
            // Add enclitic token
            this.tokens.push(new Token(enclitic, {
                isWord: true,
                isSpace: false,
                isEnclitic: true,
                startIndex: start + stem.length,
                endIndex: end,
                text: enclitic
            }));
        }
        else {
            // Regular word
            this.tokens.push(new Token(word, {
                isWord: true,
                isSpace: false,
                startIndex: start,
                endIndex: end,
                text: word
            }));
        }
    }
    /**
     * Get all word forms for lookup
     */
    allWordForms() {
        const forms = [];
        for (const token of this.tokens) {
            if (token.isWord && !token.isEnclitic) {
                forms.push(toAscii(token.text).toLowerCase());
            }
        }
        return [...new Set(forms)]; // Remove duplicates
    }
    /**
     * Split tokens for wordlist lookup
     */
    splitTokens(wordlist) {
        // TODO: Implement token splitting based on wordlist
        // This handles compound words and contractions
        return [];
    }
    /**
     * Add tags to tokens from RFTagger output
     */
    addTags(tags) {
        let tagIdx = 0;
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            if (token.isWord && !token.isEnclitic) {
                if (tagIdx < tags.length) {
                    this.tokens[i] = token.with({
                        // Convert RFTagger dots to dashes to match wordlist format (n.-.s. → n-s--)
                        tag: tags[tagIdx].tag.replace(/\./g, '-')
                    });
                    tagIdx++;
                }
            }
        }
    }
    /**
     * Tag tokens using WasmTagger
     * Gets words from tokens and applies POS tags from RFTagger
     */
    async tagWithWasm(tagger) {
        // Extract word forms for tagging (only words, not punctuation/enclitics)
        const wordsToTag = [];
        const tokenIndices = []; // Keep track of which tokens get tags
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            if (token.isWord && !token.isEnclitic) {
                wordsToTag.push(toAscii(token.text).toLowerCase());
                tokenIndices.push(i);
            }
        }
        if (wordsToTag.length === 0) {
            return;
        }
        // Tag with RFTagger
        const tagResults = tagger.tag(wordsToTag);
        // Apply tags back to tokens (clean RFTagger dots: "n.-.s." → "n-s--")
        for (let i = 0; i < tokenIndices.length && i < tagResults.length; i++) {
            const tokenIdx = tokenIndices[i];
            const result = tagResults[i];
            this.tokens[tokenIdx] = this.tokens[tokenIdx].with({
                // Convert RFTagger dot-separated tags to dash-only format to match wordlist
                tag: result.tag.replace(/\./g, '-'),
                confidence: result.confidence
            });
        }
    }
    /**
     * Add lemmas to tokens using LemmaEngine
     */
    addLemmas(lemmaEngine) {
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            // Only add lemmas to word tokens
            if (token.isWord && !token.isEnclitic) {
                // Look up lemma by word form and POS tag
                const lemmaEntry = lemmaEngine.lookup(token.text, token.tag);
                if (lemmaEntry) {
                    this.tokens[i] = token.with({
                        lemma: lemmaEntry.lemma
                    });
                }
                else {
                    // Fallback: use normalized word form as lemma
                    this.tokens[i] = token.with({
                        lemma: toAscii(token.text).toLowerCase()
                    });
                }
            }
        }
    }
    /**
     * Get accents for tokens
     * Ported from latin_macronizer/tokenization.py (getaccents method)
     * Determines the best accented form (with _ markers) for each token
     */
    async getAccents(wordlistEngine, endingEngine) {
        // Helper: check if string is title case (first letter uppercase, rest lowercase)
        const isTitleCase = (s) => {
            if (!s)
                return false;
            return s[0] === s[0].toUpperCase() && s.slice(1) === s.slice(1).toLowerCase();
        };
        for (let idx = 0; idx < this.tokens.length; idx++) {
            const token = this.tokens[idx];
            if (!token.isWord)
                continue;
            const wordformAscii = toAscii(token.text);
            const wordformLower = wordformAscii.toLowerCase();
            const tag = token.tag;
            const lemma = token.lemma;
            const isCapital = /^[A-Z]/.test(token.text);
            let accented = [];
            let isUnknown = false;
            let isAmbiguous = false;
            // Special enclitic cases
            if (token.isenclitic) {
                accented = [token.text.toLowerCase() === 'ue' ? 've' : token.text.toLowerCase()];
            }
            else if (token.text.toLowerCase() === 'ne' && token.hasenclitic) {
                accented = ['ne'];
            }
            else {
                // Try wordlist: get all entries for this wordform
                let entries = [];
                try {
                    entries = await wordlistEngine.getAllEntries(wordformLower);
                }
                catch (error) {
                    // Wordlist lookup failed (e.g., IndexedDB error); treat as unknown
                    console.warn('getAllEntries error for', wordformLower, error);
                    entries = [];
                }
                // DEBUG logging for problematic words
                const debugWords = ['matrona', 'longissime', 'minime', 'sequana', 'eos', 'hi'];
                const shouldLog = debugWords.includes(wordformLower);
                if (shouldLog) {
                    console.log(`\n=== DEBUG ${wordformLower} ===`);
                    console.log('Token:', token.text, 'Tag:', tag, 'Lemma:', lemma);
                    console.log('Entries count:', entries.length);
                }
                if (entries.length > 0) {
                    const allAccented = entries.map(e => e.accentedUnderscore).filter(a => a !== undefined);
                    const uniqueAccented = Array.from(new Set(allAccented));
                    if (uniqueAccented.length === 1) {
                        accented = [uniqueAccented[0]];
                        if (shouldLog)
                            console.log('Single candidate:', accented[0]);
                    }
                    else {
                        // Multiple candidates: rank them
                        const candidates = [];
                        for (const entry of entries) {
                            if (!entry.accentedUnderscore)
                                continue;
                            const lexLemma = entry.lemma;
                            const lexTag = entry.tag;
                            const lexIsTitle = isTitleCase(lexLemma);
                            const tokenIsTitle = isTitleCase(token.text);
                            const casedist = (tokenIsTitle === lexIsTitle || (token.startssentence && tokenIsTitle)) ? 0 : 1;
                            const tagdist = tagDistance(tag, lexTag);
                            const lemdist = levenshteinDistance(lemma, lexLemma);
                            candidates.push({ casedist, tagdist, lemdist, accented: entry.accentedUnderscore });
                            if (shouldLog) {
                                console.log(`  Entry: lemma=${lexLemma}, tag=${lexTag}, accented=${entry.accentedUnderscore}`);
                                console.log(`    -> casedist=${casedist}, tagdist=${tagdist}, lemdist=${lemdist}`);
                            }
                        }
                        // Sort by casedist, then tagdist, then lemdist (exact match to Python)
                        candidates.sort((a, b) => {
                            if (a.casedist !== b.casedist)
                                return a.casedist - b.casedist;
                            if (a.tagdist !== b.tagdist)
                                return a.tagdist - b.tagdist;
                            return a.lemdist - b.lemdist;
                        });
                        if (candidates.length > 0) {
                            // Already sorted by (casedist, tagdist, lemdist)
                            // Get all candidates with the best (lowest) casedist
                            const bestCasedist = candidates[0].casedist;
                            // Sort by full ranking again to ensure best (tagdist, lemdist) comes first
                            const bestCandidates = candidates
                                .filter(c => c.casedist === bestCasedist)
                                .sort((a, b) => {
                                if (a.tagdist !== b.tagdist)
                                    return a.tagdist - b.tagdist;
                                return a.lemdist - b.lemdist;
                            });
                            // Extract accented forms preserving order
                            const bestAccented = bestCandidates.map(c => c.accented);
                            // Deduplicate while preserving order
                            const seen = new Set();
                            const uniq = [];
                            for (const acc of bestAccented) {
                                if (!seen.has(acc)) {
                                    seen.add(acc);
                                    uniq.push(acc);
                                }
                            }
                            accented = uniq;
                            isAmbiguous = uniq.length > 1;
                            if (shouldLog) {
                                console.log(`Sorted candidates (first 5):`, candidates.slice(0, 5));
                                console.log(`Selected first: ${accented[0]}, ambiguous=${isAmbiguous}`);
                            }
                        }
                        else {
                            accented = [token.text];
                        }
                    }
                }
                else {
                    // Unknown word: try ending patterns
                    isUnknown = true;
                    accented = [token.text];
                    if (/[aeiouy]/i.test(token.text)) {
                        const patterns = endingEngine.getPatterns(token.text, tag);
                        for (const pattern of patterns) {
                            const plainEnding = pattern.suffix;
                            if (wordformLower.endsWith(plainEnding)) {
                                const originalLower = token.text.toLowerCase();
                                const stemOriginal = originalLower.slice(0, -plainEnding.length);
                                // Convert Unicode macron in replacement to underscore notation for accented field
                                const replacementUnderscore = unicodeToUnderscore(pattern.replacement);
                                const candidate = stemOriginal + replacementUnderscore;
                                accented = [candidate];
                                break;
                            }
                        }
                    }
                }
            }
            // Update token with accented candidates and flags
            this.tokens[idx] = token.with({
                accented,
                isAmbiguous,
                isUnknown
            });
        }
    }
    /**
     * Apply macronization to all tokens
     */
    macronize(domacronize, alsomaius, performutov, performitoj, endingEngine) {
        console.log(`[macronize] START: tokens=${this.tokens.length}, domacronize=${domacronize}`);
        const debugWords = ['matrona', 'matrona'];
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            const shouldLog = debugWords.includes(token.text.toLowerCase());
            if (shouldLog)
                console.log(`[macronize] Processing token[${i}]: "${token.text}", isWord=${token.isWord}`);
            if (token.isWord) {
                this.tokens[i] = this.macronizeToken(token, domacronize, alsomaius, performutov, performitoj, endingEngine);
            }
        }
    }
    /**
     * Macronize single token
     * Ported from latin_macronizer/tokenization.py (macronize method)
     * Uses DP alignment to add macrons to the token's accented form
     */
    macronizeToken(token, domacronize, alsomaius, performutov, performitoj, endingEngine) {
        // DEBUG logging for problematic words - EARLY
        const debugWordsAlign = ['matrona', 'longissime', 'minime', 'sequana', 'eos', 'hi', 'matrona'];
        const shouldLogAlign = debugWordsAlign.includes(token.text.toLowerCase());
        if (shouldLogAlign) {
            console.log(`\n[macronizeToken] START: token="${token.text}", domacronize=${domacronize}`);
        }
        // Apply orthographic conversions first
        let text = token.text;
        if (performutov) {
            text = text.replace(/u/g, 'v').replace(/U/g, 'V');
        }
        if (performitoj) {
            text = text.replace(/i/g, 'j').replace(/I/g, 'J');
        }
        if (!domacronize) {
            if (shouldLogAlign)
                console.log(`  domacronize=false, returning early`);
            return token.with({ text });
        }
        // Get the accented form (with _ markers) from getAccents
        const accentedCandidates = token.accented;
        if (shouldLogAlign) {
            console.log(`  accentedCandidates:`, accentedCandidates);
        }
        if (!accentedCandidates || accentedCandidates.length === 0) {
            // No accented form available, fallback
            if (shouldLogAlign)
                console.log(`  ${token.text}: NO accented candidates, fallback to plain`);
            return token.with({ text, macronized: true });
        }
        // Use the first (best) accented candidate
        let accentedUnderscore = accentedCandidates[0];
        if (shouldLogAlign) {
            console.log(`\n=== ALIGN ${token.text} ===`);
            console.log('  Input text:', text);
            console.log('  Accented candidates:', accentedCandidates);
            console.log('  Selected accented[0]:', accentedUnderscore);
        }
        // Clean: remove '^' markers and '_^' sequences (as in Python Token.macronize)
        // This ensures breve markers are ignored and only macrons (underscore) are used
        // NOTE: In JS regex, '^' is an anchor unless escaped. Use /\^/ for literal caret.
        const accentedBeforeClean = accentedUnderscore;
        accentedUnderscore = accentedUnderscore.replace(/_\^/g, '').replace(/\^/g, '');
        if (shouldLogAlign && accentedBeforeClean !== accentedUnderscore) {
            console.log('  After breve cleaning:', accentedUnderscore);
        }
        // If accented form became empty after cleaning, fallback to plain text
        if (!accentedUnderscore) {
            if (shouldLogAlign)
                console.log('  Accented became empty after cleaning, fallback to plain');
            return token.with({ text, macronized: true });
        }
        // Apply DP alignment to produce macronized output
        const alignOptions = {
            domacronize: true,
            alsomaius: alsomaius,
            performutov: performutov,
            performitoj: performitoj
        };
        const macronizedUnderscore = alignMacronized(text, accentedUnderscore, alignOptions);
        if (shouldLogAlign) {
            console.log('  DP result (underscore):', macronizedUnderscore);
            console.log('  DP result (unicode):', macronizedUnderscore ? underscoreToUnicode(macronizedUnderscore) : 'null');
        }
        let macronizedUnicode;
        if (macronizedUnderscore === null) {
            // Alignment failed, fallback: convert accentedUnderscore directly
            macronizedUnicode = underscoreToUnicode(accentedUnderscore);
        }
        else {
            macronizedUnicode = underscoreToUnicode(macronizedUnderscore);
        }
        if (shouldLogAlign) {
            console.log(`  Final unicode: "${macronizedUnicode}"`);
        }
        return token.with({
            text: macronizedUnicode,
            macronized: true
        });
    }
    /**
     * Convert tokens back to text
     */
    detokenize(markAmbigs = false) {
        var _a, _b, _c;
        let result = '';
        let lastEnd = 0;
        for (const token of this.tokens) {
            const start = (_a = token.startIndex) !== null && _a !== void 0 ? _a : lastEnd;
            // Add spaces between words if needed
            if (start > lastEnd && !result.endsWith(' ')) {
                result += ' ';
            }
            // Add token text
            const text = (_b = token.macronizedText) !== null && _b !== void 0 ? _b : token.text;
            if (markAmbigs && token.isAmbiguous) {
                result += `<span class="ambig">${text}</span>`;
            }
            else if (token.isUnknown) {
                result += `<span class="unknown">${text}</span>`;
            }
            else {
                result += text;
            }
            lastEnd = (_c = token.endIndex) !== null && _c !== void 0 ? _c : (start + text.length);
        }
        return result;
    }
    /**
     * Get plain text without HTML
     */
    getPlainText() {
        return this.tokens
            .map(t => { var _a; return (_a = t.macronizedText) !== null && _a !== void 0 ? _a : t.text; })
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    /**
     * Scan verses using meter automata
     */
    scanVerses(meters) {
        // TODO: Implement scansion using meter automata
    }
    /**
     * Get scanned feet (if scansion was performed)
     */
    get scannedFeet() {
        // TODO: Return scansion feet
        return [];
    }
}
//# sourceMappingURL=Tokenization.js.map