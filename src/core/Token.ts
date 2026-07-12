/**
 * Token.ts
 * Core token representation for Latin macronizer
 * Immutable token with POS tagging and macronization capabilities
 */

import type { MorpheusAnalysis } from '../analysis/MorpheusAnalyzer';

export interface TokenOptions {
  text?: string;
  tag?: string;
  lemma?: string;
  macronized?: boolean;
  macronizedText?: string;  // Macronized form of the text
  originalText?: string;    // Original text before normalization
  accented?: string[];   // List of candidate accented forms (with _ markers)
  isAmbiguous?: boolean;
  isUnknown?: boolean;
  morpheusAnalyzed?: boolean;
  morpheusResults?: MorpheusAnalysis | null;  // Full Morpheus analysis if available
  startssentence?: boolean;
  endssentence?: boolean;
  hasenclitic?: boolean;
  isenclitic?: boolean;
  isWord?: boolean;     // Is a word token
  isSpace?: boolean;    // Is whitespace
  startIndex?: number;  // Start position in original text
  endIndex?: number;    // End position in original text
}

/**
 * Immutable token class representing a word in Latin text
 */
export class Token {
  public readonly text: string;
  public readonly tag: string;
  public readonly lemma: string;
  public readonly macronized: boolean;
  public readonly macronizedText?: string;  // Macronized form
  public readonly originalText: string;    // Original text before normalization
  public readonly accented?: string[];   // Candidate accented forms (with _ markers)
  public readonly isAmbiguous?: boolean;
  public readonly isUnknown?: boolean;
  public readonly morpheusAnalyzed?: boolean;
  public readonly morpheusResults?: MorpheusAnalysis | null;  // Full Morpheus analysis
  public readonly startssentence?: boolean;
  public readonly endssentence?: boolean;
  public readonly hasenclitic?: boolean;
  public readonly isenclitic?: boolean;
  public readonly isWord?: boolean;
  public readonly isSpace?: boolean;
  public readonly startIndex?: number;
  public readonly endIndex?: number;

  constructor(text: string, options: TokenOptions = {}) {
    this.text = options.text || text;
    this.tag = options.tag || '---------';
    this.lemma = options.lemma || text.toLowerCase();
    this.macronized = options.macronized || false;
    this.macronizedText = options.macronizedText;
    this.originalText = options.originalText || text;
    this.accented = options.accented;
    this.isAmbiguous = options.isAmbiguous || false;
    this.isUnknown = options.isUnknown || false;
    this.morpheusAnalyzed = options.morpheusAnalyzed;
    this.morpheusResults = options.morpheusResults ?? null;
    this.startssentence = options.startssentence;
    this.endssentence = options.endssentence;
    this.hasenclitic = options.hasenclitic;
    this.isenclitic = options.isenclitic;
    this.isWord = options.isWord;
    this.isSpace = options.isSpace;
    this.startIndex = options.startIndex;
    this.endIndex = options.endIndex;
    Object.freeze(this);
  }

  /**
   * Create a new token with updated properties (immutable update)
   */
  with(options: Partial<TokenOptions>): Token {
    return new Token(this.text, {
      text: options.text ?? this.text,
      tag: options.tag ?? this.tag,
      lemma: options.lemma ?? this.lemma,
      macronized: options.macronized ?? this.macronized,
      macronizedText: options.macronizedText ?? this.macronizedText,
      originalText: options.originalText ?? this.originalText,
      accented: options.accented ?? this.accented,
      isAmbiguous: options.isAmbiguous ?? this.isAmbiguous,
      isUnknown: options.isUnknown ?? this.isUnknown,
      morpheusAnalyzed: options.morpheusAnalyzed ?? this.morpheusAnalyzed,
      morpheusResults: options.morpheusResults ?? this.morpheusResults,
      startssentence: options.startssentence ?? this.startssentence,
      endssentence: options.endssentence ?? this.endssentence,
      hasenclitic: options.hasenclitic ?? this.hasenclitic,
      isenclitic: options.isenclitic ?? this.isenclitic,
      isWord: options.isWord ?? this.isWord,
      isSpace: options.isSpace ?? this.isSpace,
      startIndex: options.startIndex ?? this.startIndex,
      endIndex: options.endIndex ?? this.endIndex,
    });
  }
}
