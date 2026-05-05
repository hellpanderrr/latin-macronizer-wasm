/**
 * MacronizerAPI.ts
 * Public API for the Latin Macronizer
 * Provides a clean interface for browser-based Latin text processing
 */

import { Macronizer } from '../core/Macronizer.js';
import { Token } from '../core/Token.js';
import { Tokenizer } from '../core/Tokenizer.js';

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
export class MacronizerAPI {
  private static instance: MacronizerAPI;
  private macronizer: Macronizer | null;
  private config: MacronizerConfig;
  private initialized: boolean;

  private constructor(config: MacronizerConfig = {}) {
    this.config = {
      useWasm: config.useWasm ?? true,
      wasmModelPath: config.wasmModelPath,
      confidenceThreshold: config.confidenceThreshold ?? 0.80,
      enableCache: config.enableCache ?? true,
    };
    this.macronizer = null;
    this.initialized = false;
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: MacronizerConfig): MacronizerAPI {
    if (!MacronizerAPI.instance) {
      MacronizerAPI.instance = new MacronizerAPI(config);
    }
    return MacronizerAPI.instance;
  }

  /**
   * Initialize the macronizer
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.initialized && this.macronizer) {
        return true;
      }

      this.macronizer = new Macronizer({
        useWasm: this.config.useWasm,
        wasmModelPath: this.config.wasmModelPath,
        confidenceThreshold: this.config.confidenceThreshold,
        enableCache: this.config.enableCache,
      });

      await this.macronizer.initialize();
      this.initialized = true;
      
      console.log('Latin Macronizer initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Latin Macronizer:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Process Latin text and add macrons
   */
  async process(text: string): Promise<ProcessResult> {
    if (!this.initialized || !this.macronizer) {
      return {
        success: false,
        error: 'Macronizer not initialized. Call initialize() first.',
      };
    }

    try {
      const result = await this.macronizer.macronize(text);
      
      // Check confidence threshold
      if (result.confidence < this.config.confidenceThreshold!) {
        console.warn(
          `Low confidence (${result.confidence.toFixed(2)}) for text: ${text}`
        );
      }

      return {
        success: true,
        macronizedText: result.macronized,
        originalText: result.original,
        tokens: result.taggedTokens,
        confidence: result.confidence,
        processingTime: result.processingTime,
      };
    } catch (error) {
      console.error('Error processing text:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Batch process multiple texts
   */
  async processBatch(texts: string[]): Promise<ProcessResult[]> {
    if (!this.initialized || !this.macronizer) {
      return texts.map(() => ({
        success: false,
        error: 'Macronizer not initialized',
      }));
    }

    const results: ProcessResult[] = [];
    
    for (const text of texts) {
      const result = await this.process(text);
      results.push(result);
    }

    return results;
  }

  /**
   * Tokenize text without macronization
   */
  tokenize(text: string): Token[] {
    const tokenizer = new Tokenizer();
    return tokenizer.tokenize(text);
  }

  /**
   * Check if macronizer is ready
   */
  isReady(): boolean {
    return this.initialized && this.macronizer !== null && this.macronizer.isReady();
  }

  /**
   * Get current configuration
   */
  getConfig(): MacronizerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MacronizerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    if (this.macronizer) {
      this.macronizer.clearCache();
    }
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.macronizer ? this.macronizer.getCacheSize() : 0;
  }

  /**
   * Destroy resources
   */
  destroy(): void {
    if (this.macronizer) {
      this.macronizer.destroy();
    }
    this.macronizer = null;
    this.initialized = false;
  }

  /**
   * Reset to factory defaults
   */
  reset(): void {
    this.destroy();
    this.config = {
      useWasm: true,
      confidenceThreshold: 0.80,
      enableCache: true,
    };
  }
}

/**
 * Convenience function for one-off processing
 */
export async function macronize(text: string, config?: MacronizerConfig): Promise<ProcessResult> {
  const api = MacronizerAPI.getInstance(config);
  
  if (!api.isReady()) {
    await api.initialize();
  }
  
  return api.process(text);
}

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

// Expose to global scope in browser
if (typeof window !== 'undefined') {
  window.LatinMacronizer = {
    API: MacronizerAPI,
    macronize,
    version: '1.0.0',
  };
}
