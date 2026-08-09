import {
  separateAmbiguousVowels,
  segmentAccented,
  possibleScans,
} from '../../src/core/Scansion';

/**
 * Scansion prosody unit tests.
 *
 * Covers the M-013 fixes + regression guards:
 *  1. The -ērunt/-ĕrunt 3rd-pl-perfect alternation (stetērunt ~ stetĕrunt).
 *  2. Mid-word "ui" stays two vowels (sangui-ne, anguis) — no accidental
 *     diphthong merge that would corrupt verses.
 *  3. The obstipuī signature line scans as 4 syllables (LSSL), not a false
 *     3-syllable diphthong reading.
 */

describe('separateAmbiguousVowels', () => {
  test('-ērunt/-ĕrunt alternation: long ē before -runt becomes ambiguous', () => {
    // Aen 2.774 "steteruntque": wordlist has long ē (ste^te_runt); the poetic
    // license -ērunt/-ĕrunt must allow the short reading too.
    const variants = separateAmbiguousVowels(['ste^te_runt']);
    expect(variants).toContain('ste^te_runt'); // long ē
    expect(variants).toContain('ste^terunt');  // short ĕ
  });

  test('-ērunt/-ĕrunt applies to any marked vowel before -runt', () => {
    const variants = separateAmbiguousVowels(['dede_runt']);
    expect(variants).toContain('dede_runt');
    expect(variants).toContain('dederunt');
  });

  test('words NOT ending in _runt are left unchanged', () => {
    expect(separateAmbiguousVowels(['amabant'])).toEqual(['amabant']);
    expect(separateAmbiguousVowels(['vide_bat'])).toEqual(['vide_bat']);
  });

  test('ambiguous-vowel splitting still works (2^(n-1) variants)', () => {
    const variants = separateAmbiguousVowels(['ba_^ce_^']);
    expect(variants.sort()).toEqual(['bace', 'bace_', 'ba_ce', 'ba_ce_'].sort());
  });
});

describe('segmentAccented', () => {
  test('mid-word "ui" stays two vowels (sangui-ne)', () => {
    // A regression guard: a future ui-diphthong rule must NOT merge the u+i
    // inside sanguine — the u is consonantal (part of gu) and the i is a
    // separate vowel. This was the 44-line corpus regression.
    const segments = segmentAccented('sanguine');
    expect(segments).toContain('u');
    expect(segments).toContain('i');
    expect(segments).not.toContain('ui');
  });

  test('"guis" (anguis) keeps u and i separate', () => {
    const segments = segmentAccented('anguis');
    expect(segments).toContain('u');
    expect(segments).toContain('i');
    expect(segments).not.toContain('ui');
  });

  test('true diphthongs still merge (ae)', () => {
    expect(segmentAccented('mae')).toContain('ae');
  });
});

describe('possibleScans', () => {
  test('obstipuī stays 4 syllables (LSSL) — no false ui-diphthong merge', () => {
    // Aen 2.774 "obstipui, steteruntque comae": obstipuī is ob-sti-pu-ī (4
    // syllables). The 0-penalty scan must be LSSL; a 3-syllable LSL reading
    // would mean the ui was wrongly merged into one diphthong.
    const scans = possibleScans(['obsti^pu^i_'], '#');
    expect(scans[0].scansion).toBe('LSSL');
    expect(scans[0].penalty).toBe(0);
    expect(scans.some(s => s.scansion === 'LSL')).toBe(false);
  });
});
