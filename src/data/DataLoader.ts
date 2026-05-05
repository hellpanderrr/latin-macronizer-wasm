/**
 * Data loader for browser-based Latin Macronizer
 * Manages loading JSON data files and caching
 */

import type { LemmaEntry } from '../types';

export interface LoadedData {
  lemmas: Map<string, number>;  // lemma -> frequency
  endings: Map<string, string[]>; // tag -> endings
  loaded: boolean;
}

class DataLoader {
  private cache: Map<string, any> = new Map();
  private basePath: string;

  constructor(basePath: string = './src/data/') {
    this.basePath = basePath;
  }

  /**
   * Load all required data files
   */
  async loadAll(): Promise<LoadedData> {
    const [lemmas, endings] = await Promise.all([
      this.loadLemmas(),
      this.loadEndings()
    ]);

    return {
      lemmas,
      endings,
      loaded: true
    };
  }

  /**
   * Load lemmas from JSON
   */
  private async loadLemmas(): Promise<Map<string, number>> {
    const cacheKey = 'lemmas';
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`${this.basePath}lemmas.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data: Array<{lemma: string, frequency: number}> = await response.json();
      const lemmas = new Map(data.map(item => [item.lemma, item.frequency]));
      
      this.cache.set(cacheKey, lemmas);
      console.log(`[DataLoader] Loaded ${lemmas.size} lemmas`);
      return lemmas;
    } catch (err) {
      console.error('[DataLoader] Failed to load lemmas:', err);
      return new Map();
    }
  }

  /**
   * Load macronized endings from JSON
   */
  private async loadEndings(): Promise<Map<string, string[]>> {
    const cacheKey = 'endings';
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`${this.basePath}endings.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data: Record<string, string[]> = await response.json();
      const endings = new Map(Object.entries(data));
      
      this.cache.set(cacheKey, endings);
      console.log(`[DataLoader] Loaded ${endings.size} ending patterns`);
      return endings;
    } catch (err) {
      console.error('[DataLoader] Failed to load endings:', err);
      return new Map();
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
export const dataLoader = new DataLoader();
export default dataLoader;
export { DataLoader };
