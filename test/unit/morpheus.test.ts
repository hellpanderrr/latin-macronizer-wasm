/**
 * Unit tests for Morpheus output parsing (MorpheusAnalyzer.parseOutput) and
 * the extras-store versioning that keeps a parsing fix from being masked by
 * analyses persisted under the old parser.
 *
 * The raw lines are real cruncher output captured from the live page
 * (2026-10-11). The expected values mirror the Python reference,
 * postags.py::morpheus_to_parses lines 426-436.
 */
import 'fake-indexeddb/auto';
import { MorpheusAnalyzer } from '../../src/analysis/MorpheusAnalyzer';
import { WordlistEngine } from '../../src/analysis/WordlistEngine';

const parse = (word: string, ...lines: string[]) =>
  (new MorpheusAnalyzer() as any).parseOutput(
    word,
    lines.map((l) => `<NL>${l}</NL>`).join(''),
    lines.length,
  );

describe('parseOutput — "accented,lemma" lines (M-001)', () => {
  it('keeps the accented wordform before the comma, the lemma after it', () => {
    const r = parse('paracliti', 'N para_cli_ti_,paracletus  masc gen sg\t\t\tus_i');
    expect(r.analyses[0].accented).toBe('para_cli_ti_');
    expect(r.analyses[0].lemma).toBe('paracletus');
  });

  it('a comma in the trailing stem-class field does not split the form', () => {
    const r = parse('obtineatis', 'V obtinea_tis,obtineo  pres subj act 2nd pl\t\t\tconj2');
    expect(r.analyses[0].accented).toBe('obtinea_tis');
  });
});

describe('parseOutput — bare "lemma" lines echo the word looked up (M-031)', () => {
  it('a verb form: effuget stays effuget, not the lemma effugo', () => {
    const r = parse('effuget', 'V effugo  pres subj act 3rd sg\t\t\tconj1,are_vb');
    expect(r.analyses[0].accented).toBe('effuget');
    expect(r.analyses[0].lemma).toBe('effugo');
  });

  it('a participle: redimente stays redimente', () => {
    const r = parse('redimente', 'P redimo  pres part masc/fem/neut abl sg\t\t\tconj3');
    expect(r.analyses[0].accented).toBe('redimente');
    expect(r.analyses[0].lemma).toBe('redimo');
  });

  it('a capitalized lemma capitalizes the echo (adae → Adae, as Python)', () => {
    const r = parse('adae', 'N Ada  fem dat sg\t\t\ta_ae', 'N Ada  fem gen sg\t\t\ta_ae');
    expect(r.analyses.map((a: any) => a.accented)).toEqual(['Adae', 'Adae']);
    expect(r.analyses[0].lemma).toBe('Ada');
  });

  it('the echo is lowercased first, like Python wordform.lower()', () => {
    const r = parse('EFFUGET', 'V effugo  pres subj act 3rd sg\t\t\tconj1,are_vb');
    expect(r.analyses[0].accented).toBe('effuget');
  });

  it('when the word looked up is the lemma, the echo equals it', () => {
    const r = parse('congaudeo', 'V congaudeo  pres ind act 1st sg\t\t\tconj2');
    expect(r.analyses[0].accented).toBe('congaudeo');
  });
});

describe('WordlistEngine — extras from an older analyzer are cleared', () => {
  const DB = 'MacronizerDB_v4';

  async function seed(meta: Record<string, unknown>): Promise<void> {
    const engine = new WordlistEngine();
    await engine.init();
    const db: IDBDatabase = (engine as any).db;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['meta', 'extra'], 'readwrite');
      tx.objectStore('meta').put({ key: 'meta', schemaVersion: 1, dataVersion: 1, count: 5, ...meta });
      // A row the old parser wrote: the lemma stored as the form.
      tx.objectStore('extra').put({
        seq: 5, wordform: 'effuget', tag: 'v3spsa---', lemma: 'effugo',
        macronized: 'effugo', accentedUnderscore: 'effugo',
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  // Every open connection must close, or the next test's deleteDatabase blocks.
  let engine: WordlistEngine | null = null;
  afterEach(async () => {
    if (engine) (engine as any).db?.close();
    engine = null;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  it('meta without extrasVersion: extras dropped, wordlist kept populated', async () => {
    await seed({});
    engine = new WordlistEngine();
    expect(await engine.isPopulated()).toBe(true);
    expect(await engine.getAllEntries('effuget')).toEqual([]);
  });

  it('a lookup cached before the version check does not survive it', async () => {
    await seed({});
    engine = new WordlistEngine();
    expect((await engine.getAllEntries('effuget')).length).toBe(1); // old row, cached
    expect(await engine.isPopulated()).toBe(true);
    expect(await engine.getAllEntries('effuget')).toEqual([]);
  });

  it('meta with the current extrasVersion: extras kept', async () => {
    await seed({ extrasVersion: (new WordlistEngine() as any).EXTRAS_VERSION });
    engine = new WordlistEngine();
    expect(await engine.isPopulated()).toBe(true);
    const rows = await engine.getAllEntries('effuget');
    expect(rows.map((r) => r.accentedUnderscore)).toEqual(['effugo']);
  });
});
