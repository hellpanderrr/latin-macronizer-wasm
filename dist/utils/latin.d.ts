/**
 * Latin text processing utilities
 * Ported from latin_macronizer/helpers.py
 */
export declare const prefixesWithShortJ: string[];
/**
 * Convert Latin extended characters to ASCII
 * e.g., "æ" → "ae", "œ" → "oe"
 */
export declare function toAscii(text: string): string;
/**
 * Convert to UI orthography (v→u, j→i)
 */
export declare function toUiOrthography(text: string): string;
/**
 * Reverse UI orthography (u→v, i→j)
 */
export declare function fromUiOrthography(text: string, utov: boolean, itoj: boolean): string;
/**
 * Check if character is a Latin vowel
 */
export declare function isVowel(c: string): boolean;
/**
 * Check if character is a Latin consonant
 */
export declare function isConsonant(c: string): boolean;
/**
 * Check if word starts with vowel
 */
export declare function startsWithVowel(word: string): boolean;
/**
 * Check if word starts with prefix that has short 'j'
 */
export declare function startsWithShortJPrefix(word: string): boolean;
/**
 * Normalize word for lookup (lowercase, toAscii)
 */
export declare function normalizeWord(word: string): string;
/**
 * Split text into sentences
 * Simple heuristic: split on . ! ? followed by space or end
 */
export declare function splitSentences(text: string): string[];
/**
 * Check if character ends a sentence
 */
export declare function isSentenceEnder(c: string): boolean;
/**
 * Check if token is punctuation
 */
export declare function isPunctuation(token: string): boolean;
/**
 * Check if token is whitespace
 */
export declare function isWhitespace(token: string): boolean;
/**
 * Common Latin enclitics
 */
export declare const enclitics: string[];
/**
 * Check if word ends with enclitic
 * Returns [stem, enclitic] or null
 */
export declare function splitEnclitic(word: string): [string, string] | null;
/**
 * Identify vowel clusters in Latin word
 * Returns array of [start, end] positions
 */
export declare function findVowelClusters(word: string): Array<[number, number]>;
/**
 * Check if vowel position is ambiguous
 * (can be either long or short)
 */
export declare function isAmbiguousVowel(word: string): boolean;
/**
 * Escape HTML entities
 */
export declare function escapeHtml(text: string): string;
/**
 * Compute Levenshtein distance between two strings
 */
export declare function levenshteinDistance(a: string, b: string): number;
/**
 * Convert underscore macron markers to Unicode macrons
 * a_ → ā, e_ → ē, etc.
 */
export declare function underscoreToUnicode(text: string): string;
/**
 * Convert Unicode macrons to underscore markers (inverse of underscoreToUnicode)
 */
export declare function unicodeToUnderscore(text: string): string;
/**
 * Normalize RFTagger 17-char tag format to LDT 9-char format
 * RFTagger: n---s-------f-n-- (17 chars: pos+person+number+tense/mood/voice+gender+case+degree+dialect?)
 * LDT:      n-s---fn- (9 chars: pos+person+number+tense+mood+voice+gender+case+degree)
 */
export declare function normalizeTag(tag: string): string;
/**
 * Compute distance between two LDT tags
 * Ported from latin_macronizer/postags.py (tag_distance function)
 *
 * LDT tags are 9-char or 12-char strings encoding morphological features.
 * For nomina (nouns, adjectives, verbs-as-participles), tense/mood/voice
 * positions are ignored when comparing tags of different types.
 */
export declare function tagDistance(tag1: string, tag2: string): number;
//# sourceMappingURL=latin.d.ts.map