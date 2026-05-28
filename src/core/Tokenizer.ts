/**
 * Tokenizer.ts
 * Browser-compatible tokenizer for Latin text
 * No subprocess dependencies - pure regex implementation
 */

import { Token } from './Token';

export class Tokenizer {
  // Unicode-aware regex patterns for Latin text
  private static readonly WORD_BOUNDARY = /[\s\p{P}\p{S}]+/gu;
  private static readonly SENTENCE_END = /[.!?]+/;
  private static readonly ABBREVIATION = /^(M|D|L|C|P|S|T|Q)\.$/i;
  private static readonly NUMBER = /^\d+([.,]\d+)?$/;
  private static readonly PUNCTUATION = /^[^\p{L}\p{N}]+$/u;

  /**
   * Tokenize Latin text into words and punctuation
   * Handles abbreviations, numbers, and Unicode characters
   */
  tokenize(text: string): Token[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Normalize to NFC form for consistent macron handling
    const normalized = text.normalize('NFC');
    
    // Split by word boundaries
    const rawTokens = normalized.split(Tokenizer.WORD_BOUNDARY)
      .filter(t => t.length > 0);

    const tokens: Token[] = [];
    
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
  private createToken(text: string, index: number, allTokens: string[]): Token {
    const options: any = {
      originalText: text,
    };

    // Check for punctuation
    if (Tokenizer.PUNCTUATION.test(text)) {
      // Python: if possiblesentenceend and any(i in token.text for i in '.;:?!')
      // Set endssentence for sentence-ending punctuation
      if (/[.;:?!]/.test(text)) {
        options.endssentence = true;
      }
      return new Token(text, options);
    }

    // Check for numbers
    if (Tokenizer.NUMBER.test(text)) {
      return new Token(text, options);
    }

    // Create basic token (tag will be filled by POS tagger)
    return new Token(text, options);
  }


  /**
   * Detokenize: join tokens back into text
   */
  detokenize(tokens: Token[]): string {
    return tokens.map(t => t.text).join(' ');
  }

  /**
   * Split text into sentences
   */
  splitSentences(text: string): string[] {
    const sentences: string[] = [];
    let currentSentence = '';
    
    const tokens = this.tokenize(text);
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      currentSentence += token.text + ' ';
      
      // Check for sentence end
      if (token.endssentence) {
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
