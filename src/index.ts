/**
 * Latin Macronizer - Browser Edition
 * Main entry point for the library
 * 
 * Based on the original Python latin_macronizer by Johan Winge
 * Ported to TypeScript for browser use with WebAssembly
 */

// Core exports
export {
  Macronizer,
  Token,
  Tokenization,
  Tokenizer
} from './core/index.js';

// Analysis engines
export {
  WasmTagger,
  WasmTaggerOptions,
  TagResult,
  LemmaEngine,
  EndingPatternEngine,
  EndingPattern,
  EditDistanceEngine,
  EditResult,
  FallbackTagger,
  MorpheusAnalyzer
  // Note: MorpheusAnalysis and MorpheusOptions are types exported from './analysis'
} from './analysis/index.js';

// Public API
import { MacronizerAPI } from './api/MacronizerAPI.js';
export { MacronizerAPI };

// Types
export type {
  POSTag,
  WordEntry,
  LemmaEntry as LemmaEntryType,
  MacronizerOptions,
  MacronizerResult,
  EvaluationResult,
  WasmTagger as WasmTaggerInterface,
  ScanOption,
  MeterState,
  VowelLength,
  ScansionResult
  // Note: MorpheusAnalysis and MorpheusOptions are exported from './analysis' as both values and types
} from './types/index.js';

// Utilities
export {
  toAscii,
  toUiOrthography,
  fromUiOrthography,
  isVowel,
  isConsonant,
  startsWithVowel,
  startsWithShortJPrefix,
  normalizeWord,
  splitSentences,
  isSentenceEnder,
  isPunctuation,
  isWhitespace,
  splitEnclitic,
  findVowelClusters,
  isAmbiguousVowel,
  escapeHtml,
  enclitics,
  prefixesWithShortJ
} from './utils/latin.js';

// Version
export const VERSION = '1.0.0';
export const AUTHOR = 'Johan Winge';
export const LICENSE = 'MIT';
