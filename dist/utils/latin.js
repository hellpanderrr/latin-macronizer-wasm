/**
 * Latin text processing utilities
 * Ported from latin_macronizer/helpers.py
 */
// Prefixes with short 'j' sound
export const prefixesWithShortJ = [
    'bij', 'fidej', 'Foroj', 'foroj', 'ju_rej', 'multij',
    'praej', 'quadrij', 'rej', 'retroj', 'se_mij', 'sesquij',
    'u_nij', 'introj'
];
/**
 * Convert Latin extended characters to ASCII
 * e.g., "æ" → "ae", "œ" → "oe"
 */
export function toAscii(text) {
    const replacements = [
        ['æ', 'ae'], ['Æ', 'Ae'],
        ['œ', 'oe'], ['Œ', 'Oe'],
        ['ä', 'a'], ['ë', 'e'],
        ['ï', 'i'], ['ö', 'o'],
        ['ü', 'u'], ['ÿ', 'u']
    ];
    let result = text;
    for (const [from, to] of replacements) {
        result = result.replace(new RegExp(from, 'g'), to);
    }
    return result;
}
/**
 * Convert to UI orthography (v→u, j→i)
 */
export function toUiOrthography(text) {
    return text
        .replace(/v/g, 'u')
        .replace(/V/g, 'U')
        .replace(/j/g, 'i')
        .replace(/J/g, 'I');
}
/**
 * Reverse UI orthography (u→v, i→j)
 */
export function fromUiOrthography(text, utov, itoj) {
    let result = text;
    if (utov) {
        result = result.replace(/u/g, 'v').replace(/U/g, 'V');
    }
    if (itoj) {
        result = result.replace(/i/g, 'j').replace(/I/g, 'J');
    }
    return result;
}
/**
 * Check if character is a Latin vowel
 */
export function isVowel(c) {
    return 'aeiouyAEIOUY'.includes(c);
}
/**
 * Check if character is a Latin consonant
 */
export function isConsonant(c) {
    return /[bcdfghjklmnpqrstvxzBCDFGHJKLMNPQRSTVXZ]/.test(c);
}
/**
 * Check if word starts with vowel
 */
export function startsWithVowel(word) {
    if (!word)
        return false;
    const first = word[0].toLowerCase();
    return 'aeiouy'.includes(first);
}
/**
 * Check if word starts with prefix that has short 'j'
 */
export function startsWithShortJPrefix(word) {
    const lower = word.toLowerCase();
    return prefixesWithShortJ.some(prefix => lower.startsWith(prefix));
}
/**
 * Normalize word for lookup (lowercase, toAscii)
 */
export function normalizeWord(word) {
    return toAscii(word).toLowerCase().trim();
}
/**
 * Split text into sentences
 * Simple heuristic: split on . ! ? followed by space or end
 */
export function splitSentences(text) {
    return text
        .replace(/([.!?])(\s+)/g, '$1\n')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
}
/**
 * Check if character ends a sentence
 */
export function isSentenceEnder(c) {
    return '.!?'.includes(c);
}
/**
 * Check if token is punctuation
 */
export function isPunctuation(token) {
    return /^[^\w\s]*$/.test(token);
}
/**
 * Check if token is whitespace
 */
export function isWhitespace(token) {
    return /^\s*$/.test(token);
}
/**
 * Common Latin enclitics
 */
export const enclitics = ['que', 've', 'ne', 'cum', 'met'];
/**
 * Check if word ends with enclitic
 * Returns [stem, enclitic] or null
 */
export function splitEnclitic(word) {
    const lower = word.toLowerCase();
    for (const enclitic of enclitics) {
        if (lower.endsWith(enclitic) && lower.length > enclitic.length) {
            const stem = word.slice(0, -enclitic.length);
            // Verify it's a valid split (stem ends with vowel or specific consonants)
            if (/[aeiouy]|(n|r)$/i.test(stem)) {
                return [stem, enclitic];
            }
        }
    }
    return null;
}
/**
 * Identify vowel clusters in Latin word
 * Returns array of [start, end] positions
 */
