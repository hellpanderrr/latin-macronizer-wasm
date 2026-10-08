/**
 * Unit tests for liturgical stress accentuation (Stress.ts).
 *
 * Expected values are the written accents of the Roman liturgical books
 * (gregorio-project/latin-ecclesiastic-accents doc/accentuation-rules.md),
 * with wordlist readings quoted so each expectation is traceable. The
 * accented (underscore) form is the engine's chosen reading; the invariant is
 * that the accent always reflects THOSE length marks.
 */
import { applyStress } from '../../src/core/Stress';
import { stripStressMark } from '../../src/utils/latin';

describe('applyStress — penult by nature (rule 3)', () => {
  it('long vowel in the penult takes the accent', () => {
    expect(applyStress('excelsis', 'excelsi_s')).toBe('excélsis');
    expect(applyStress('sanctificetur', 'sa_ncti^fi^ce_tur')).toBe('sanctificétur');
    expect(applyStress('adveniat', 'adve^niat')).toBe('advéniat');
    expect(applyStress('adiutor', 'adju_tor')).toBe('adiútor');
    expect(applyStress('quoniam', 'quo^ni^am')).toBe('quóniam');
    expect(applyStress('candelabrum', 'cande_la_brum')).toBe('candelábrum');
    expect(applyStress('lavacrum', 'la^va_crum')).toBe('lavácrum');
  });

  it('a diphthong penult is long; the first element takes the accent', () => {
    expect(applyStress('auribus', 'auribus')).toBe('áuribus');
  });
});

describe('applyStress — penult by position (rule 3)', () => {
  it('two consonants close the penult, x counts double', () => {
    expect(applyStress('exsultet', 'exsultet')).toBe('exsúltet');
    expect(applyStress('crucifixus', 'cru^ci^fi_xus')).toBe('crucifíxus');
    expect(applyStress('haruspex', 'ha^ruspex')).toBe('harúspex');
  });

  it('muta cum liquida does NOT close the penult in prose (rule 4)', () => {
    expect(applyStress('genitrix', 'ge^ni^tri_x')).toBe('génitrix');
    expect(applyStress('septuplum', 'septu^plum')).toBe('séptuplum');
    expect(applyStress('volucres', 'vo^lu^cre_s')).toBe('vólucres');
    expect(applyStress('tenebrae', 'te^ne^brae')).toBe('ténebrae');
  });

  it('ch/th/ph count as one consonant', () => {
    expect(applyStress('calathus', 'ca^la^thus')).toBe('cálathus');
  });
});

describe('applyStress — antepenult (rule 4)', () => {
  it('light penult moves the accent back', () => {
    expect(applyStress('desidero', 'de_si_de^ro_')).toBe('desídero');
    expect(applyStress('desuper', 'de_super')).toBe('désuper');
    expect(applyStress('confiteor', 'co_nfi^teor')).toBe('confíteor');
    // native `eu` is two syllables: ce-re-us
    expect(applyStress('cereus', 'ce_re^us')).toBe('céreus');
  });

  it('the qu/gu u is an onset glide, not a vowel', () => {
    expect(applyStress('sanguis', 'sanguis')).toBe('sanguis'); // 2 syllables
    expect(applyStress('sanguine', 'sanguine')).toBe('sánguine'); // sán-gui-ne
  });
});

describe('applyStress — words of one or two syllables (rule 1)', () => {
  it('no accent is written', () => {
    expect(applyStress('pater', 'pa^ter')).toBe('pater');
    expect(applyStress('nomen', 'no^me_n')).toBe('nomen');
    expect(applyStress('tibi', 'tibi_^')).toBe('tibi');
    expect(applyStress('maior', 'major')).toBe('maior');
  });
});

describe('applyStress — enclitics (rule 2)', () => {
  it('accent moves to the syllable before the enclitic, whatever its quantity', () => {
    // rŏ-să-que: penult would be short, but the enclitic wins
    expect(applyStress('rosaque', 'rosa_que', true)).toBe('rosáque');
    // Fī-lĭ-úm-que (corpus, Exsultet): accent on the syllable before -que
    expect(applyStress('filiumque', 'fi_li^umque', true)).toBe('filiúmque');
  });

  it('a word merely ending in the letters -que is not an enclitic', () => {
    // Without the token-layer enclitic flag, the penult rule applies.
    expect(applyStress('quaeque', 'quaeque', false)).toBe('quaeque'); // 2 syllables
  });
});

describe('applyStress — liturgical exceptions', () => {
  it('Iesu(s) counts two syllables (synizesis): no accent', () => {
    expect(applyStress('Iesu', 'I^e_su')).toBe('Iesu');
    expect(applyStress('Iesum', 'I^e_sum')).toBe('Iesum');
  });

  it('Maria, Mariae take the Hebrew-name penult accent', () => {
    expect(applyStress('Maria', 'ma^ria')).toBe('María'); // case preserved
    expect(applyStress('Maríæ', 'Ma^ri_^ae')).toBe('Maríæ');
  });
});

describe('applyStress — ligatures and case', () => {
  it('the acute lands on the ligature itself', () => {
    // prǽ-mi-is (corpus, Benedictiones): the accented vowel is the ligature.
    expect(applyStress('præmiis', 'praemii_s')).toBe('prǽmiis');
    // accent on the ligature's SECOND vowel would keep it on the i, so a
    // post-ligature accent must not be dragged onto the ligature.
    expect(applyStress('caelestis', 'Caelesti_s')).toBe('caeléstis');
    expect(applyStress('laetitiam', 'laeti^ti^am')).toBe('laetítiam');
  });

  it('precomposed and combining acutes in the input are replaced, not doubled', () => {
    expect(applyStress('sanctificétur', 'sa_ncti^fi^ce_tur')).toBe('sanctificétur');
  });
});

describe('stripStressMark', () => {
  it('removes combining and precomposed acutes', () => {
    expect(stripStressMark('sanctificétur')).toBe('sanctificetur');
    expect(stripStressMark('sānctificētur')).toBe('sānctificētur'); // macrons stay
    expect(stripStressMark('cǽléstis')).toBe('cælestis');
    expect(stripStressMark('sanctificet́ur')).toBe('sanctificetur');
  });
});
