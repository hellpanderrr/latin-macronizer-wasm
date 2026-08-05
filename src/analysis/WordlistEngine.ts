/**
 * WordlistEngine.ts
 * IndexedDB-based wordlist for accurate Latin macronization
 * Stores exact wordform + tag → macronized form mappings from macrons.txt
 * Integrates with Morpheus for unknown words
 */

import { MorpheusAnalyzer, MorpheusAnalysis } from './MorpheusAnalyzer';
import { unicodeToUnderscore, toAscii } from '../utils/latin';
import { fetchMaybeGzipped } from '../utils/assets';

export interface WordlistEntry {
  wordform: string;
  tag: string;
  macronized: string;           // Unicode macronized form (for display)
  accentedUnderscore: string;   // Underscore-marked form (for DP alignment)
  lemma: string;
  seq?: number;                 // File-order sequence (primary key; preserves Python iteration order)
}

/** A range chunk: all entries for a sorted run of wordforms, packed into one
 * IndexedDB record. Writing ~800 of these instead of 812k individual rows
 * turns the first-visit wordlist persist from ~10 minutes into ~25 seconds
 * (row-per-entry puts + secondary-index maintenance dominate; measured 20x). */
interface WordlistChunk {
  /** First (lowest) wordform in the chunk — the primary key. Lookup does a
   * binary search over chunk keys for the greatest firstWord <= word. */
  firstWord: string;
  /** wordform → its entries, in original file order */
  groups: Record<string, WordlistEntry[]>;
}

export class WordlistEngine {
  private db: IDBDatabase | null = null;
  private loaded: boolean = false;
  private entryCount: number = 0;
  private morpheusAnalyzer: MorpheusAnalyzer | null = null;
  private loadingPromise: Promise<void> | null = null;
  private nextSeq: number = 0;
  // v4: range-chunk schema (v3 was row-per-entry). New name = old DBs are
  // simply abandoned; the browser reclaims them eventually.
  private readonly DB_NAME = 'MacronizerDB_v4';
  private readonly DB_VERSION = 1;
  /** ~800 chunk records covering the whole wordlist, keyed by firstWord */
  private readonly CHUNK_STORE = 'chunks';
  /** Row-per-entry store for Morpheus-analyzed unknown words (small, grows
   * incrementally — the chunk layout is immutable after load) */
  private readonly EXTRA_STORE = 'extra';
  /** Single meta record: schema/data version + entry count */
  private readonly META_STORE = 'meta';
  /** Bump when the packing logic changes incompatibly. */
  private readonly SCHEMA_VERSION = 1;
  /** Bump when macrons.txt content changes, so returning visitors reload
   * instead of keeping a stale dictionary forever. */
  private readonly DATA_VERSION = 1;
  /** Entries per chunk. 1000 keeps a chunk ~100KB — one get() per unseen
   * wordform neighborhood, small enough to clone cheaply. */
  private readonly CHUNK_SIZE = 1000;
  /** Sorted chunk keys, loaded once per session (~800 strings). */
  private chunkKeys: string[] | null = null;
  /** Fetched chunks by firstWord — bounded by chunk count (~800); cleared in
   * clearEntriesCache() together with the per-word cache. */
  private chunksCache: Map<string, WordlistChunk> = new Map();
  /** Full in-memory groups map, present only in the session that parsed the
   * file. Serves lookups instantly while chunks persist in the background. */
  private memGroups: Map<string, WordlistEntry[]> | null = null;
  /** Resolves when the background chunk persist finishes (tests await this). */
  private persistPromise: Promise<void> | null = null;
  /** Cache of Morpheus analyses by normalized wordform (for UI display) */
  private morpheusCache: Map<string, MorpheusAnalysis> = new Map();
  /** In-memory cache for getAllEntries — eliminates redundant IndexedDB cursor
   * calls across the 3+ passes (ensureAnalyzed, addLemmas, getAccents) that
   * each look up every wordform. Keyed by lowered wordform. */
  private entriesCache: Map<string, WordlistEntry[]> = new Map();

