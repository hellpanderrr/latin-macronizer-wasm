/**
 * MacronizerAPI.ts
 * Simple API wrapper for the Latin Macronizer (used by index.html)
 * Imports compiled TypeScript modules from dist/ and exposes a clean interface
 */
export declare class MacronizerAPI {
    private macronizer;
    private initialized;
    constructor();
    initialize(onProgress?: (percent: number, message: string) => void): Promise<void>;
    process(text: string, options?: any): Promise<any>;
    destroy(): void;
    isReady(): boolean;
    /**
     * Load wordlist (called from UI). If already loaded during initialize(), this is a no-op.
     * Otherwise, loads from the configured wordlistUrl.
     */
    loadWordlist(_mode: 'indexeddb' | 'memory', onProgress?: (progress: any) => void): Promise<void>;
    isWordlistLoaded(): boolean;
    getWordlistMode(): string;
    clearWordlistCache(): Promise<void>;
}
export default MacronizerAPI;
//# sourceMappingURL=MacronizerAPI.d.ts.map