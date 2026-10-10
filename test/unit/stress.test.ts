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
import { stripStressMark, stripLengthMark } from '../../src/utils/latin';

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

describe('applyStress — A&G §§ 11–12 conformance (qu glide, consonantal i)', () => {
  it('the u of qu is not a consonant: qu-words take the antepenult', () => {
    // A&G § 11, Note 3. Corpus: Dénique (Breviarium O.P.), áliquid 47×,
    // réliqui 8×, útique (Ps 54/57), ítaque (Adventus, Regula).
    expect(applyStress('denique', 'de_ni^que')).toBe('dénique');
    expect(applyStress('reliquus', 're^li^quus')).toBe('réliquus');
    expect(applyStress('aliquid', 'aliquid')).toBe('áliquid');
    expect(applyStress('aliquis', 'aliquis')).toBe('áliquis');
    expect(applyStress('itaque', 'i^ta^que')).toBe('ítaque');
    expect(applyStress('utique', 'u^ti^que^')).toBe('útique');
    expect(applyStress('undique', 'undique')).toBe('úndique');
    expect(applyStress('antequam', 'antequam')).toBe('ántequam');
    expect(applyStress('utraque', 'utraque')).toBe('útraque');
    expect(applyStress('subsequi', 'subse^qui_')).toBe('súbsequi');
    expect(applyStress('persequens', 'perse^que_ns')).toBe('pérsequens');
    // The glide is why these do NOT move to the penult even though t/qu
    // would otherwise count as two consonants.
    expect(applyStress('relinquit', 're^linquit')).toBe('relínquit');
    expect(applyStress('reliquit', 're^li_quit')).toBe('relíquit');
  });

  it('a consonantal i (j) closes the syllable like x (A&G § 11. d)', () => {
    // Corpus: alicúius (Regula ×2), eiúsdem 6× (missal + Regula).
    expect(applyStress('alicuius', 'alicujus')).toBe('alicúius');
    expect(applyStress('eiusdem', 'ejusdem')).toBe('eiúsdem');
  });

  it('gu keeps counting as a closing pair where the glide has its own nucleus', () => {
    // -guu- is two separate u's (am-bí-gu-us, ex-í-gu-us), not a glide:
    // counting stops the accent moving to the last u. Corpus: "Stat rex
    // ambíguus" (hymn).
    expect(applyStress('ambiguus', 'ambi^gu^us')).toBe('ambíguus');
    // But before a vowel the gu glide collapses (sán-gui-ne), and the corpus
    // agrees: sánguine 82×.
    expect(applyStress('sanguine', 'sanguine')).toBe('sánguine');
  });

  it('a MARKED u after g/q is the word\'s own vowel, not the glide', () => {
    // arguō is ar-gu-ō (u vocalic); the reading marks it short — argu^a_s.
    // Corpus: árguas 7×, árguam 2×, árguet 2×, argúere 2× (Antiphonale,
    // Regula). Fixes 4 corpus placements (net +2; 2 capped-sentence-start
    // forms were accidental agreements before, and Solesmes' Option-2
    // "no accent on a capitalized first letter" is deliberately unimplemented).
    expect(applyStress('arguas', 'argu^a_s')).toBe('árguas');
    expect(applyStress('arguam', 'argu^am')).toBe('árguam');
    expect(applyStress('arguet', 'argu^et')).toBe('árguet');
    expect(applyStress('arguere', 'argu^ere')).toBe('argúere');
    // qu readings never mark u ('qu' + marked u: 0 rows in macrons.txt), so
    // the glide holds even before a vowel — é-quus, se-qúun-tur stay 2/3 syll.
    expect(applyStress('sequuntur', 'sequuntur')).toBe('sequúntur');
    expect(applyStress('relinquunt', 'relinquunt')).toBe('relínquunt');
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

  it('words whose lexical accent the reading does not carry', () => {
    // cuīque's wordlist row has no length mark; corpus: "prout cuíque opus
    // erat" (Regula Sancti Benedicti).
    expect(applyStress('cuique', 'cuique')).toBe('cuíque');
    // tibine is tibi + -ne (A&G § 12: tĭbĭ'ne); the whole-word rows are
    // tibinus forms, so the enclitic split never fires.
    expect(applyStress('tibine', 'ti_bi^ne')).toBe('tibíne');
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

describe('stripLengthMark (macronized input)', () => {
  it('removes macrons and breves, combining and precomposed', () => {
    expect(stripLengthMark('sānctificētur')).toBe('sanctificetur');
    expect(stripLengthMark('dīvīsa')).toBe('divisa');
    expect(stripLengthMark('āb̆')).toBe('ab'); // NFD macron/breve
    expect(stripLengthMark('nōn est')).toBe('non est');     // non-word chars untouched
    expect(stripLengthMark('sanctificétur')).toBe('sanctificétur'); // acutes are stripStressMark's job
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

describe('Tokenization.detokenizeStressed (enclitic tokens keep their display form)', () => {
  // The display text of a token with NO stress accent — the enclitic of a split
  // pair, or a two-syllable word (rule 1: nomen) — must not fall back to the raw
  // input: enabling accent used to drop a u→v conversion off the enclitic
  // (nequeue + u→v: macronized "nequeve" vs stressed "nequéve" before the fix).
  it('falls back to macronizedText before text, like detokenize() does', () => {
    // Build the exact split shape by hand (immutable Token API).
    const { Tokenization } = require('../../src/core/Tokenization');
    const { Token } = require('../../src/core/Token');
    const t = new Tokenization('nequeue', { preserveWhitespace: true });
    t.tokens = [
      new Token('neque', { text: 'neque', isWord: true, hasenclitic: true, startIndex: 0, endIndex: 5,
        macronizedText: 'neque', stressedText: 'néque' }),
      new Token('ue', { text: 'ue', isWord: true, isenclitic: true, startIndex: 5, endIndex: 7,
        macronizedText: 've' }),   // ortho-converted display; no stress accent of its own
    ];
    expect(t.detokenize()).toBe('nequeve');
    expect(t.detokenizeStressed()).toBe('néqueve');   // was 'néqueue' before the fix
  });
});
