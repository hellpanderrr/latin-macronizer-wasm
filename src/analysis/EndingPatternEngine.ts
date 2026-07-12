/**
 * EndingPatternEngine.ts
 * Pattern-based vowel length determination for Latin macronization
 * Uses suffix patterns and morphological rules
 */

export interface EndingPattern {
  suffix: string;
  replacement: string;
  posTags?: string[];
  priority?: number;
}

export class EndingPatternEngine {
  private patterns: EndingPattern[];
  private suffixTree: Map<string, EndingPattern[]>;
  private loaded: boolean;
  /** Raw Python tag_to_endings: exact 9-char LDT tag → ORDERED accented endings
   *  (underscore/caret notation), straight from endings.json. */
  private rawEndings: Map<string, string[]>;

  constructor() {
    this.patterns = [];
    this.suffixTree = new Map();
    this.loaded = false;
    this.rawEndings = new Map();
  }

  /**
   * Python: tag_to_endings.get(tag, []) — exact-tag lookup, list order preserved.
   */
  getEndingsForTag(tag: string): string[] {
    return this.rawEndings.get(tag) ?? [];
  }

  /**
   * Load ending patterns
   */
  async load(data?: any): Promise<void> {
    if (this.loaded) return;

    this.initializeCommonPatterns();
    
    if (data) {
      this.loadFromData(data);
    } else {
      // Try to load ending patterns from JSON
      const paths = [
        new URL('../data/endings.json', import.meta.url).href,
        '/data/endings.json',
        '/src/data/endings.json'
      ];
      let patternData: any[] | null = null;
      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            // JSON is Python's tag_to_endings: { "n-s---fn-": ["a_tio_", ...], ... }
            const json = await response.json();
            patternData = [];
            for (const [tag, endings] of Object.entries(json)) {
              // Keep the raw ordered list for exact-tag lookups (Python semantics)
              this.rawEndings.set(tag, endings as string[]);
              for (const pattern of (endings as any[])) {
                patternData.push({
                  ...pattern,
                  posTags: pattern.posTags || [tag] // include tag as posTags if not specified
                });
              }
            }
            console.log(`[EndingPatternEngine] Loaded ${this.rawEndings.size} tag ending lists from ${path}`);
            break;
          }
        } catch (e) {
          // Try next path
        }
      }
      if (patternData) {
        this.loadFromData(patternData);
      } else {
        console.warn('[EndingPatternEngine] Could not load endings JSON from any path, using hardcoded patterns only');
      }
    }

    this.buildSuffixTree();
    this.loaded = true;
  }

  /**
   * Initialize common Latin ending patterns
   */
  private initializeCommonPatterns(): void {
    const patterns: EndingPattern[] = [
      // First declension nominative singular -a → ā
      { suffix: 'a', replacement: 'ā', posTags: ['n-s--f-', 'a--s--f-'], priority: 10 },
      
      // First declension genitive singular -ae → āe
      { suffix: 'ae', replacement: 'āe', posTags: ['n-s--f-', 'a--s--f-'], priority: 10 },
      
      // First declension dative/ablative singular -ā → ā (already long)
      { suffix: 'ā', replacement: 'ā', posTags: ['n-s--f-', 'a--s--f-'], priority: 10 },
      
      // Second declension nominative singular -us → -us (usually short, but check)
      { suffix: 'us', replacement: 'us', posTags: ['n-s--m-', 'a--s--m-'], priority: 5 },
      
      // Second declension genitive singular -ī → -ī (long)
      { suffix: 'ī', replacement: 'ī', posTags: ['n-s--m-', 'n-s--n-', 'a--s--m-', 'a--s--n-'], priority: 10 },
      
      // Second declension accusative singular -um → -um (short)
      { suffix: 'um', replacement: 'um', posTags: ['n-s--n-', 'a--s--n-'], priority: 5 },
      
      // Second declension accusative singular -ō → -ō (long in some cases)
      { suffix: 'ō', replacement: 'ō', posTags: ['n-s--m-'], priority: 8 },
      
      // Third declension nominative singular -s → -s (varies)
      { suffix: 's', replacement: 's', posTags: ['n-s--m-', 'n-s--f-', 'n-s--n-'], priority: 3 },
      
      // Third declension genitive singular -is → -is (short i)
      { suffix: 'is', replacement: 'is', posTags: ['n-s--m-', 'n-s--f-', 'n-s--n-'], priority: 5 },
      
      // Third declension ablative singular -e → -e (usually long)
      { suffix: 'e', replacement: 'ē', posTags: ['n-s--m-', 'n-s--f-', 'n-s--n-'], priority: 7 },
      
      // Verbs: present active infinitive -re → -re (long e)
      { suffix: 're', replacement: 're', posTags: ['v---'], priority: 8 },
      { suffix: 'ēre', replacement: 'ēre', posTags: ['v---'], priority: 10 },
      
      // Verbs: perfect stem -vī → -vī (long i)
      { suffix: 'vi', replacement: 'vī', posTags: ['v---'], priority: 8 },
      { suffix: 'vī', replacement: 'vī', posTags: ['v---'], priority: 10 },
      
      // Verbs: supine -tum → -tum (short u)
      { suffix: 'tum', replacement: 'tum', posTags: ['v---'], priority: 5 },
      
      // Verbs: gerundive -ndum → -ndum (short u)
      { suffix: 'ndum', replacement: 'ndum', posTags: ['v---'], priority: 5 },
      
      // Adjectives: comparative -ior → -ior (long i)
      { suffix: 'ior', replacement: 'ior', posTags: ['a---'], priority: 8 },
      
      // Adjectives: superlative -issimus → -issimus (short i)
      { suffix: 'issimus', replacement: 'issimus', posTags: ['a---'], priority: 5 },
      
      // Common adverbs -ē → -ē (long e)
      { suffix: 'ē', replacement: 'ē', posTags: ['d------'], priority: 9 },
      { suffix: 'iter', replacement: 'iter', posTags: ['d------'], priority: 6 },
      
      // Prepositions (usually short vowels)
      { suffix: 'in', replacement: 'in', posTags: ['e------'], priority: 5 },
      { suffix: 'ad', replacement: 'ad', posTags: ['e------'], priority: 5 },
      { suffix: 'cum', replacement: 'cum', posTags: ['e------'], priority: 5 },
      { suffix: 'ex', replacement: 'ex', posTags: ['e------'], priority: 5 },
      { suffix: 'de', replacement: 'de', posTags: ['e------'], priority: 5 },
      { suffix: 'ab', replacement: 'ab', posTags: ['e------'], priority: 5 },
      
      // Conjunctions
      { suffix: 'et', replacement: 'et', posTags: ['c------'], priority: 5 },
      { suffix: 'sed', replacement: 'sed', posTags: ['c------'], priority: 5 },
      { suffix: 'que', replacement: 'que', posTags: ['c------'], priority: 5 },
      
      // Common irregulars with long vowels
      { suffix: 'ō', replacement: 'ō', posTags: ['v1sp'], priority: 10 },  // sum
      { suffix: 's', replacement: 's', posTags: ['v2sp'], priority: 5 },   // es
      { suffix: 't', replacement: 't', posTags: ['v3sp'], priority: 5 },   // est
      
      // Plural forms often have long vowels
      { suffix: 'mus', replacement: 'mus', posTags: ['v1pp'], priority: 6 },
      { suffix: 'tis', replacement: 'tis', posTags: ['v2pp'], priority: 6 },
      { suffix: 'nt', replacement: 'nt', posTags: ['v3pp'], priority: 6 },
    ];

    this.patterns = patterns;
  }

  /**
   * Load patterns from JSON data
   */
  private loadFromData(data: any): void {
    if (Array.isArray(data)) {
      data.forEach((pattern: any) => {
        this.patterns.push({
          suffix: pattern.suffix,
          replacement: pattern.replacement,
          posTags: pattern.posTags || [],
          priority: pattern.priority || 5,
        });
      });
    }
  }

  /**
   * Build suffix tree for efficient lookup
   */
  private buildSuffixTree(): void {
    this.patterns.forEach(pattern => {
      const suffix = pattern.suffix;
      if (!this.suffixTree.has(suffix)) {
        this.suffixTree.set(suffix, []);
      }
      this.suffixTree.get(suffix)!.push(pattern);
    });
  }

  /**
   * Apply ending patterns to a word
   */
  apply(word: string, posTag?: string): string | null {
    const lowerWord = word.toLowerCase();
    
    // Try patterns in order of priority (highest first)
    const sortedPatterns = [...this.patterns].sort((a, b) => 
      (b.priority || 0) - (a.priority || 0)
    );

    for (const pattern of sortedPatterns) {
      // Check if word ends with this suffix
      if (lowerWord.endsWith(pattern.suffix)) {
        // Check POS tag compatibility if specified
        if (pattern.posTags && pattern.posTags.length > 0 && posTag) {
          if (!pattern.posTags.includes(posTag)) {
            continue;
          }
        }

        // Apply replacement
        const prefix = word.substring(0, word.length - pattern.suffix.length);
        const result = prefix + pattern.replacement;
        
        // Preserve original capitalization
        if (word[0] === word[0].toUpperCase()) {
          return result.charAt(0).toUpperCase() + result.slice(1);
        }
        
        return result;
      }
    }

    return null;
  }

  /**
   * Infer POS tag from word ending
   */
  inferTag(word: string): string {
    const lowerWord = word.toLowerCase();
    
    // Check for common verb endings
    if (lowerWord.endsWith('are') || lowerWord.endsWith('ēre') || 
        lowerWord.endsWith('ere') || lowerWord.endsWith('īre')) {
      return 'v---';
    }
    
    // Check for common noun endings
    if (lowerWord.endsWith('us')) return 'n-s--m-';
    if (lowerWord.endsWith('um')) return 'n-s--n-';
    if (lowerWord.endsWith('a') && !lowerWord.endsWith('ia')) return 'n-s--f-';
    if (lowerWord.endsWith('is')) return 'n-s--m-';
    
    // Check for common adjective endings
    if (lowerWord.endsWith('us') || lowerWord.endsWith('a') || lowerWord.endsWith('um')) {
      return 'a---';
    }
    
    // Check for adverbs
    if (lowerWord.endsWith('ē') || lowerWord.endsWith('iter')) {
      return 'd------';
    }
    
    // Check for prepositions
    const prepositions = ['in', 'ad', 'cum', 'ex', 'de', 'ab', 'pro', 'per'];
    if (prepositions.includes(lowerWord)) {
      return 'e------';
    }
    
    // Check for conjunctions
    const conjunctions = ['et', 'sed', 'autem', 'enim', 'que'];
    if (conjunctions.includes(lowerWord)) {
      return 'c------';
    }
    
    return '---------';
  }

  /**
   * Check if a pattern exists for this word
   */
  hasPattern(word: string): boolean {
    const lowerWord = word.toLowerCase();
    
    for (const pattern of this.patterns) {
      if (lowerWord.endsWith(pattern.suffix)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get all patterns for a word
   */
  getPatterns(word: string, posTag?: string): EndingPattern[] {
    const lowerWord = word.toLowerCase();
    const matches: EndingPattern[] = [];

    for (const pattern of this.patterns) {
      if (lowerWord.endsWith(pattern.suffix)) {
        if (!posTag || !pattern.posTags || pattern.posTags.length === 0) {
          matches.push(pattern);
        } else {
          // Check if POS tag matches (only check first char - main POS)
          const mainPos = posTag.charAt(0);
          const matchesPos = pattern.posTags.some(tag => 
            tag.charAt(0) === mainPos
          );
          if (matchesPos) {
            matches.push(pattern);
          }
        }
      }
    }

    return matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Get number of patterns
   */
  size(): number {
    return this.patterns.length;
  }

  /**
   * Check if loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Normalize RFTagger tag format (n.-.s.-.-.-.f.b.-) to pattern format (n-s--f-)
   */
  private normalizeTag(tag: string): string {
    if (!tag) return '---------';
    // Convert dots to dashes and remove extra dots
    return tag.replace(/\./g, '-').substring(0, 9);
  }

  /**
   * Apply ending patterns to macronize a word
   * Returns macronized form or null if no pattern matches
   */
  macronizeWithPatterns(word: string, posTag?: string): string | null {
    // Normalize tag format for matching
    const normalizedTag = this.normalizeTag(posTag || '');
    const patterns = this.getPatterns(word, normalizedTag);
    
    if (patterns.length === 0) {
      return null;
    }
    
    // Apply highest priority pattern
    const pattern = patterns[0];
    const lowerWord = word.toLowerCase();
    
    // Replace suffix with macronized version
    if (lowerWord.endsWith(pattern.suffix)) {
      const base = lowerWord.slice(0, -pattern.suffix.length);
      const macronized = base + pattern.replacement;
      
      // Preserve original case
      if (word[0] === word[0].toUpperCase()) {
        return macronized[0].toUpperCase() + macronized.slice(1);
      }
      return macronized;
    }
    
    return null;
  }
}