export function findVowelClusters(word) {
    const clusters = [];
    const vowelPattern = /[aeiouyAEIOUY]/;
    let i = 0;
    while (i < word.length) {
        if (vowelPattern.test(word[i])) {
            let start = i;
            // Check for diphthongs (ae, au, ei, eu, oe)
            if (i + 1 < word.length) {
                const pair = word.slice(i, i + 2).toLowerCase();
                if (['ae', 'au', 'ei', 'eu', 'oe'].includes(pair)) {
                    i += 2;
                }
                else {
                    i += 1;
                }
            }
            else {
                i += 1;
            }
            clusters.push([start, i]);
        }
        else {
            i += 1;
        }
    }
    return clusters;
}
/**
 * Check if vowel position is ambiguous
 * (can be either long or short)
 */
export function isAmbiguousVowel(word) {
    // Common ambiguous patterns
    const ambiguousPatterns = [
        /_\^/, // Marked as ambiguous in pattern
    ];
    for (const pattern of ambiguousPatterns) {
        if (pattern.test(word))
            return true;
    }
    return false;
}
/**
 * Escape HTML entities
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
/**
 * Compute Levenshtein distance between two strings
 */
export function levenshteinDistance(a, b) {
    const matrix = [];
    const lenA = a.length;
    const lenB = b.length;
    // Initialize matrix
    for (let i = 0; i <= lenB; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= lenA; j++) {
        matrix[0][j] = j;
    }
    // Fill matrix
    for (let i = 1; i <= lenB; i++) {
        for (let j = 1; j <= lenA; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j] + 1 // deletion
                );
            }
        }
    }
    return matrix[lenB][lenA];
}
/**
 * Convert underscore macron markers to Unicode macrons
 * a_ → ā, e_ → ē, etc.
 */
export function underscoreToUnicode(text) {
    return text
        .replace(/a_/g, 'ā')
        .replace(/e_/g, 'ē')
        .replace(/i_/g, 'ī')
        .replace(/o_/g, 'ō')
        .replace(/u_/g, 'ū')
        .replace(/y_/g, 'ȳ')
        .replace(/A_/g, 'Ā')
        .replace(/E_/g, 'Ē')
        .replace(/I_/g, 'Ī')
        .replace(/O_/g, 'Ō')
        .replace(/U_/g, 'Ū')
        .replace(/Y_/g, 'Ȳ');
}
/**
 * Convert Unicode macrons to underscore markers (inverse of underscoreToUnicode)
 */
export function unicodeToUnderscore(text) {
    return text
        .replace(/ā/g, 'a_')
        .replace(/ē/g, 'e_')
        .replace(/ī/g, 'i_')
        .replace(/ō/g, 'o_')
        .replace(/ū/g, 'u_')
        .replace(/ȳ/g, 'y_')
        .replace(/Ā/g, 'A_')
        .replace(/Ē/g, 'E_')
        .replace(/Ī/g, 'I_')
        .replace(/Ō/g, 'O_')
        .replace(/Ū/g, 'U_')
        .replace(/Ȳ/g, 'Y_');
}
/**
 * Normalize RFTagger 17-char tag format to LDT 9-char format
 * RFTagger: n---s-------f-n-- (17 chars: pos+person+number+tense/mood/voice+gender+case+degree+dialect?)
 * LDT:      n-s---fn- (9 chars: pos+person+number+tense+mood+voice+gender+case+degree)
 */
