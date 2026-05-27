/**
 * Core types for the Latin Macronizer
 * Ported from Python latin_macronizer module
 */

// POS Tag from RFTagger
export interface POSTag {
  tag: string;           // Tag string (e.g., "n.-.s.-.-.-.f.b.-")
  probability: number;   // Tag probability
}

// Token with macronization info
export interface Token {
  text: string;          // Original text
  isWord: boolean;       // Is this a word (not punctuation/space)
  isSpace: boolean;      // Is whitespace
  endssentence: boolean; // Ends a sentence
  tag?: string;          // POS tag from RFTagger
  lemma?: string;        // Lemma from wordlist
  accented: string[];    // Possible accented/macronized forms
  macronized?: string;   // Final macronized form
  isUnknown: boolean;    // Unknown word flag
  isenclitic: boolean;   // Is enclitic (e.g., -que, -ve, -ne) [lowercase to match Python & Token class]
  hasenclitic: boolean;  // Has enclitic attached [lowercase to match Python & Token class]
  startIndex: number;    // Start position in original text
  endIndex: number;      // End position in original text
  // Morpheus analysis results (for unknown words)
  morpheusAnalyzed?: boolean;
  morpheusResults?: {
    word: string;
    analyses: Array<{
      lemma: string;
      stem: string;
      ending: string;
      accented: string;
      formInfo: {
        partOfSpeech?: string;
        case?: string;
        number?: string;
        gender?: string;
        tense?: string;
        mood?: string;
        voice?: string;
        person?: string;
        degree?: string;
      };
      raw: string;
    }>;
    success: boolean;
    raw: string;
  } | null;  // Full Morpheus analysis (matches Token class)
}

// Word entry from database
export interface WordEntry {
  form: string;          // Normalized word form
  lemma: string;         // Lemma
  accented: string[];    // Forms with macrons
  tags: string[];        // Possible POS tags
  frequency?: number;    // Word frequency
}

// Lemma entry
export interface LemmaEntry {
  lemma: string;
  patterns: string[];    // Macronization patterns
  endings?: string[];    // Possible endings
}

// Macronizer options
export interface MacronizerOptions {
  macronize: boolean;        // Add macrons (default: true)
  alsomaius: boolean;        // Also mark māius etc. (default: false)
  performutov: boolean;      // Convert u to v (default: false)
  performitoj: boolean;      // Convert i to j (default: false)
  markambigs: boolean;       // Mark ambiguous forms (default: true)
  scan: ScanOption;          // Meter for scansion (default: 'prose')
  evaluate?: boolean;        // Compare with gold standard
}

export type ScanOption = 
  | 'prose' 
  | 'dactylichexameter' 
  | 'dactylicpentameter' 
  | 'hendecasyllable'
  | 'iambictrimeter'
  | 'iambicdimeter';

// Macronizer result
export interface MacronizerResult {
  text: string;              // Macronized text
  html: string;            // HTML with highlighting
  tokens: Token[];         // Detailed token info
  scannedFeet?: string[];  // Meter feet if scansion enabled
  statistics: {
    totalWords: number;
    knownWords: number;
    unknownWords: number;
    ambiguousForms: number;
    accuracy?: number;     // If evaluation enabled
  };
}

// Evaluation result
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

// IndexedDB schema
export interface MacronizerDatabase {
  words: WordEntry;
  lemmas: LemmaEntry;
  endings: {
    suffix: string;
    macronized: string;
  };
}

// WASM Tagger interface
export interface WasmTagger {
  loadModel(modelPath: string): Promise<void>;
  tagTokens(words: string[]): Promise<POSTag[]>;
  dispose(): void;
}

// Meter automaton state
export type MeterState = number;
export type VowelLength = 'L' | 'S' | 'D' | '?' | 'T'; // Long, Short, Dactyl, Unknown, Thesis

// Scansion result
export interface ScansionResult {
  feet: string[];
  vowelLengths: VowelLength[];
  valid: boolean;
}
