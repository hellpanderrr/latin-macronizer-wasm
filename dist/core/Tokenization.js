/**
 * Tokenization module
 * Ported from latin_macronizer/tokenization.py
 * Handles Latin text tokenization with enclitic support
 */
import { Token } from './Token.js';
import { normalizeTag } from '../utils/latin.js';
import { scanVerses as doScanVerses } from './Scansion.js';
import { alignMacronized } from './alignMacronized.js';
import { toAscii, isWhitespace, isSentenceEnder, splitEnclitic, tagDistance, levenshteinDistance, underscoreToUnicode, unicodeToUnderscore, prefixesWithShortJ } from '../utils/latin.js';
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
        Object.defineProperty(this, "originalText", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_scannedFeet", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        this.text = text;
        this.originalText = text;
        this.tokenize(text, options);
        this.detectSentenceBoundaries();
    }
    /**
     * Main tokenization method
     */
    /**
     * Tokenize text into words, whitespace, and punctuation.
     * Sentence boundary detection matches Python tokenization.py exactly:
     * - A punctuation mark (.;:?!) ends a sentence ONLY if the preceding word
     *   was longer than 1 character. This prevents false boundaries at Latin
     *   abbreviations like "M." (Marcus), "L." (Lucius), "ā. d." (ante diem).
     * - Single-char words + period do NOT end the sentence.
     */
    tokenize(text, options) {
        const { preserveWhitespace = false } = options;
        this.tokens = [];
        let position = 0;
        let currentWord = '';
        let wordStart = 0;
        // Python: possiblesentenceend tracks whether the previous word token is
        // long enough to plausibly end a sentence
        let possibleSentenceEnd = false;
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
                    // Python: possiblesentenceend = (len(token.text) > 1)
                    possibleSentenceEnd = (currentWord.length > 1);
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
                    // Python: elif possiblesentenceend and any(i in token.text for i in '.;:?!'):
                    const isSentEnder = isSentenceEnder(char);
                    const endsSentence = possibleSentenceEnd && isSentEnder;
                    this.tokens.push(new Token(char, {
                        isWord: false,
                        isSpace: false,
                        endssentence: endsSentence,
                        startIndex: position,
                        endIndex: position + 1
                    }));
                    // After a sentence-ending punctuation, reset
                    if (endsSentence) {
                        possibleSentenceEnd = false;
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
     * Add a word token (without splitting enclitics yet)
     */
    addWordToken(word, start, end) {
        // Simply add the word as a single token; enclitic splitting will be done later
        this.tokens.push(new Token(word, {
            isWord: true,
            isSpace: false,
            startIndex: start,
            endIndex: end,
            text: word
        }));
    }
    /**
     * Split enclitics after wordlist is loaded (Python's two-pass strategy)
     * Returns list of word forms that need to be tagged (excluding enclitics)
     */
    async splitEnclitics(wordlistEngine) {
        var _a, _b;
        const newTokens = [];
        const wordFormsToTag = [];
        for (const token of this.tokens) {
            if (!token.isWord || token.isenclitic) {
                newTokens.push(token);
                continue;
            }
            const asciiLower = toAscii(token.text).toLowerCase();
            // Check if we should split this word (use getAllEntries since wordExists is private)
            const existingEntries = await wordlistEngine.getAllEntries(asciiLower);
            const exists = existingEntries.length > 0;
            const shouldSplit = asciiLower !== 'que' && (!exists || Tokenization.specialEncliticWords.has(asciiLower));
            if (!shouldSplit) {
                newTokens.push(token);
                if (token.isWord)
                    wordFormsToTag.push(asciiLower);
                continue;
            }
            // Determine how to split
            let parts = [];
            let stemText = '';
            let encliticText = null;
            let isEncliticSplit = false;
            const tokenStart = (_a = token.startIndex) !== null && _a !== void 0 ? _a : 0;
            const tokenEnd = (_b = token.endIndex) !== null && _b !== void 0 ? _b : tokenStart + token.text.length;
            // Special cases: nec, necnon, dividenda
            if (asciiLower === 'nec') {
                stemText = token.text.slice(0, -1);
                encliticText = token.text.slice(-1);
                isEncliticSplit = true;
            }
            else if (asciiLower === 'necnon') {
                // Split at 3 (no enclitic), then split first part at 1 (with enclitic)
                const part1Text = token.text.slice(0, -3); // "nec"
                const part2Text = token.text.slice(-3); // "non"
                const part1Stem = part1Text.slice(0, -1); // "ne"
                const part1Enclitic = part1Text.slice(-1); // "c"
                // Create tokens: "ne" (hasEnclitic), "c" (isEnclitic), "non" (regular)
                const neToken = new Token(part1Stem, {
                    isWord: true,
                    isSpace: false,
                    hasenclitic: true,
                    startssentence: token.startssentence,
                    startIndex: tokenStart,
                    endIndex: tokenStart + part1Stem.length,
                    text: part1Stem
                });
                const cToken = new Token(part1Enclitic, {
                    isWord: true,
                    isSpace: false,
                    isenclitic: true,
                    startIndex: tokenStart + part1Stem.length,
                    endIndex: tokenStart + part1Stem.length + part1Enclitic.length,
                    text: part1Enclitic
                });
                const nonToken = new Token(part2Text, {
                    isWord: true,
                    isSpace: false,
                    startIndex: tokenStart + part1Stem.length + part1Enclitic.length,
                    endIndex: tokenEnd,
                    text: part2Text
                });
                parts = [neToken, cToken, nonToken];
                // Add non-enclitic word forms for tagging
                wordFormsToTag.push(toAscii(part1Stem).toLowerCase());
                wordFormsToTag.push(toAscii(part2Text).toLowerCase());
                newTokens.push(...parts);
                continue;
            }
            else if (asciiLower in Tokenization.dividenda && !exists) {
                // Only split dividenda compounds if word is unknown (matches Python behavior)
                const splitPos = Tokenization.dividenda[asciiLower];
                const stemPart = token.text.slice(0, -splitPos);
                const restPart = token.text.slice(-splitPos);
                const stemToken = new Token(stemPart, {
                    isWord: true,
                    isSpace: false,
                    startssentence: token.startssentence,
                    startIndex: tokenStart,
                    endIndex: tokenStart + stemPart.length,
                    text: stemPart
                });
                const restToken = new Token(restPart, {
                    isWord: true,
                    isSpace: false,
                    startIndex: tokenStart + stemPart.length,
                    endIndex: tokenEnd,
                    text: restPart
                });
                parts = [stemToken, restToken];
                wordFormsToTag.push(toAscii(stemPart).toLowerCase());
                wordFormsToTag.push(toAscii(restPart).toLowerCase());
                newTokens.push(...parts);
                continue;
            }
            else {
                // Generic enclitic split using utility
                const splitResult = splitEnclitic(asciiLower);
                if (!splitResult) {
                    // No split pattern matched, keep original
                    newTokens.push(token);
                    wordFormsToTag.push(asciiLower);
                    continue;
                }
                [stemText, encliticText] = splitResult;
                isEncliticSplit = true;
            }
            // Create tokens for enclitic split (nec or generic)
            if (isEncliticSplit) {
                const stemToken = new Token(stemText, {
                    isWord: true,
                    isSpace: false,
                    hasenclitic: true,
                    startssentence: token.startssentence,
                    startIndex: tokenStart,
                    endIndex: tokenStart + stemText.length,
                    text: stemText
                });
                const encliticToken = new Token(encliticText, {
                    isWord: true,
                    isSpace: false,
                    isenclitic: true,
                    startIndex: tokenStart + stemText.length,
                    endIndex: tokenEnd,
                    text: encliticText
                });
                parts = [stemToken, encliticToken];
                wordFormsToTag.push(toAscii(stemText).toLowerCase());
                newTokens.push(stemToken, encliticToken);
            }
        }
        this.tokens = newTokens;
        return wordFormsToTag;
    }
    /**
     * Get all word forms for lookup
     */
    allWordForms() {
        const forms = [];
        for (const token of this.tokens) {
            if (token.isWord && !token.isenclitic) {
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
            if (token.isWord && !token.isenclitic) {
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
        // Match Python addtags() exactly:
        // - Skip whitespace
        // - ALL-CAPS → lowercase
        // - hasenclitic: save bearer, skip
        // - isenclitic: write enclitic text, then write saved bearer
        // - endssentence: sentence boundary
        const sentences = [[]];
        const sentenceTokenIndices = [[]];
        let savedBearer = null;
        let savedBearerIdx = -1;
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            if (!token.isspace) {
                let tokentext = token.text;
                if (tokentext === tokentext.toUpperCase() && tokentext.length > 1) {
                    tokentext = tokentext.toLowerCase();
                }
                if (token.hasenclitic) {
                    savedBearer = toAscii(tokentext);
                    savedBearerIdx = i;
                }
                else {
                    sentences[sentences.length - 1].push(toAscii(tokentext));
                    sentenceTokenIndices[sentenceTokenIndices.length - 1].push(i);
                    if (token.isenclitic && savedBearer !== null) {
                        sentences[sentences.length - 1].push(savedBearer);
                        sentenceTokenIndices[sentenceTokenIndices.length - 1].push(savedBearerIdx);
                        savedBearer = null;
                    }
                }
            }
            if (token.endssentence) {
                sentences.push([]);
                sentenceTokenIndices.push([]);
            }
        }
        // Remove trailing empty sentence
        while (sentences.length > 0 && sentences[sentences.length - 1].length === 0) {
            sentences.pop();
            sentenceTokenIndices.pop();
        }
        if (sentences.length === 0)
            return;
        // Tag all sentences
        const allResults = tagger.tagSentences(sentences);
        // Apply tags back to tokens
        for (let s = 0; s < sentences.length; s++) {
            const sentTags = allResults[s];
            const indices = sentenceTokenIndices[s];
            for (let w = 0; w < indices.length && w < sentTags.length; w++) {
                const tokenIdx = indices[w];
                const result = sentTags[w];
                this.tokens[tokenIdx] = this.tokens[tokenIdx].with({
                    tag: normalizeTag(result.tag.replace(/\./g, '')),
                    confidence: result.confidence
                });
            }
        }
    }
    /**
     * Correct case for 1st declension feminine nouns/adjectives following
     * ablative prepositions. WASM RFTagger occasionally assigns nominative
     * where the preposition context requires ablative. This correction
     * matches Python native RFTagger behavior by using Latin grammar rules.
     */
    correctAblativeCase() {
        const ablativePreps = new Set(['ab', 'a', 'cum', 'de', 'ex', 'e', 'pro', 'sine']);
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            if (!token.isWord)
                continue;
            const tag = token.tag;
            // Check if tag is a feminine noun/adjective (9-char LDT: n-s---fn- or a-s---fn-)
            if (tag.length < 8)
                continue;
            if (tag[0] !== 'n' && tag[0] !== 'a')
                continue;
            if (tag[6] !== 'f' || tag[7] !== 'n')
                continue;
            // Find previous non-space word token
            let prevWord = null;
            for (let j = i - 1; j >= 0; j--) {
                const prev = this.tokens[j];
                if (prev.isWord) {
                    prevWord = toAscii(prev.text).toLowerCase();
                    break;
                }
            }
            // If preceded by an ablative preposition, override to ablative case
            if (prevWord && ablativePreps.has(prevWord)) {
                this.tokens[i] = token.with({
                    tag: tag.slice(0, 7) + 'b' + tag.slice(8)
                });
            }
        }
    }
    /**
     * Add lemmas to tokens using LemmaEngine
     */
    /**
     * Add lemmas to tokens.
     * Ported from Python tokenization.py addlemmas() — two-tier frequency-based selection.
     * Tier 1: direct wordform+tag lookup in LemmaEngine
     * Tier 2: wordlist-supplied lemmas ranked by corpus frequency (matches Python's lemma_frequency)
     */
    async addLemmas(lemmaEngine, wordlistEngine) {
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            // Only add lemmas to word tokens
            if (token.isWord && !token.isenclitic) {
                // Tier 1: Look up lemma by word form and POS tag (hardcoded + corpus lemmas)
                const lemmaEntry = lemmaEngine.lookup(token.text, token.tag);
                if (lemmaEntry) {
                    this.tokens[i] = token.with({
                        lemma: lemmaEntry.lemma
                    });
                }
                else if (wordlistEngine) {
                    // Tier 2: wordlist lemmas ranked by corpus frequency (matches Python tier 2)
                    // Python: for lex_lemma in wordlist.formtolemmas[wordform.lower()]:
                    //           if lemma_frequency.get(lex_lemma, 0) > max_freq: best_lemma = lex_lemma
                    const wordformLower = toAscii(token.text).toLowerCase();
                    let bestLemma = toAscii(token.text).toLowerCase(); // fallback
                    let maxFreq = -1;
                    try {
                        const entries = await wordlistEngine.getAllEntries(wordformLower);
                        const seenLemmas = new Set();
                        for (const entry of entries) {
                            const lexLemma = entry.lemma;
                            if (seenLemmas.has(lexLemma))
                                continue;
                            seenLemmas.add(lexLemma);
                            const freq = lemmaEngine.getFrequency(lexLemma);
                            if (freq > maxFreq) {
                                maxFreq = freq;
                                bestLemma = lexLemma;
                            }
                        }
                    }
                    catch (_e) {
                        // Wordlist lookup failed; keep fallback lemma
                    }
                    this.tokens[i] = token.with({
                        lemma: bestLemma
                    });
                }
                else {
                    // No wordlist available — fallback to wordform itself
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
                if (entries.length > 0) {
                    const allAccented = entries.map(e => e.accentedUnderscore).filter(a => a !== undefined);
                    const uniqueAccented = Array.from(new Set(allAccented));
                    if (uniqueAccented.length === 1) {
                        accented = [uniqueAccented[0]];
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
                            // Get all candidates with the best (lowest) casedist
                            const bestCasedist = candidates[0].casedist;
                            const bestAccented = candidates
                                .filter(c => c.casedist === bestCasedist)
                                .sort((a, b) => {
                                if (a.tagdist !== b.tagdist)
                                    return a.tagdist - b.tagdist;
                                return a.lemdist - b.lemdist;
                            })
                                .map(c => c.accented);
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
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
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
        // Use original text for alignment (alignMacronized will handle u->v, i->j conversions)
        let text = token.text;
        if (!domacronize) {
            // Even if not macronizing, still apply orthographic conversions if requested
            if (performutov) {
                text = text.replace(/u/g, 'v').replace(/U/g, 'V');
            }
            if (performitoj) {
                text = text.replace(/i/g, 'j').replace(/I/g, 'J');
            }
            return token.with({ text, macronized: true });
        }
        // Get the accented form (with _ markers) from getAccents
        const accentedCandidates = token.accented;
        if (!accentedCandidates || accentedCandidates.length === 0) {
            // No accented form available, fallback
            return token.with({ text, macronized: true });
        }
        // Use the first (best) accented candidate
        let accentedUnderscore = accentedCandidates[0];
        // Clean: remove '^' markers and '_^' sequences (as in Python Token.macronize)
        accentedUnderscore = accentedUnderscore.replace(/_\^/g, '').replace(/\^/g, '');
        // Apply alsomaius: add macron before 'j' (or 'i') after short vowel, unless prefix with short j
        if (alsomaius && /[ij]/.test(accentedUnderscore)) {
            const lowerAcc = accentedUnderscore.toLowerCase();
            const startsWithShortJ = prefixesWithShortJ.some(prefix => lowerAcc.startsWith(prefix));
            if (!startsWithShortJ) {
                accentedUnderscore = accentedUnderscore.replace(/([aeiouy])([ij][aeiouy])/gi, '$1_$2');
            }
        }
        // If accented form became empty after cleaning, fallback to plain text
        if (!accentedUnderscore) {
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
        let macronizedUnicode;
        if (macronizedUnderscore === null) {
            macronizedUnicode = underscoreToUnicode(accentedUnderscore);
        }
        else {
            macronizedUnicode = underscoreToUnicode(macronizedUnderscore);
        }
        // Apply u→v and i→j conversions to non-macronized characters only
        if (performutov) {
            macronizedUnicode = macronizedUnicode
                .replace(/u/g, 'v').replace(/U/g, 'V');
        }
        if (performitoj) {
            macronizedUnicode = macronizedUnicode
                .replace(/i/g, 'j').replace(/I/g, 'J');
        }
        return token.with({
            macronizedText: macronizedUnicode,
            macronized: true
        });
    }
    /**
     * Convert tokens back to text
     */
    detokenize(markAmbigs = false) {
        var _a, _b, _c, _d, _f;
        let result = '';
        let lastEnd = 0;
        for (const token of this.tokens) {
            const start = (_a = token.startIndex) !== null && _a !== void 0 ? _a : lastEnd;
            // Add original whitespace between tokens
            if (start > lastEnd) {
                const whitespace = ((_b = this.originalText) === null || _b === void 0 ? void 0 : _b.substring(lastEnd, start)) || ' ';
                result += whitespace;
            }
            // Add token text - convert underscore notation to Unicode
            let text = (_c = token.macronizedText) !== null && _c !== void 0 ? _c : token.text;
            // Strip remaining underscores that aren't part of macron notation
            // (should already be converted, but double-check)
            if (text) {
                text = text.replace(/_/g, '');
            }
            result += text;
            lastEnd = (_d = token.endIndex) !== null && _d !== void 0 ? _d : (start + ((_f = token.text) === null || _f === void 0 ? void 0 : _f.length) || text.length);
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
    scanVerses(meterAutomatons) {
        this._scannedFeet = doScanVerses(this.tokens, meterAutomatons);
    }
    /**
     * Get scanned feet (if scansion was performed)
     */
    get scannedFeet() {
        return this._scannedFeet;
    }
}
// Enclitic compounds that must be split even if known (from Python tokenization.py)
Object.defineProperty(Tokenization, "dividenda", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: {
        "nequid": 4, "attamen": 5, "unusquisque": 7, "unaquaeque": 7, "unumquodque": 7, "uniuscuiusque": 8,
        "uniuscujusque": 8, "unicuique": 6, "unumquemque": 7, "unamquamque": 7, "unoquoque": 6,
        "unaquaque": 6, "cuiusmodi": 4, "cujusmodi": 4, "quojusmodi": 4, "eiusmodi": 4, "ejusmodi": 4,
        "huiuscemodi": 4, "hujuscemodi": 4, "huiusmodi": 4, "hujusmodi": 4, "istiusmodi": 4, "nullomodo": 4,
        "quodammodo": 4, "nudiustertius": 7, "nonnisi": 4, "plusquam": 4, "proculdubio": 5, "quamplures": 6,
        "quamprimum": 6, "quinetiam": 5, "uerumetiam": 5, "verumetiam": 5, "verumtamen": 5, "uerumtamen": 5,
        "paterfamilias": 8, "patrisfamilias": 8, "patremfamilias": 8, "patrifamilias": 8, "patrefamilias": 8,
        "patresfamilias": 8, "patrumfamilias": 8, "patribusfamilias": 8, "materfamilias": 8,
        "matrisfamilias": 8, "matremfamilias": 8, "matrifamilias": 8, "matrefamilias": 8,
        "matresfamilias": 8, "matrumfamilias": 8, "matribusfamilias": 8,
        "respublica": 7, "reipublicae": 8, "rempublicam": 8, "senatusconsultum": 9, "senatusconsulto": 8,
        "senatusconsulti": 8, "usufructu": 6, "usumfructum": 7, "ususfructus": 7,
        "supradicti": 5, "supradictum": 6, "supradictus": 6, "supradicto": 5,
        "seipse": 4, "seipsa": 4, "seipsum": 5, "seipsam": 5, "seipso": 4, "seipsos": 5, "seipsas": 5,
        "seipsis": 5, "semetipse": 4, "semetipsa": 4, "semetipsum": 5, "semetipsam": 5, "semetipso": 4,
        "semetipsos": 5, "semetipsas": 5, "semetipsis": 5, "teipsum": 5, "temetipsum": 5, "vosmetipsos": 5,
        "idipsum": 5
    }
});
// Special enclitic words that should be split even if known (from Python)
Object.defineProperty(Tokenization, "specialEncliticWords", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: new Set(['nec', 'neque', 'necnon', 'seque', 'seseque', 'quique', 'mecumque', 'tecumque', 'secumque'])
});
//# sourceMappingURL=Tokenization.js.map