/**
 * Analysis module exports for the Latin Macronizer
 */
import { EndingPatternEngine } from './EndingPatternEngine.js';
export { WasmTagger } from './WasmTagger.js';
export { LemmaEngine } from './LemmaEngine.js';
export { EndingPatternEngine } from './EndingPatternEngine.js';
export { EditDistanceEngine } from './EditDistanceEngine.js';
export { MorpheusAnalyzer } from './MorpheusAnalyzer.js';
/**
 * Fallback tagger for when WASM is not available
 * Uses simple morphological rules
 */
export class FallbackTagger {
    constructor() {
        Object.defineProperty(this, "endingEngine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.endingEngine = new EndingPatternEngine();
    }
    /**
     * Tag tokens using fallback rules
     */
    tag(tokens) {
        return tokens.map(token => ({
            tag: this.endingEngine.inferTag(token) || 'n.-.-.-.-.-.-.-.-',
            confidence: 0.5,
        }));
    }
}
//# sourceMappingURL=index.js.map