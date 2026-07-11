/**
 * LemmaEngine.ts
 * Lemma dictionary lookup for Latin macronization
 * Compressed dictionary of known lemmas with macronized forms
 */
export class LemmaEngine {
    constructor() {
        Object.defineProperty(this, "lemmaMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "reverseMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "loaded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.lemmaMap = new Map();
        this.reverseMap = new Map();
        this.loaded = false;
    }
    /**
     * Load lemma dictionary from JSON data
     */
    async load(data) {
        if (this.loaded)
            return;
        // Initialize with common lemmas first
        this.initializeCommonLemmas();
        // Load from JSON if no data provided
        if (!data) {
            try {
                // Try multiple paths: relative to module (dist/data/), then absolute /data/, then /src/data/
                const paths = [
                    new URL('../data/lemmas.json', import.meta.url).href,
                    '/data/lemmas.json',
                    '/src/data/lemmas.json'
                ];
                let lemmaData = null;
                for (const path of paths) {
                    try {
                        const response = await fetch(path);
                        if (response.ok) {
                            lemmaData = await response.json();
                            console.log(`[LemmaEngine] Loaded lemmas from ${path}`);
                            break;
                        }
                    }
                    catch (e) {
                        // Try next path
                    }
                }
                if (lemmaData) {
                    // Load all lemmas (no artificial limit)
                    for (const item of lemmaData) {
                        this.lemmaMap.set(item.lemma, {
                            lemma: item.lemma,
                            macronized: item.lemma,
                            frequency: item.frequency,
                            tags: []
                        });
                    }
                    console.log(`[LemmaEngine] Loaded ${this.lemmaMap.size} lemmas from JSON`);
                }
                else {
                    console.warn('[LemmaEngine] Could not load lemmas JSON from any path, using hardcoded only');
                }
            }
            catch (err) {
                console.warn('[LemmaEngine] Failed to load JSON, using hardcoded:', err);
            }
        }
        else {
            this.loadFromData(data);
        }
        this.loaded = true;
    }
    /**
     * Initialize with most common Latin lemmas
     */
    initializeCommonLemmas() {
        const commonLemmas = [
            // Sum conjugation
            { lemma: 'sum', macronized: 'sum', frequency: 1000, tags: ['v1sp'] },
            { lemma: 'esse', macronized: 'esse', frequency: 1000, tags: ['v2sp', 'v3sp'] },
            { lemma: 'fui', macronized: 'fui', frequency: 800, tags: ['v1si'] },
            { lemma: 'esse', macronized: 'esse', frequency: 900, tags: ['v2si', 'v3si'] },
            { lemma: 'fuisse', macronized: 'fuisse', frequency: 600, tags: ['v4sp'] },
            { lemma: 'futurus', macronized: 'futurus', frequency: 500, tags: ['v--p--m-'] },
            // Common nouns
            { lemma: 'puer', macronized: 'puer', frequency: 500, tags: ['n-s--m-'] },
            { lemma: 'puella', macronized: 'puella', frequency: 400, tags: ['n-s--f-'] },
            { lemma: 'bellum', macronized: 'bellum', frequency: 300, tags: ['n-s--n-'] },
            { lemma: 'vir', macronized: 'vir', frequency: 450, tags: ['n-s--m-'] },
            { lemma: 'femina', macronized: 'femina', frequency: 350, tags: ['n-s--f-'] },
            { lemma: 'civis', macronized: 'civis', frequency: 300, tags: ['n-s--m-', 'n-s--f-'] },
            // Common adjectives
            { lemma: 'bonus', macronized: 'bonus', frequency: 600, tags: ['a--s--m-'] },
            { lemma: 'magnus', macronized: 'magnus', frequency: 400, tags: ['a--s--m-'] },
            { lemma: 'bonus', macronized: 'bona', frequency: 600, tags: ['a--s--f-'] },
            { lemma: 'magnus', macronized: 'magna', frequency: 400, tags: ['a--s--f-'] },
            // Common verbs
            { lemma: 'amare', macronized: 'amare', frequency: 700, tags: ['v1sp'] },
            { lemma: 'videre', macronized: 'vidēre', frequency: 500, tags: ['v2sp'] },
            { lemma: 'audire', macronized: 'audīre', frequency: 400, tags: ['v4sp'] },
            { lemma: 'ducere', macronized: 'ducere', frequency: 350, tags: ['v3sp'] },
            { lemma: 'facere', macronized: 'facere', frequency: 300, tags: ['v3sp'] },
            // Common prepositions
            { lemma: 'in', macronized: 'in', frequency: 900, tags: ['e------'] },
            { lemma: 'ad', macronized: 'ad', frequency: 800, tags: ['e------'] },
            { lemma: 'cum', macronized: 'cum', frequency: 700, tags: ['e------'] },
            { lemma: 'ex', macronized: 'ex', frequency: 600, tags: ['e------'] },
            { lemma: 'de', macronized: 'de', frequency: 550, tags: ['e------'] },
            { lemma: 'ab', macronized: 'ab', frequency: 500, tags: ['e------'] },
            // Common conjunctions
            { lemma: 'et', macronized: 'et', frequency: 1000, tags: ['c------'] },
            { lemma: 'sed', macronized: 'sed', frequency: 600, tags: ['c------'] },
            { lemma: 'autem', macronized: 'autem', frequency: 400, tags: ['c------'] },
            { lemma: 'enim', macronized: 'enim', frequency: 350, tags: ['c------'] },
            // Common pronouns
            { lemma: 'ego', macronized: 'ego', frequency: 500, tags: ['p--s--n-'] },
            { lemma: 'tu', macronized: 'tu', frequency: 450, tags: ['p--s--n-'] },
            { lemma: 'nos', macronized: 'nos', frequency: 300, tags: ['p--p--n-'] },
            { lemma: 'vos', macronized: 'vos', frequency: 250, tags: ['p--p--n-'] },
            { lemma: 'is', macronized: 'is', frequency: 400, tags: ['p--s--m-'] },
            { lemma: 'ea', macronized: 'ea', frequency: 350, tags: ['p--s--f-'] },
            { lemma: 'id', macronized: 'id', frequency: 300, tags: ['p--s--n-'] },
            // Common adverbs
            { lemma: 'bene', macronized: 'bene', frequency: 300, tags: ['d------'] },
            { lemma: 'male', macronized: 'male', frequency: 200, tags: ['d------'] },
            { lemma: 'magnopere', macronized: 'magnopere', frequency: 150, tags: ['d------'] },
        ];
        commonLemmas.forEach(entry => {
            this.addLemma(entry);
        });
    }
    /**
     * Add a lemma to the dictionary
     */
    addLemma(entry) {
        const key = this.normalizeKey(entry.lemma, entry.tags[0]);
        this.lemmaMap.set(key, entry);
        // Build reverse lookup
        const macKey = entry.macronized.toLowerCase();
        if (!this.reverseMap.has(macKey)) {
            this.reverseMap.set(macKey, []);
        }
        this.reverseMap.get(macKey).push(key);
    }
    /**
     * Load lemmas from JSON data
     */
    loadFromData(data) {
        if (Array.isArray(data)) {
            data.forEach((entry) => {
                this.addLemma({
                    lemma: entry.lemma,
                    macronized: entry.macronized,
                    frequency: entry.frequency || 1,
                    tags: entry.tags || [],
                });
            });
        }
    }
    /**
     * Look up a lemma
     */
    lookup(word, tag) {
        const key = this.normalizeKey(word, tag);
        // Direct lookup
        if (this.lemmaMap.has(key)) {
            return this.lemmaMap.get(key);
        }
        // Try without tag
        const keyNoTag = this.normalizeKey(word, '');
        if (this.lemmaMap.has(keyNoTag)) {
            return this.lemmaMap.get(keyNoTag);
        }
        // Try lowercase
        const keyLower = this.normalizeKey(word.toLowerCase(), tag);
        if (this.lemmaMap.has(keyLower)) {
            return this.lemmaMap.get(keyLower);
        }
        return null;
    }
    /**
     * Check if a lemma exists
     */
    hasLemma(word, tag) {
        return this.lookup(word, tag) !== null;
    }
    /**
     * Get all lemmas for a macronized form
     */
    getLemmasByMacronized(macronized) {
        const key = macronized.toLowerCase();
        const lemmaKeys = this.reverseMap.get(key) || [];
        return lemmaKeys.map(k => this.lemmaMap.get(k))
            .filter((entry) => entry !== undefined);
    }
    /**
     * Get frequency for a lemma by direct name lookup (not keyed by tag).
     * Matches Python's lemma_frequency dict.
     */
    getFrequency(lemma) {
        // Try exact match first
        const key = this.normalizeKey(lemma, '');
        if (this.lemmaMap.has(key)) {
            return this.lemmaMap.get(key).frequency;
        }
        // Try lowercase
        const keyLower = this.normalizeKey(lemma.toLowerCase(), '');
        if (this.lemmaMap.has(keyLower)) {
            return this.lemmaMap.get(keyLower).frequency;
        }
        return 0;
    }
    /**
     * Get dictionary size
     */
    size() {
        return this.lemmaMap.size;
    }
    /**
     * Normalize key for lookup
     */
    normalizeKey(word, tag) {
        const normalized = word.toLowerCase().trim();
        return tag ? `${normalized}|${tag}` : normalized;
    }
    /**
     * Check if loaded
     */
    isLoaded() {
        return this.loaded;
    }
}
//# sourceMappingURL=LemmaEngine.js.map