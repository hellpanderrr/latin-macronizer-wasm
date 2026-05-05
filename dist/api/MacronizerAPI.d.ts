/**
 * MacronizerAPI.ts
 * Public API for the Latin Macronizer
 * Provides a clean interface for browser-based Latin text processing
 */
import { Token } from '../core/Token.js';
export interface MacronizerConfig {
    useWasm?: boolean;
    wasmModelPath?: string;
    confidenceThreshold?: number;
    enableCache?: boolean;
}
export interface ProcessResult {
    success: boolean;
    macronizedText?: string;
    originalText?: string;
    tokens?: Token[];
    confidence?: number;
    processingTime?: number;
    error?: string;
}
/**
 * Public API for the Latin Macronizer
 * Singleton pattern for easy browser integration
 */
export declare class MacronizerAPI {
    private static instance;
    private macronizer;
    private config;
    private initialized;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(config?: MacronizerConfig): MacronizerAPI;
    /**
     * Initialize the macronizer
     */
    initialize(): Promise<boolean>;
    /**
     * Process Latin text and add macrons
     */
    process(text: string): Promise<ProcessResult>;
    /**
     * Batch process multiple texts
     */
    processBatch(texts: string[]): Promise<ProcessResult[]>;
    /**
     * Tokenize text without macronization
     */
    tokenize(text: string): Token[];
    /**
     * Check if macronizer is ready
     */
    isReady(): boolean;
    /**
     * Get current configuration
     */
    getConfig(): MacronizerConfig;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<MacronizerConfig>): void;
    /**
     * Clear cache
     */
    clearCache(): void;
    /**
     * Get cache size
     */
    getCacheSize(): number;
    /**
     * Destroy resources
     */
    destroy(): void;
    /**
     * Reset to factory defaults
     */
    reset(): void;
}
/**
 * Convenience function for one-off processing
 */
export declare function macronize(text: string, config?: MacronizerConfig): Promise<ProcessResult>;
/**
 * Global interface for browser usage
 */
declare global {
    interface Window {
        LatinMacronizer: {
            API: typeof MacronizerAPI;
            macronize: typeof macronize;
            version: string;
        };
    }
}
//# sourceMappingURL=MacronizerAPI.d.ts.map