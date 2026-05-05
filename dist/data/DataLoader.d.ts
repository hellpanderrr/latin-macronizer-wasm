/**
 * Data loader for browser-based Latin Macronizer
 * Manages loading JSON data files and caching
 */
export interface LoadedData {
    lemmas: Map<string, number>;
    endings: Map<string, string[]>;
    loaded: boolean;
}
declare class DataLoader {
    private cache;
    private basePath;
    constructor(basePath?: string);
    /**
     * Load all required data files
     */
    loadAll(): Promise<LoadedData>;
    /**
     * Load lemmas from JSON
     */
    private loadLemmas;
    /**
     * Load macronized endings from JSON
     */
    private loadEndings;
    /**
     * Clear cache
     */
    clearCache(): void;
}
export declare const dataLoader: DataLoader;
export default dataLoader;
export { DataLoader };
//# sourceMappingURL=DataLoader.d.ts.map