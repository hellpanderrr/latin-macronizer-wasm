/**
 * Token.ts
 * Core token representation for Latin macronizer
 * Immutable token with POS tagging and macronization capabilities
 */

export interface TokenOptions {
  text?: string;
  tag?: string;
  lemma?: string;
  macronized?: boolean;
  originalText?: string;
  confidence?: number;
  accented?: string[];   // List of candidate accented forms (with _ markers)
  isAmbiguous?: boolean;
  isUnknown?: boolean;
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
  public readonly originalText: string;
  public readonly confidence?: number;
  public readonly accented?: string[];   // Candidate accented forms (with _ markers)
  public readonly isAmbiguous?: boolean;
  public readonly isUnknown?: boolean;
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
    this.originalText = options.originalText || text;
    this.confidence = options.confidence;
    this.accented = options.accented;
    this.isAmbiguous = options.isAmbiguous || false;
    this.isUnknown = options.isUnknown || false;
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
      originalText: options.originalText ?? this.originalText,
      confidence: options.confidence ?? this.confidence,
      accented: options.accented ?? this.accented,
      isAmbiguous: options.isAmbiguous ?? this.isAmbiguous,
      isUnknown: options.isUnknown ?? this.isUnknown,
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

  /**
   * Split token by hyphen (for compound words)
   */
  split(): Token[] {
    if (!this.text.includes('-')) {
      return [this];
    }
    const parts = this.text.split('-');
    return parts.map(part => new Token(part, {
      tag: this.tag,
      lemma: this.lemma,
      macronized: this.macronized,
    }));
  }

  /**
   * Display token with all metadata
   */
  show(): string {
    const parts = [
      this.text,
      this.tag !== '---------' ? this.tag : '',
      this.lemma !== this.text.toLowerCase() ? this.lemma : '',
      this.macronized ? 'MACRONIZED' : '',
    ].filter(Boolean);
    return parts.join('\t');
  }

  /**
   * Apply macronization to this token
   */
  macronize(macronizer: Macronizer): Token {
    if (this.macronized) {
      return this;
    }
    const macronizedText = macronizer.macronize(this);
    return new Token(macronizedText, {
      tag: this.tag,
      lemma: this.lemma,
      macronized: true,
      originalText: this.originalText,
    });
  }

  /**
   * Check if token is punctuation
   */
  isPunctuation(): boolean {
    return /^[^\p{L}\p{N}]+$/u.test(this.text);
  }

  /**
   * Check if token is a number
   */
  isNumber(): boolean {
    return /^\d+([.,]\d+)?$/.test(this.text);
  }

  /**
   * Get part of speech from tag
   */
  getPOS(): string {
    return this.tag.charAt(0) || '-';
  }

  /**
   * Check if token has specific POS tag
   */
  hasPOS(pos: string): boolean {
    return this.getPOS() === pos;
  }

  /**
   * Get case from LDT tag (positions 5-6)
   */
  getCase(): string {
    return this.tag.length >= 6 ? this.tag.substring(4, 6).trim() : '-';
  }

  /**
   * Get number from LDT tag (positions 7-8)
   */
  getNumber(): string {
    return this.tag.length >= 8 ? this.tag.substring(6, 8).trim() : '-';
  }

  /**
   * Get gender from LDT tag (position 9)
   */
  getGender(): string {
    return this.tag.length >= 9 ? this.tag.charAt(8) : '-';
  }

  /**
   * Check if token is a verb
   */
  isVerb(): boolean {
    const pos = this.getPOS();
    return pos === 'v' || pos === 'V';
  }

  /**
   * Check if token is a noun
   */
  isNoun(): boolean {
    const pos = this.getPOS();
    return pos === 'n' || pos === 'N';
  }

  /**
   * Check if token is an adjective
   */
  isAdjective(): boolean {
    const pos = this.getPOS();
    return pos === 'a' || pos === 'A';
  }

  /**
   * Check if token is an adverb
   */
  isAdverb(): boolean {
    const pos = this.getPOS();
    return pos === 'd' || pos === 'D';
  }

  /**
   * Check if token is a preposition
   */
  isPreposition(): boolean {
    const pos = this.getPOS();
    return pos === 'r' || pos === 'R';
  }

  /**
   * Check if token is a conjunction
   */
  isConjunction(): boolean {
    const pos = this.getPOS();
    return pos === 'c' || pos === 'C';
  }

  /**
   * Check if token is a pronoun
   */
  isPronoun(): boolean {
    const pos = this.getPOS();
    return pos === 'p' || pos === 'P';
  }

  /**
   * Convert token to JSON-serializable format
   */
  toJSON(): object {
    return {
      text: this.text,
      tag: this.tag,
      lemma: this.lemma,
      macronized: this.macronized,
      originalText: this.originalText,
    };
  }

  /**
   * Create token from JSON
   */
  static fromJSON(data: any): Token {
    return new Token(data.text, {
      tag: data.tag,
      lemma: data.lemma,
      macronized: data.macronized,
      originalText: data.originalText,
    });
  }
}

/**
 * Macronizer interface for dependency injection
 */
export interface Macronizer {
  macronize(token: Token): string;
}