export function normalizeTag(tag) {
    const debugTags = ['n---s-------f-n--', 'n---p-------m-n--', 'p---p-------m-n--'];
    const shouldLog = debugTags.includes(tag);
    if (shouldLog)
        console.log(`[normalizeTag] Input: "${tag}" len=${tag.length}`);
    if (tag.length === 9 || tag.length === 12) {
        // Already LDT format
        if (shouldLog)
            console.log(`[normalizeTag] Already LDT format, returning as-is`);
        return tag;
    }
    if (tag.length !== 17) {
        // Unknown format, return as-is
        if (shouldLog)
            console.log(`[normalizeTag] Unknown length ${tag.length}, returning as-is`);
        return tag;
    }
    // RFTagger 17-char format: n---s-------f-n--
    // Positions: 0=pos, 1-3=person, 4=number, 5-11=tense/mood/voice, 12=gender, 13=?, 14=case, 15-16=?
    // Map to LDT 9-char: pos(0), person(1), number(2), tense(3), mood(4), voice(5), gender(6), case(7), degree(8)
    const pos = tag[0];
    const number = tag[4]; // s/p
    const gender = tag[12]; // m/f/n
    const case_ = tag[14]; // n/g/d/a/b/v (position 14, not 13!)
    if (shouldLog) {
        console.log(`[normalizeTag] Extracted: pos=${pos}, number=${number}, gender=${gender}, case=${case_}`);
    }
    // For nouns/adjectives, tense/mood/voice positions (3-5 in LDT) are '-'
    // Person (position 1) is also '-' for nouns
    const result = `${pos}-${number}---${gender}${case_}-`;
    if (shouldLog)
        console.log(`[normalizeTag] Result: "${result}" len=${result.length}`);
    return result;
}
/**
 * Compute distance between two LDT tags
 * Ported from latin_macronizer/postags.py (tag_distance function)
 *
 * LDT tags are 9-char or 12-char strings encoding morphological features.
 * For nomina (nouns, adjectives, verbs-as-participles), tense/mood/voice
 * positions are ignored when comparing tags of different types.
 */
export function tagDistance(tag1, tag2) {
    // Normalize tags first (convert RFTagger 15-char to LDT 9-char)
    tag1 = normalizeTag(tag1);
    tag2 = normalizeTag(tag2);
    // Validate lengths
    const len1 = tag1.length;
    const len2 = tag2.length;
    if (!((len1 === 9 || len1 === 12) && (len2 === 9 || len2 === 12))) {
        console.warn('Warning: Strange or mismatching tags!', tag1, tag2);
        return 0;
    }
    // If lengths differ, we cannot compare directly
    // But in practice they should be same length. Normalize to same length by truncating to 9 if needed.
    if (len1 !== len2) {
        if (len1 === 12)
            tag1 = tag1.slice(0, 9);
        else if (len2 === 12)
            tag2 = tag2.slice(0, 9);
    }
    const t1 = tag1;
    const t2 = tag2;
    /**
     * Check if tag represents a nomen (noun, adjective, or verb-as-participle)
     * In LDT: pos1 = 'n' (noun), 'a' (adjective), or 'v' with participle features (rpp/ppa)
     */
    function isNomen(tag) {
        const pos = tag[0];
        if (pos === 'n' || pos === 'a')
            return true;
        if (pos === 'v' || pos === 'V') {
            // Check for participle: positions 3-5 (0-indexed) for 9-char, or 4-7 for 12-char
            const stem = tag.length === 12 ? tag.slice(4, 7) : tag.slice(3, 6);
            return stem === 'rpp' || stem === 'ppa';
        }
        return false;
    }
    const isNomen1 = isNomen(t1);
    const isNomen2 = isNomen(t2);
    let bothNomenButDifferent = false;
    if (isNomen1 && isNomen2 && t1[0] !== t2[0]) {
        bothNomenButDifferent = true;
    }
    let dist = 0;
    const len = Math.min(t1.length, t2.length);
    for (let i = 0; i < len; i++) {
        // Skip tense/mood/voice positions for nomina of different types
        // 9-char: skip indices 3,4,5 (tense, mood, voice)
        // 12-char: skip indices 4,5,6 (tense, mood, voice)
        if (bothNomenButDifferent) {
            if ((t1.length === 9 && (i === 3 || i === 4 || i === 5)) ||
                (t1.length === 12 && (i === 4 || i === 5 || i === 6))) {
                continue;
            }
        }
        if (t1[i] !== t2[i]) {
            dist += 1;
        }
    }
    return dist;
}
//# sourceMappingURL=latin.js.map