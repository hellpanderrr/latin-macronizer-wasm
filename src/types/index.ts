/**
 * Core types for the Latin Macronizer — public API surface
 * Kept in sync with the real implementation classes.
 */

// Scan options: which meters to use (matches Python exactly)
export type ScanOption =
  | 'prose'
  | 'dactylichexameter'
  | 'elegiacdistichs'
  | 'hendecasyllable'
  | 'iambic';
