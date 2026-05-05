/**
 * DP alignment algorithm for macronization
 * Ported from latin_macronizer/token.py (Token.macronize method)
 * 
 * This module implements edit-distance alignment between plain and accented forms
 * to determine optimal macron placement.
 */

import { toAscii, prefixesWithShortJ } from '../utils/latin';

export interface AlignOptions {
  domacronize?: boolean;  // Add macrons (vs just remove)
  alsomaius?: boolean;    // Convert j+vowel → i+vowel before alignment
  performutov?: boolean;  // Convert u→v in output
  performitoj?: boolean; // Convert i→j in output
}

/**
 * Compute insertion cost
 * ins(a) = 0 if a == '_' (macron marker) else 2
 */
function insCost(a: string): number {
  return a === '_' ? 0 : 2;
}

/**
 * Compute substitution cost
 * sub(p, a) = 100 if a == '_' (macron marker)
 *            = 1 if (I/J or U/V equivalence, case-insensitive ASCII)
 *            = 2 otherwise
 */
function subCost(p: string, a: string): number {
  if (a === '_') return 100;
  
  const pNorm = toAscii(p).toLowerCase();
  const aNorm = toAscii(a).toLowerCase();
  
  // Check for I/J or U/V equivalence
  if ((pNorm === 'i' && aNorm === 'j') ||
      (pNorm === 'j' && aNorm === 'i') ||
      (pNorm === 'u' && aNorm === 'v') ||
      (pNorm === 'v' && aNorm === 'u')) {
    return 1;
  }
  
  // Exact match (case-insensitive, ASCII-normalized)
  if (pNorm === aNorm) return 0;
  
  return 2;
}

/**
 * Compute deletion cost
 * del(_) = 2, otherwise handled by subcost in DP
 * In this DP formulation, deletion is modeled as substitution with empty string
 */
function delCost(p: string): number {
  return p === '_' ? 2 : 2; // Deletion always costs 2
}

/**
 * Check if two characters match (case-insensitive, ASCII-normalized)
 */
function charsMatch(p: string, a: string): boolean {
  return toAscii(p).toLowerCase() === toAscii(a).toLowerCase();
}

/**
 * Align plain text with accented text using DP edit distance
 * Returns the macronized result string (with _ markers)
 * Ported from latin_macronizer/token.py (Token.macronize method)
 */
