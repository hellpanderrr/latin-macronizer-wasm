/**
 * Analysis module exports for the Latin Macronizer
 */
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
export declare class FallbackTagger {
    private endingEngine;
    constructor();
    /**
     * Tag tokens using fallback rules
     */
    tag(tokens: string[]): TagResult[];
}
interface TagResult {
    tag: string;
    confidence: number;
}
//# sourceMappingURL=index.d.ts.map