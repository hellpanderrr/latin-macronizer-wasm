/**
 * WordlistEngine.ts
 * IndexedDB-based wordlist for accurate Latin macronization
 * Stores exact wordform + tag → macronized form mappings from macrons.txt
 * Integrates with Morpheus for unknown words
 */

import { MorpheusAnalyzer, MorpheusAnalysis } from './MorpheusAnalyzer';
import { unicodeToUnderscore } from '../utils/latin';

export interface WordlistEntry {
  wordform: string;
  tag: string;
  macronized: string;           // Unicode macronized form (for display)
  accentedUnderscore: string;   // Underscore-marked form (for DP alignment)
  lemma: string;
}

export class WordlistEngine {
  private db: IDBDatabase | null = null;
  private loaded: boolean = false;
  private entryCount: number = 0;
  private morpheusAnalyzer: MorpheusAnalyzer | null = null;
  private loadingPromise: Promise<void> | null = null;
  private readonly DB_NAME = 'MacronizerDB';
  private readonly DB_VERSION = 2;
  private readonly STORE_NAME = 'wordlist';

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
        // Migrate: delete existing store if present (to change key schema)
        if (db.objectStoreNames.contains(this.STORE_NAME)) {
          db.deleteObjectStore(this.STORE_NAME);
        }
        // Create object store with composite key [wordform, tag, lemma]
        const store = db.createObjectStore(this.STORE_NAME, {
          keyPath: ['wordform', 'tag', 'lemma']
        });
        