export function alignMacronized(
  plain: string,
  accented: string,
  options: AlignOptions = {}
): string | null {
  const { domacronize = true, alsomaius = false, performutov = false, performitoj = false } = options;

  // DEBUG: enable logging for problematic words
  const debugWords = ['matrona', 'longissime', 'minime', 'sequana', 'eos', 'hi', 'matrona_', 'longissime_'];
  const shouldLog = debugWords.includes(plain.toLowerCase()) || debugWords.includes(accented.toLowerCase());
  
  if (shouldLog) {
    console.log(`  [alignMacronized] Input: plain="${plain}", accented="${accented}"`);
    console.log(`    Options: domacronize=${domacronize}, alsomaius=${alsomaius}, utov=${performutov}, itoj=${performitoj}`);
  }

  // Early exit: if no macronization and no conversions, return plain
  if (!domacronize && !performutov && !performitoj) {
    if (shouldLog) console.log('    Early exit: no macronization/conversion needed');
    return plain;
  }

  // Clean accented: remove breve markers (_^ and ^)
  // Python: accented = accented.replace("_^", "").replace("^", "")
  let accentedNorm: string = accented.split('_^').join('').split('^').join('');

  // Apply alsomaius transformation if needed (only on accented)
  if (domacronize && alsomaius && accentedNorm.includes('j')) {
    const lowerAcc = accentedNorm.toLowerCase();
    const startsWithShortJPrefix = prefixesWithShortJ.some(prefix => lowerAcc.startsWith(prefix));
    if (!startsWithShortJPrefix) {
      // Insert underscore after vowel before j+vowel: ([aeiouy])(j[aeiouy]) → \1_\2
      accentedNorm = accentedNorm.replace(/([aeiouy])(j[aeiouy])/gi, (_, v, jv) => `${v}_${jv}`);
    }
  }

  // Early exact match: if plain equals accented without underscores, return accented (with underscores)
  const accentedWithoutUnderscores = accentedNorm.replace(/_/g, '');
  const isExactMatch = options.alsomaius
    ? plain.toLowerCase() === accentedWithoutUnderscores.toLowerCase()
    : plain === accentedWithoutUnderscores;
  if (isExactMatch) {
    // Preserve original case when alsomaius is enabled
    let result = accentedNorm;
    if (options.alsomaius && plain[0] !== accentedNorm[0]) {
      // Match the case of the first character
      result = plain[0] + accentedNorm.slice(1);
    }
    if (shouldLog) console.log(`    Early exact match: "${plain}" === "${accentedWithoutUnderscores}" (alsomaius=${options.alsomaius}), returning "${result}"`);
    return result;
  }

  const n = plain.length;
  const m = accentedNorm.length;

  // DP matrix: distance[i][j] = min cost to align plain[0:i] with accented[0:j]
  const distance: number[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill(Infinity));
  // Store backtrack directions (which move led to min cost)
  const backtrackDir: ('diag'|'up'|'left')[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill('diag'));

  // Base case
  distance[0][0] = 0;
  backtrackDir[0][0] = 'diag';

  // First row: insertions from accented
  for (let j = 1; j <= m; j++) {
    const aChar = accentedNorm[j - 1];
    distance[0][j] = distance[0][j - 1] + insCost(aChar);
    backtrackDir[0][j] = 'up';
  }

  // First column: deletions from plain
  for (let i = 1; i <= n; i++) {
    const pChar = plain[i - 1];
    distance[i][0] = distance[i - 1][0] + delCost(pChar);
    backtrackDir[i][0] = 'left';
  }

  // Fill DP matrix
  for (let i = 1; i <= n; i++) {
    const pChar = plain[i - 1];
    for (let j = 1; j <= m; j++) {
      const aChar = accentedNorm[j - 1];

      const diagCost = distance[i - 1][j - 1] + subCost(pChar, aChar);
      const upCost = distance[i][j - 1] + insCost(aChar);
      const leftCost = distance[i - 1][j] + delCost(pChar);

      let minCost = diagCost;
      let bestMove: 'diag' | 'up' | 'left' = 'diag';
      if (upCost < minCost) {
        minCost = upCost;
        bestMove = 'up';
      }
      if (leftCost < minCost) {
        minCost = leftCost;
        bestMove = 'left';
      }

      distance[i][j] = minCost;
      backtrackDir[i][j] = bestMove;
    }
  }

  // Backtrack to build result string
  let result = '';
  let i = n;
  let j = m;
  
  if (shouldLog) {
    console.log(`    Starting backtrack from [${n}][${m}], distance=${distance[n][m]}`);
  }

  while (i > 0 || j > 0) {
    const move = backtrackDir[i][j];
    if (shouldLog) console.log(`      [${i}][${j}] move=${move}`);
    
    if (move === 'diag' && i > 0 && j > 0) {
      const pChar = plain[i - 1];
      const aChar = accentedNorm[j - 1];
      const pLower = pChar.toLowerCase();
      const aLower = aChar.toLowerCase();

      // Determine output character
      let outChar: string;
      if (performutov && aLower === 'v' && pLower === 'u') {
        outChar = pChar === 'u' ? 'v' : 'V';
      } else if (performitoj && aLower === 'j' && pLower === 'i') {
        outChar = pChar === 'i' ? 'j' : 'J';
      } else {
        outChar = pChar;
      }

      if (charsMatch(pChar, aChar)) {
        // Match: prepend character
        result = outChar + result;
      } else if (aChar === '_' && domacronize) {
        // Substitution with macron: prepend char + macron
        result = outChar + '_' + result;
      } else {
        // Other substitution: prepend char
        result = outChar + result;
      }
      i--;
      j--;
    } else if (move === 'up' && j > 0) {
      const aChar = accentedNorm[j - 1];
      // Insertion: prepend '_' if domacronize and aChar is '_'
      if (domacronize && aChar === '_') {
        result = '_' + result;
      }
      j--;
    } else if (move === 'left' && i > 0) {
      const pChar = plain[i - 1];
      // Deletion: prepend plain char
      result = pChar + result;
      i--;
    } else {
      // Safety: break if stuck
      if (shouldLog) console.log('      Safety break: stuck in backtrack');
      break;
    }
  }

  // Clean up double macrons (e.g., from multiple insertions)
  result = result.replace(/_+/g, '_');

  if (shouldLog) {
    console.log(`    Final result (underscore): "${result}"`);
  }

  // Note: Do NOT strip trailing underscore — it marks a macron on the final vowel
  return result;
}

/**
 * Main entry point: macronize a plain Latin word
 * This is a direct port of Token.macronize() logic
 */
export function macronizeWord(
  plain: string,
  accented: string,
  enclitic: string | null = null,
  options: AlignOptions = {}
): string | null {
  const { performutov = false } = options;
  
  // Special case: if enclitic is 'ue' and performutov, return plain (skip macronization)
  if (performutov && enclitic === 'ue') {
    return plain;
  }
  
  // Exact match shortcut
  if (plain.toLowerCase() === accented.toLowerCase()) {
    return accented;
  }
  
  // Run alignment
  return alignMacronized(plain, accented, options);
}
