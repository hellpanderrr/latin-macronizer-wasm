import { 
  tagDistance, 
  levenshteinDistance, 
  underscoreToUnicode, 
  unicodeToUnderscore,
  toAscii 
} from '../src/utils/latin';

/**
 * Helper to build LDT 9-character tags.
 * LDT tag positions (0-indexed):
 * 0: part of speech (n, v, a, etc.)
 * 1: person (1,2,3,-)
 * 2: number (s,p,-)
 * 3: tense (p,i,r,l,t,f,-)
 * 4: mood (i,s,n,m,g,u,d,p,-)
 * 5: voice (a,p,-)
 * 6: gender (m,f,n,-)
 * 7: case (n,g,d,a,b,v,l,-)
 * 8: degree (p,c,s,-)  (p=positive, c=comparative, s=superlative)
 */
function makeLdtTag(opts: {
  pos: string;
  person?: string;
  number?: string;
  tense?: string;
  mood?: string;
  voice?: string;
  gender?: string;
  case?: string;
  degree?: string;
}): string {
  const pos = opts.pos;
  const person = opts.person || '-';
  const number = opts.number || '-';
  const tense = opts.tense || '-';
  const mood = opts.mood || '-';
  const voice = opts.voice || '-';
  const gender = opts.gender || '-';
  const case_ = opts.case || '-';
  const degree = opts.degree || '-';
  return pos + person + number + tense + mood + voice + gender + case_ + degree;
}

describe('levenshteinDistance', () => {
  test('identical strings', () => {
    expect(levenshteinDistance('kitten', 'kitten')).toBe(0);
  });

  test('kitten vs sitting', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  test('empty vs non-empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  test('latin characters', () => {
    expect(levenshteinDistance('rosa', 'rosae')).toBe(1);
  });
});

describe('underscoreToUnicode and unicodeToUnderscore', () => {
  test('converts a_ to ā', () => {
    expect(underscoreToUnicode('a_')).toBe('ā');
  });

  test('converts all vowels', () => {
    expect(underscoreToUnicode('e_')).toBe('ē');
    expect(underscoreToUnicode('i_')).toBe('ī');
    expect(underscoreToUnicode('o_')).toBe('ō');
    expect(underscoreToUnicode('u_')).toBe('ū');
    expect(underscoreToUnicode('y_')).toBe('ȳ');
  });

  test('converts uppercase', () => {
    expect(underscoreToUnicode('A_')).toBe('Ā');
    expect(underscoreToUnicode('E_')).toBe('Ē');
  });

  test('round trip: underscore -> unicode -> underscore', () => {
    const original = 'ro_sa cu_m po_tam';
    const unicode = underscoreToUnicode(original);
    const back = unicodeToUnderscore(unicode);
    expect(back).toBe(original);
  });

  test('unicodeToUnderscore converts macrons to underscore', () => {
    expect(unicodeToUnderscore('rōsa')).toBe('ro_sa');
    expect(unicodeToUnderscore('cūmus')).toBe('cu_mus');
  });
});

describe('toAscii', () => {
  test('converts ae and oe', () => {
    expect(toAscii('æ')).toBe('ae');
    expect(toAscii('œ')).toBe('oe');
    expect(toAscii('Æ')).toBe('Ae');
    expect(toAscii('Œ')).toBe('Oe');
  });

  test('converts diaeresis', () => {
    expect(toAscii('ä')).toBe('a');
    expect(toAscii('ë')).toBe('e');
    expect(toAscii('ï')).toBe('i');
    expect(toAscii('ö')).toBe('o');
    expect(toAscii('ü')).toBe('u');
    expect(toAscii('ÿ')).toBe('u');
  });
});

describe('tagDistance', () => {
  test('identical tags have distance 0', () => {
    const tag = makeLdtTag({ pos: 'n', number: 's', gender: 'm', case: 'n' });
    expect(tagDistance(tag, tag)).toBe(0);
  });

  test('difference in case (position 7) counts', () => {
    const tag1 = makeLdtTag({ pos: 'n', number: 's', gender: 'm', case: 'n' });
    const tag2 = makeLdtTag({ pos: 'n', number: 's', gender: 'm', case: 'g' });
    expect(tagDistance(tag1, tag2)).toBe(1);
  });

  test('difference in number (position 2) counts', () => {
    const tag1 = makeLdtTag({ pos: 'n', number: 's', gender: 'm', case: 'n' });
    const tag2 = makeLdtTag({ pos: 'n', number: 'p', gender: 'm', case: 'n' });
    expect(tagDistance(tag1, tag2)).toBe(1);
  });

  test('difference in gender (position 6) counts', () => {
    const tag1 = makeLdtTag({ pos: 'n', number: 's', gender: 'm', case: 'n' });
    const tag2 = makeLdtTag({ pos: 'n', number: 's', gender: 'f', case: 'n' });
    expect(tagDistance(tag1, tag2)).toBe(1);
  });

  test('noun vs adjective: skips tense/mood/voice (positions 3,4,5) even if they differ', () => {
    // Noun: n---m-n-  (pos=n, number=s, gender=m, case=n)
    const noun = makeLdtTag({ pos: 'n', number: 's', gender: 'm', case: 'n' });
    // Adjective with non-default tense/mood/voice to test skip
    const adj = makeLdtTag({ 
      pos: 'a', 
      number: 's', 
      gender: 'm', 
      case: 'n', 
      degree: '0',
      tense: 'p',   // will be skipped
      mood: 'i',    // will be skipped
      voice: 'a'    // will be skipped
    });
    // Differences: pos (0) and degree (8) count; tense/mood/voice (3,4,5) skipped.
    expect(tagDistance(noun, adj)).toBe(2);
  });

  test('verb tags: all positions count (since not both nomina)', () => {
    // Verb: v1s-p-i-a-- (pos=v, person=1, number=s, tense=p, mood=i, voice=a)
    const verb1 = makeLdtTag({ pos: 'v', person: '1', number: 's', tense: 'p', mood: 'i', voice: 'a' });
    const verb2 = makeLdtTag({ pos: 'v', person: '1', number: 's', tense: 'f', mood: 'i', voice: 'a' });
    expect(tagDistance(verb1, verb2)).toBe(1);
  });

  test('participle (v with rpp) vs noun: both nomina, skip 3-5', () => {
    // Participle: v--rpp-m-n- (pos=v, tense='r', mood='p', voice='p', gender=m, case=n)
    const participle = makeLdtTag({ 
      pos: 'v', 
      tense: 'r', 
      mood: 'p', 
      voice: 'p', 
      gender: 'm', 
      case: 'n' 
    });
    // Noun: n---m-n-
    const noun = makeLdtTag({ pos: 'n', number: 's', gender: 'm', case: 'n' });
    // Both are nomina (participle qualifies because pos='v' and (mood='p' and voice='p'? Actually isNomen checks if pos='v' and (tag[3:6]=='rpp' or 'ppa'). Here we have tense='r', mood='p', voice='p' => "rpp" at positions 3-5. So yes.
    // Differences: pos (0) and number? noun has number at pos2='s', participle has number? default '-' => difference at pos2. Also maybe case? both case 'n' same. So distance at least 2.
    expect(tagDistance(noun, participle)).toBe(2);
  });
});