  /**
   * Initialize IndexedDB database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.CHUNK_STORE)) {
          db.createObjectStore(this.CHUNK_STORE, { keyPath: 'firstWord' });
        }
        if (!db.objectStoreNames.contains(this.EXTRA_STORE)) {
          // Same shape as the old v3 row store: seq preserves insertion order
          const extra = db.createObjectStore(this.EXTRA_STORE, { keyPath: 'seq' });
          extra.createIndex('wordform', 'wordform', { unique: false });
        }
        if (!db.objectStoreNames.contains(this.META_STORE)) {
          db.createObjectStore(this.META_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  private idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([storeName], 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Check if database is populated with the current schema+data version.
   * A stale version (schema change or updated macrons.txt) reads as empty,
   * which makes the caller re-download and overwrite.
   */
  async isPopulated(): Promise<boolean> {
    if (!this.db) await this.init();

    const meta = await this.idbGet<{ key: string; schemaVersion: number; dataVersion: number; count: number }>(
      this.META_STORE, 'meta'
    );
    if (!meta || meta.schemaVersion !== this.SCHEMA_VERSION || meta.dataVersion !== this.DATA_VERSION || !(meta.count > 0)) {
      if (meta) {
        console.log('[WordlistEngine] stored wordlist is stale (schema/data version changed), reloading');
        await this.clear();
      }
      return false;
    }

    this.entryCount = meta.count;
    // Seed the sequence counter past existing rows (Morpheus additions append
    // to the extra store from here)
    const extraCount = await new Promise<number>((resolve, reject) => {
      const tx = this.db!.transaction([this.EXTRA_STORE], 'readonly');
      const req = tx.objectStore(this.EXTRA_STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    this.nextSeq = meta.count + extraCount;
    return true;
  }

  /**
   * Get entry count
   */
  size(): number {
    return this.entryCount;
  }

  /** Clear the in-memory getAllEntries cache. Call between large documents
   * to prevent unbounded memory growth — the cache repopulates on demand. */
  clearEntriesCache(): void {
    this.entriesCache.clear();
    this.chunksCache.clear();
  }

  /**
   * Lookup exact macronized form for word + tag
   */
  async lookup(wordform: string, tag: string): Promise<string | null> {
    // Get all entries for this wordform and find best tag match
    const entries = await this.getAllEntries(wordform);
    if (entries.length === 0) return null;
    
    // Normalize the target tag for comparison
    const normalizedTargetTag = this.normalizeTag(tag.trim());
    
    // Prefer entry with exact tag match
    for (const entry of entries) {
      if (entry.tag === normalizedTargetTag) {
        return entry.macronized;
      }
    }
    
    // Fallback: return first entry's macronized form
    return entries[0].macronized;
  }

  /**
   * Get all entries for a wordform (for candidate generation)
   * Returns entries with accentedUnderscore populated
   */
  async getAllEntries(wordform: string): Promise<WordlistEntry[]> {
    if (!this.db) await this.init();

    const normalizedWord = wordform.toLowerCase().trim();

    // Cache hit — avoids redundant IndexedDB trips across the 3+ passes
    const cached = this.entriesCache.get(normalizedWord);
    if (cached !== undefined) return cached;

    let entries: WordlistEntry[] | undefined;

    // Session that parsed the file: serve from memory (chunks may still be
    // persisting in the background)
    if (this.memGroups) {
      entries = this.memGroups.get(normalizedWord);
    } else {
      entries = await this.lookupInChunks(normalizedWord);
    }

    // Not in the wordlist file — check Morpheus-analyzed extras from a
    // previous visit (extras only exist for words absent from the file)
    if (!entries || entries.length === 0) {
      entries = await this.lookupInExtras(normalizedWord);
    }

    const result = (entries ?? []).filter(e => e.accentedUnderscore);
    // Defensive: stale entries (pre-fix) may still contain a comma in
    // accentedUnderscore (e.g. "currito_,curro") from a bug in parseAnalysisLine.
    // Filter them out so the word falls through to Morpheus re-analysis.
    this.entriesCache.set(normalizedWord, result.filter(e => !e.accentedUnderscore.includes(',')));
    return this.entriesCache.get(normalizedWord)!;
  }

  /** Binary search the sorted chunk keys for the chunk that could contain
   * `word` (greatest firstWord <= word), fetch it, and read the group. */
  private async lookupInChunks(word: string): Promise<WordlistEntry[] | undefined> {
    if (!this.chunkKeys) {
      this.chunkKeys = await new Promise<string[]>((resolve, reject) => {
        const tx = this.db!.transaction([this.CHUNK_STORE], 'readonly');
        const req = tx.objectStore(this.CHUNK_STORE).getAllKeys();
        req.onsuccess = () => resolve((req.result as string[]) ?? []);
        req.onerror = () => reject(req.error);
      });
      // IndexedDB returns keys sorted, but don't depend on it
      this.chunkKeys.sort();
    }
    if (this.chunkKeys.length === 0) return undefined;

    // Greatest key <= word
    let lo = 0, hi = this.chunkKeys.length - 1, pos = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.chunkKeys[mid] <= word) { pos = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (pos === -1) return undefined; // word sorts before the first chunk

    const key = this.chunkKeys[pos];
    let chunk = this.chunksCache.get(key);
    if (!chunk) {
      chunk = await this.idbGet<WordlistChunk>(this.CHUNK_STORE, key);
      if (!chunk) return undefined;
      this.chunksCache.set(key, chunk);
    }
    return chunk.groups[word];
  }

  private lookupInExtras(word: string): Promise<WordlistEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([this.EXTRA_STORE], 'readonly');
      const req = tx.objectStore(this.EXTRA_STORE).index('wordform').getAll(IDBKeyRange.only(word));
      req.onsuccess = () => resolve((req.result as WordlistEntry[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Normalize tag format (convert dots to dashes for consistency with RFTagger)
   */
  private normalizeTag(tag: string): string {
    if (!tag) return '---------';
    // Convert dots to dashes (RFTagger: n.-.s.-.-.-.f.b.- → n--s-----f-b-)
    return tag.replace(/\./g, '-');
  }

  /**
   * Add single entry (Morpheus-analyzed unknown word). Goes to the extras
   * store — the chunk layout is immutable after the bulk load, and extras
   * only ever exist for words the wordlist file doesn't contain.
   */
  async addEntry(entry: WordlistEntry): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.EXTRA_STORE], 'readwrite');
      const store = transaction.objectStore(this.EXTRA_STORE);

      const request = store.put({
        seq: entry.seq ?? this.nextSeq++,
        wordform: entry.wordform.toLowerCase().trim(),
        tag: this.normalizeTag(entry.tag.trim()),
        macronized: entry.macronized,
        accentedUnderscore: entry.accentedUnderscore,
        lemma: entry.lemma.trim()
      });

      request.onsuccess = () => {
        this.entryCount++;
        // Invalidate the entries cache so a subsequent getAllEntries() for this
        // wordform (e.g. in getAccents, right after ensureAnalyzed → analyzeUnknownWords
        // → addEntry) re-reads from IndexedDB instead of returning the stale empty
        // result cached during the "missing words" check.
        this.entriesCache.delete(entry.wordform.toLowerCase().trim());
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /** Normalize a parsed file entry once, before grouping. */
  private normalizeEntry(entry: WordlistEntry): WordlistEntry {
    return {
      wordform: entry.wordform.toLowerCase().trim(),
      tag: this.normalizeTag(entry.tag.trim()),
      macronized: entry.macronized,
      accentedUnderscore: entry.accentedUnderscore,
      lemma: entry.lemma.trim()
    };
  }

  /** Group entries by wordform, preserving file order within each group —
   * the same order the old (wordform, seq) index cursor produced. */
  private buildGroups(entries: WordlistEntry[]): Map<string, WordlistEntry[]> {
    const groups = new Map<string, WordlistEntry[]>();
    for (const raw of entries) {
      const e = this.normalizeEntry(raw);
      let g = groups.get(e.wordform);
      if (!g) groups.set(e.wordform, (g = []));
      g.push(e);
    }
    return groups;
  }

  /**
   * Batch add entries (for file loading). Packs the wordlist into ~800
   * sorted range chunks instead of 812k individual rows — measured ~20x
   * faster to persist, and lookups become one direct get() per chunk.
   */
  async addEntries(entries: WordlistEntry[], onProgress?: (count: number) => void): Promise<void> {
    if (!this.db) await this.init();

    console.log('WordlistEngine: packing', entries.length, 'entries into chunks');
    const groups = this.memGroups ?? this.buildGroups(entries);
    const sortedWords = Array.from(groups.keys()).sort();

    // Pack sorted wordform groups into chunks of ~CHUNK_SIZE entries
    const chunks: WordlistChunk[] = [];
    let current: WordlistChunk | null = null;
    let currentCount = 0;
    for (const word of sortedWords) {
      const g = groups.get(word)!;
      if (!current || currentCount >= this.CHUNK_SIZE) {
        current = { firstWord: word, groups: {} };
        chunks.push(current);
        currentCount = 0;
      }
      current.groups[word] = g;
      currentCount += g.length;
    }

    // Write chunks in a few transactions, yielding between them so the page
    // stays responsive if this runs in the foreground
    const CHUNKS_PER_TX = 100;
    let written = 0;
    for (let i = 0; i < chunks.length; i += CHUNKS_PER_TX) {
      const batch = chunks.slice(i, i + CHUNKS_PER_TX);
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction([this.CHUNK_STORE], 'readwrite');
        const store = tx.objectStore(this.CHUNK_STORE);
        batch.forEach(c => store.put(c));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      written += batch.reduce((n, c) => n + Object.values(c.groups).reduce((m, g) => m + g.length, 0), 0);
      if (onProgress) onProgress(written);
      await new Promise(r => setTimeout(r, 0));
    }

    // Meta record last — its presence marks the load as complete, so a
    // half-finished persist (tab closed) reads as unpopulated next visit
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction([this.META_STORE], 'readwrite');
      tx.objectStore(this.META_STORE).put({
        key: 'meta',
        schemaVersion: this.SCHEMA_VERSION,
        dataVersion: this.DATA_VERSION,
        count: entries.length
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    this.entryCount = entries.length;
    if (this.nextSeq < entries.length) this.nextSeq = entries.length;
    this.chunkKeys = chunks.map(c => c.firstWord); // already sorted
    console.log('WordlistEngine: persisted', chunks.length, 'chunks,', entries.length, 'entries');
  }

  /**
   * Clear all stores
   */
  async clear(): Promise<void> {
    if (!this.db) await this.init();

    const stores = [this.CHUNK_STORE, this.EXTRA_STORE, this.META_STORE];
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(stores, 'readwrite');
      stores.forEach(s => transaction.objectStore(s).clear());
      transaction.oncomplete = () => {
        this.entryCount = 0;
        this.nextSeq = 0;
        this.loaded = false;
        this.chunkKeys = null;
        this.chunksCache.clear();
        this.memGroups = null;
        this.entriesCache.clear();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Convert macron marks to Unicode
   * ^ = breve (short vowel), _ = macron (long vowel)
   * a^ -> ă, a_ -> ā
   */
  private convertMacronMarks(text: string): string {
    return text
      .replace(/\^a/g, 'ă')
      .replace(/\^e/g, 'ĕ')
      .replace(/\^i/g, 'ĭ')
      .replace(/\^o/g, 'ŏ')
      .replace(/\^u/g, 'ŭ')
      .replace(/\^A/g, 'Ă')
      .replace(/\^E/g, 'Ĕ')
      .replace(/\^I/g, 'Ĭ')
      .replace(/\^O/g, 'Ŏ')
      .replace(/\^U/g, 'Ŭ')
      .replace(/a_/g, 'ā')
      .replace(/e_/g, 'ē')
      .replace(/i_/g, 'ī')
      .replace(/o_/g, 'ō')
      .replace(/u_/g, 'ū')
      .replace(/A_/g, 'Ā')
      .replace(/E_/g, 'Ē')
      .replace(/I_/g, 'Ī')
      .replace(/O_/g, 'Ō')
      .replace(/U_/g, 'Ū');
  }

  /**
   * Clean lemma string: remove #, 1, spaces→+, -, ^, _
   * Matches Python wordlist.clean_lemma()
   */
  private cleanLemma(lemma: string): string {
    return lemma
      .replace(/#/g, '')
      .replace(/1/g, '')
      .replace(/ /g, '+')
      .replace(/-/g, '')
      .replace(/\^/g, '')
      .replace(/_/g, '');
  }

  /**
   * Load from parsed macrons.txt data
   * Expected format: whitespace-separated (tab or space) columns:
   *   wordform  tag  lemma  accented
   * e.g. "a\te--------\ta\ta_"
   */
  async loadFromText(text: string, onProgress?: (count: number) => void): Promise<void> {
    // Guard against concurrent loads
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    this.loadingPromise = (async () => {
      const entries: WordlistEntry[] = [];
      const lines = text.split('\n');
      console.log('WordlistEngine: total lines in file:', lines.length);

      const YIELD_EVERY = 100_000; // keep the page responsive during parse
      let parsedCount = 0;
      for (let li = 0; li < lines.length; li++) {
        if (li > 0 && li % YIELD_EVERY === 0) {
          if (onProgress) onProgress(parsedCount);
          await new Promise(r => setTimeout(r, 0));
        }
        const trimmed = lines[li].trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Split on any whitespace (tabs/spaces) — matches Python's line.split()
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          const wordform = parts[0];
          const tag = parts[1];
          const lemma = parts[2];
          const rawMacronized = parts[3];  // underscore/caret notation
          const macronizedUnicode = this.convertMacronMarks(rawMacronized);
          entries.push({
            wordform,
            tag,
            lemma,
            accentedUnderscore: rawMacronized,
            macronized: macronizedUnicode
          });
          parsedCount++;
        }
      }
      console.log('WordlistEngine: parsed entries count:', parsedCount);

      // Serve lookups from memory immediately — the engine is usable as soon
      // as the parse is done. Chunk persistence runs in the background and
      // only matters for the NEXT visit.
      this.memGroups = this.buildGroups(entries);
      this.entryCount = entries.length;
      this.nextSeq = entries.length;
      if (onProgress) onProgress(entries.length);
      this.loaded = true;

      this.persistPromise = this.addEntries(entries)
        .then(() => {
          console.log('WordlistEngine: background persist complete');
        })
        .catch(err => {
          // Non-fatal: this session works from memory; next visit re-downloads
          console.warn('WordlistEngine: background persist failed:', err);
        });
    })();

    await this.loadingPromise;
    this.loadingPromise = null;
  }

  /** Await the background chunk persist (no-op if none is running). Lets
   * tests and shutdown paths ensure durability before closing the page. */
  async flush(): Promise<void> {
    if (this.persistPromise) await this.persistPromise;
  }

  /**
   * Load wordlist from URL (fetch + parse)
   */
  /**
   * Load wordlist from URL. A `.gz` URL is decompressed in the browser
   * (32MB of text ships as ~4MB); it falls back to the uncompressed file
   * if the .gz is missing or the browser cannot gunzip.
   */
  async loadFromUrl(url: string, onProgress?: (count: number) => void): Promise<void> {
    const fallbackUrl = url.endsWith('.gz') ? url.slice(0, -3) : undefined;
    const bytes = await fetchMaybeGzipped(url, fallbackUrl);
    const text = new TextDecoder('utf-8').decode(bytes);
    await this.loadFromText(text, onProgress);
  }

  /**
   * Check if loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Set Morpheus analyzer for unknown words
   */
  setMorpheusAnalyzer(analyzer: MorpheusAnalyzer): void {
    this.morpheusAnalyzer = analyzer;
  }

  /**
   * Get cached Morpheus analysis for a wordform (if available)
   */
  getMorpheusAnalysis(wordform: string): MorpheusAnalysis | undefined {
    return this.morpheusCache.get(wordform.toLowerCase().trim());
  }

  /**
   * Check if a word has Morpheus analysis cached
   */
  hasMorpheusAnalysis(wordform: string): boolean {
    return this.morpheusCache.has(wordform.toLowerCase().trim());
  }

  /**
   * Analyze unknown words using Morpheus and cache results
   * Ported from latin_macronizer/wordlist.py::crunchwords()
   * Produces multiple entries per word (different lemma+tag combinations)
   */
  async analyzeUnknownWords(words: string[]): Promise<WordlistEntry[]> {
    if (!this.morpheusAnalyzer || !this.morpheusAnalyzer.isInitialized()) {
      throw new Error('Morpheus analyzer not set or not initialized');
    }

    const results: WordlistEntry[] = [];
    const unknownWords: string[] = [];

    // Filter words not in wordlist (no entries with accentedUnderscore)
    for (const word of words) {
      const normalized = word.toLowerCase().trim();
      const entries = await this.getAllEntries(normalized);
      if (entries.length === 0) {
        unknownWords.push(word);
      }
    }

    if (unknownWords.length === 0) {
      return results;
    }

    // Analyze with Morpheus (batch)
    const analyses = this.morpheusAnalyzer.analyzeBatch(unknownWords);

    for (const analysis of analyses) {
      if (!analysis.success || analysis.analyses.length === 0) {
        continue;
      }

      // Cache the full Morpheus analysis for UI popup display
      this.morpheusCache.set(analysis.word.toLowerCase().trim(), analysis);

      // Group by (lemma, tag) to collect all accented forms for that parse
      const lemmaTagToAccented: Map<string, string[]> = new Map();

      for (const parse of analysis.analyses) {
        const lemma = this.cleanLemma(parse.lemma);
        const ldtTag = this.analysisToLdtTag(parse);
        const accentedRaw = parse.accented;  // Use extracted accented field (underscore notation)

        // Special case: trans verbs need _ after prefix (Python wordlist.py line 147-148)
        let accentedAdjusted = accentedRaw;
        if (lemma.startsWith('trans') && accentedRaw.length > 3 && accentedRaw[3] !== '_') {
          accentedAdjusted = accentedRaw.slice(0, 3) + '_' + accentedRaw.slice(3);
        }

        const key = `${lemma}|${ldtTag}`;
        const existing = lemmaTagToAccented.get(key) || [];
        existing.push(accentedAdjusted);
        lemmaTagToAccented.set(key, existing);
      }

      // For each (lemma, tag) group, select best accented form
      for (const [key, accenteds] of lemmaTagToAccented.entries()) {
        const [lemma, ldtTag] = key.split('|');
        // Python preference: forms with more 'v', 'j', 'J' (prefers volvit over voluit, Julius over Iulius)
        const bestAccented = accenteds.sort((a, b) => {
          const scoreA = (a.match(/[vjJ]/g) || []).length;
          const scoreB = (b.match(/[vjJ]/g) || []).length;
          return scoreA - scoreB;  // ascending, so highest score comes last
        }).pop()!;  // take highest

        const accentedUnderscore = unicodeToUnderscore(bestAccented);

        const entry: WordlistEntry = {
          wordform: analysis.word.toLowerCase(),
          tag: ldtTag,
          lemma,
          macronized: this.convertMacronMarks(bestAccented),
          accentedUnderscore
        };

        results.push(entry);
        await this.addEntry(entry);  // Cache in DB
      }
    }

    return results;
  }

  /**
   * Ensure all given wordforms have entries in the wordlist.
   * For missing words, analyzes with Morpheus and caches results.
   * Matches Python Wordlist.loadwords() behavior.
   */
  async ensureAnalyzed(wordForms: string[]): Promise<void> {
    // Deduplicate and normalize
    const uniqueForms = Array.from(new Set(
      wordForms.map(w => toAscii(w).toLowerCase().trim())
    ));

    // Check which are missing (no entries with accentedUnderscore)
    const missing: string[] = [];
    for (const word of uniqueForms) {
      const entries = await this.getAllEntries(word);
      if (entries.length === 0) {
        missing.push(word);
      }
    }

    if (missing.length === 0) {
      return;
    }

    // Analyze missing words with Morpheus (batch)
    await this.analyzeUnknownWords(missing);
  }

  /**
   * Convert a Morpheus analysis to an LDT 9-char tag
   * Ported from latin_macronizer/postags.py (parse_to_ldt)
   */
  private analysisToLdtTag(analysis: MorpheusAnalysis['analyses'][0]): string {
    const f = analysis.formInfo;
    let tag = '';

    // POS (position 0)
    const pos = f.partOfSpeech?.toLowerCase() || '';
    if (pos.includes('noun')) tag += 'n';
    else if (pos.includes('verb')) tag += 'v';
    else if (pos.includes('adj')) tag += 'a';
    else if (pos.includes('adv') || pos.includes('adverbial')) tag += 'd';
    else if (pos.includes('conj')) tag += 'c';
    else if (pos.includes('prep')) tag += 'r';
    else if (pos.includes('pron')) tag += 'p';
    else if (pos.includes('num')) tag += 'm';
    else if (pos.includes('interj')) tag += 'i';
    else if (pos.includes('excl')) tag += 'e';
    else if (pos.includes('punc')) tag += 'u';
    else tag += '-';

    // Person (position 1)
    const person = f.person?.toLowerCase() || '';
    if (person.includes('1')) tag += '1';
    else if (person.includes('2')) tag += '2';
    else if (person.includes('3')) tag += '3';
    else tag += '-';

    // Number (position 2)
    const number = f.number?.toLowerCase() || '';
    if (number.includes('sing')) tag += 's';
    else if (number.includes('plur')) tag += 'p';
    else tag += '-';

    // Tense (position 3)
    const tense = f.tense?.toLowerCase() || '';
    if (tense.includes('pres')) tag += 'p';
    else if (tense.includes('impf')) tag += 'i';
    else if (tense.includes('perf')) tag += 'r';
    else if (tense.includes('plup')) tag += 'l';
    else if (tense.includes('futperf')) tag += 't';
    else if (tense.includes('fut')) tag += 'f';
    else tag += '-';

    // Mood (position 4)
    const mood = f.mood?.toLowerCase() || '';
    if (mood.includes('ind')) tag += 'i';
    else if (mood.includes('subj')) tag += 's';
    else if (mood.includes('inf')) tag += 'n';
    else if (mood.includes('imperat')) tag += 'm';
    else if (mood.includes('part')) tag += 'p';
    else if (mood.includes('gerund')) tag += 'd';
    else if (mood.includes('gerundive')) tag += 'g';
    else if (mood.includes('supine')) tag += 'u';
    else tag += '-';

    // Voice (position 5)
    const voice = f.voice?.toLowerCase() || '';
    if (voice.includes('act')) tag += 'a';
    else if (voice.includes('pass')) tag += 'p';
    else tag += '-';

    // Gender (position 6)
    const gender = f.gender?.toLowerCase() || '';
    if (gender.includes('masc')) tag += 'm';
    else if (gender.includes('fem')) tag += 'f';
    else if (gender.includes('neut')) tag += 'n';
    else tag += '-';

    // Case (position 7)
    const case_ = f.case?.toLowerCase() || '';
    if (case_.includes('nom')) tag += 'n';
    else if (case_.includes('gen')) tag += 'g';
    else if (case_.includes('dat')) tag += 'd';
    else if (case_.includes('acc')) tag += 'a';
    else if (case_.includes('abl')) tag += 'b';
    else if (case_.includes('voc')) tag += 'v';
    else if (case_.includes('loc')) tag += 'l';
    else tag += '-';

    // Degree (position 8)
    const degree = f.degree?.toLowerCase() || '';
    if (degree.includes('comp')) tag += 'c';
    else if (degree.includes('superl')) tag += 's';
    else tag += '-';

    return tag;
  }
}
