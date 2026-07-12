/**
 * Analysis module exports for the Latin Macronizer
 */

import { EndingPatternEngine } from './EndingPatternEngine.js';

export { WasmTagger, WasmTaggerOptions, TagResult } from './WasmTagger.js';
export { LemmaEngine } from './LemmaEngine.js';
export { EndingPatternEngine, EndingPattern } from './EndingPatternEngine.js';
export { EditDistanceEngine, EditResult } from './EditDistanceEngine.js';
export { MorpheusAnalyzer } from './MorpheusAnalyzer.js';
export type { MorpheusAnalysis, MorpheusOptions } from './MorpheusAnalyzer.js';

/**
 * Fallback tagger for when WASM is not available
 * Uses simple morphological rules
 */
export class FallbackTagger {
  private endingEngine: EndingPatternEngine;
  
  constructor() {
    this.endingEngine = new EndingPatternEngine();
  }
  
  /**
   * Tag tokens using fallback rules
   */
  tag(tokens: string[]): TagResult[] {
    return tokens.map(token => ({
      tag: this.endingEngine.inferTag(token) || 'n.-.-.-.-.-.-.-.-',
      confidence: 0.5,
    }));
  }
}

interface TagResult {
  tag: string;
  confidence: number;
}
