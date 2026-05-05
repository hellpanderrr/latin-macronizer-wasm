/**
 * Tokenizer.ts
 * Browser-compatible tokenizer for Latin text
 * No subprocess dependencies - pure regex implementation
 */
import { Token } from './Token.js';
export class Tokenizer {
    /**
     * Tokenize Latin text into words and punctuation
     * Handles abbreviations, numbers, and Unicode characters
     */
    tokenize(text) {
        if (!text || text.trim().length === 0) {
            return [];
        }
        // Normalize to NFC form for consistent macron handling
        const normalized = text.normalize('NFC');
        // Split by word boundaries
        const rawTokens = normalized.split(Tokenizer.WORD_BOUNDARY)
            .filter(t => t.length > 0);
        const tokens = [];
        for (let i = 0; i < rawTokens.length; i++) {
            const rawToken = rawTokens[i];
            const token = this.createToken(rawToken, i, rawTokens);
            tokens.push(token);
        }
        return tokens;
    }
    /**
     * Create a token with appropriate metadata
     */
    createToken(text, index, allTokens) {
        const options = {
            originalText: text,
        };
        // Check for punctuation
        if (Tokenizer.PUNCTUATION.test(text)) {
            return new Token(text, options);
        }
        // Check for numbers
        if (Tokenizer.NUMBER.test(text)) {
            return new Token(text, options);
        }
        // Determine if this is end of sentence
        const isEndOfSentence = this.isEndOfSentence(text, index, allTokens);
        // Create basic token (tag will be filled by POS tagger)
        return new Token(text, options);
    }
    /**
     * Check if token represents end of sentence
     */
    isEndOfSentence(text, index, allTokens) {
        // Check if token ends with sentence punctuation
        if (!Tokenizer.SENTENCE_END.test(text)) {
            return false;
        }
        // Check for abbreviations (e.g., "M.", "D.")
        if (Tokenizer.ABBREVIATION.test(text)) {
            return false;
        }
        // Check if next token starts with capital letter (likely new sentence)
        if (index + 1 < allTokens.length) {
            const nextToken = allTokens[index + 1];
            return /^[A-Z]/.test(nextToken);
        }
        return true;
    }
    /**
     * Detokenize: join tokens back into text
     */
    detokenize(tokens) {
        return tokens.map(t => t.text).join(' ');
    }
    /**
     * Split text into sentences
     */
    splitSentences(text) {
        const sentences = [];
        let currentSentence = '';
        const tokens = this.tokenize(text);
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            currentSentence += token.text + ' ';
            // Check for sentence end
            if (this.isEndOfSentence(token.text, i, tokens.map(t => t.text))) {
                sentences.push(currentSentence.trim());
                currentSentence = '';
            }
        }
        // Add remaining text
        if (currentSentence.trim().length > 0) {
            sentences.push(currentSentence.trim());
        }
        return sentences;
    }
}
// Unicode-aware regex patterns for Latin text
Object.defineProperty(Tokenizer, "WORD_BOUNDARY", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /[\s\p{P}\p{S}]+/gu
});
Object.defineProperty(Tokenizer, "SENTENCE_END", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /[.!?]+/
});
Object.defineProperty(Tokenizer, "ABBREVIATION", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /^(M|D|L|C|P|S|T|Q)\.$/i
});
Object.defineProperty(Tokenizer, "NUMBER", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /^\d+([.,]\d+)?$/
});
Object.defineProperty(Tokenizer, "PUNCTUATION", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /^[^\p{L}\p{N}]+$/u
});
//# sourceMappingURL=Tokenizer.js.map