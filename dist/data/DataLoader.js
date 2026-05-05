/**
 * Data loader for browser-based Latin Macronizer
 * Manages loading JSON data files and caching
 */
class DataLoader {
    constructor(basePath = './src/data/') {
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "basePath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.basePath = basePath;
    }
    /**
     * Load all required data files
     */
    async loadAll() {
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
    async loadLemmas() {
        const cacheKey = 'lemmas';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        try {
            const response = await fetch(`${this.basePath}lemmas.json`);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const lemmas = new Map(data.map(item => [item.lemma, item.frequency]));
            this.cache.set(cacheKey, lemmas);
            console.log(`[DataLoader] Loaded ${lemmas.size} lemmas`);
            return lemmas;
        }
        catch (err) {
            console.error('[DataLoader] Failed to load lemmas:', err);
            return new Map();
        }
    }
    /**
     * Load macronized endings from JSON
     */
    async loadEndings() {
        const cacheKey = 'endings';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        try {
            const response = await fetch(`${this.basePath}endings.json`);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const endings = new Map(Object.entries(data));
            this.cache.set(cacheKey, endings);
            console.log(`[DataLoader] Loaded ${endings.size} ending patterns`);
            return endings;
        }
        catch (err) {
            console.error('[DataLoader] Failed to load endings:', err);
            return new Map();
        }
    }
    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}
// Singleton instance
export const dataLoader = new DataLoader();
export default dataLoader;
export { DataLoader };
//# sourceMappingURL=DataLoader.js.map