        // Create indexes for efficient lookup
        store.createIndex('wordform', 'wordform', { unique: false });
        store.createIndex('tag', 'tag', { unique: false });
        store.createIndex('lemma', 'lemma', { unique: false });
      };
    });
  }

  /**
   * Check if database is populated
   */
  async isPopulated(): Promise<boolean> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        this.entryCount = countRequest.result;
        resolve(this.entryCount > 0);
      };
      countRequest.onerror = () => reject(countRequest.error);
    });
  }

  /**
   * Get entry count
   */
  size(): number {
    return this.entryCount;
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
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('wordform');
      const range = IDBKeyRange.only(normalizedWord);
      const request = index.openCursor(range);

      const entries: WordlistEntry[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const entry = cursor.value;
          // Only include entries that have accentedUnderscore (i.e., from file)
          if (entry.accentedUnderscore) {
            entries.push(entry);
          }
          cursor.continue();
        } else {
          resolve(entries);
        }
      };
      request.onerror = () => reject(request.error);
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
   * Add single entry to wordlist
   */
  async addEntry(entry: WordlistEntry): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const request = store.put({
        wordform: entry.wordform.toLowerCase().trim(),
        tag: this.normalizeTag(entry.tag.trim()),
        macronized: entry.macronized,
        accentedUnderscore: entry.accentedUnderscore,
        lemma: entry.lemma.trim()
      });

      request.onsuccess = () => {
        this.entryCount++;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Batch add entries (for file loading)
   */
  async addEntries(entries: WordlistEntry[], onProgress?: (count: number) => void): Promise<void> {
    if (!this.db) await this.init();

    const BATCH_SIZE = 1000;
    let processed = 0;

    console.log('WordlistEngine: starting addEntries, total entries:', entries.length);
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);

        batch.forEach(entry => {
          store.put({
            wordform: entry.wordform.toLowerCase().trim(),
            tag: this.normalizeTag(entry.tag.trim()),
            macronized: entry.macronized,
            accentedUnderscore: entry.accentedUnderscore,
            lemma: entry.lemma.trim()
          });
        });

        transaction.oncomplete = () => {
          processed += batch.length;
          if (onProgress) onProgress(processed);
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      });
    }

    this.entryCount = processed;
    console.log('WordlistEngine: finished addEntries, total processed:', processed);
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        this.entryCount = 0;
        resolve();
      };
      request.onerror = () => reject(request.error);
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

      let parsedCount = 0;
      for (const line of lines) {
        const trimmed = line.trim();
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

      await this.addEntries(entries, onProgress);
      this.loaded = true;
    })();

    await this.loadingPromise;
    this.loadingPromise = null;
  }

  /**
   * Load wordlist from URL (fetch + parse)
   */
  async loadFromUrl(url: string, onProgress?: (count: number) => void): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load wordlist: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
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
   * Lookup word in wordlist, fallback to Morpheus analysis if not found
   */
  async lookupOrAnalyze(wordform: string, tag: string): Promise<string | null> {
    // First try wordlist
    const result = await this.lookup(wordform, tag);
    if (result) {
      return result;
    }

    // If not found and Morpheus is available, analyze
    if (this.morpheusAnalyzer && this.morpheusAnalyzer.isInitialized()) {
      const analysis = this.morpheusAnalyzer.analyze(wordform);
      if (analysis.success && analysis.analyses.length > 0) {
        // Find analysis matching the tag, or use first
        const matchingAnalysis = this.findMatchingAnalysis(analysis, tag);
        if (matchingAnalysis) {
          // Convert macron marks from Morpheus output
          const macronized = this.convertMacronMarks(matchingAnalysis.raw);
          
          // Cache result in wordlist for future lookups
          await this.addEntry({
            wordform: wordform.toLowerCase().trim(),
            tag: this.normalizeTag(tag),
            lemma: matchingAnalysis.lemma,
            macronized,
            accentedUnderscore: unicodeToUnderscore(macronized) // approximate
          });
          
          return macronized;
        }
      }
    }

    return null;
  }

  /**
   * Analyze unknown words using Morpheus and cache results
   */
  async analyzeUnknownWords(words: string[]): Promise<WordlistEntry[]> {
    if (!this.morpheusAnalyzer || !this.morpheusAnalyzer.isInitialized()) {
      throw new Error('Morpheus analyzer not set or not initialized');
    }

    const results: WordlistEntry[] = [];
    const unknownWords: string[] = [];

    // Filter words not in wordlist
    for (const word of words) {
      const normalized = word.toLowerCase().trim();
      const exists = await this.wordExists(normalized);
      if (!exists) {
        unknownWords.push(word);
      }
    }

    if (unknownWords.length === 0) {
      return results;
    }

    // Analyze with Morpheus
    const analyses = this.morpheusAnalyzer.analyzeBatch(unknownWords);

        // Convert analyses to wordlist entries
        for (const analysis of analyses) {
          if (analysis.success && analysis.analyses.length > 0) {
            // Use first analysis as primary
            const primary = analysis.analyses[0];
            const macronized = this.convertMacronMarks(primary.raw);
            const entry: WordlistEntry = {
              wordform: analysis.word.toLowerCase(),
              tag: '---------', // Morpheus doesn't provide RFTagger format tags
              lemma: primary.lemma,
              macronized,
              accentedUnderscore: unicodeToUnderscore(macronized) // approximate
            };

        results.push(entry);
        
        // Cache in wordlist
        await this.addEntry(entry);
      }
    }

    return results;
  }

  /**
   * Check if word exists in wordlist
   */
  private async wordExists(wordform: string): Promise<boolean> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('wordform');
      const range = IDBKeyRange.only(wordform.toLowerCase());
      const request = index.openCursor(range);
      
      request.onsuccess = () => {
        resolve(request.result !== null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Find analysis matching the given tag
   */
  private findMatchingAnalysis(
    analysis: MorpheusAnalysis, 
    tag: string
  ): MorpheusAnalysis['analyses'][0] | null {
    if (analysis.analyses.length === 0) {
      return null;
    }

    // If only one analysis, return it
    if (analysis.analyses.length === 1) {
      return analysis.analyses[0];
    }

    // TODO: Implement proper tag matching logic
    // For now, return first analysis
    return analysis.analyses[0];
  }
}
