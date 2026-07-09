/**
 * MorpheusTagger - TypeScript wrapper for Morpheus WASM module
 *
 * Provides a clean, Promise-based API for morphological analysis
 * of Latin (and Greek) words using the Morpheus engine compiled to WebAssembly.
 *
 * Usage:
 *   const tagger = new MorpheusTagger();
 *   await tagger.initialize();
 *   const result = tagger.analyze('puellam');
 *   console.log(result.analyses[0].lemma); // "puella"
 */

export interface MorphFormInfo {
    partOfSpeech: string;
    case?: string;
    number?: string;
    gender?: string;
    tense?: string;
    mood?: string;
    voice?: string;
    person?: string;
    degree?: string;
}

export interface MorphAnalysis {
    lemma: string;
    stem: string;
    ending: string;
    formInfo: MorphFormInfo;
    raw: string;
}

export interface AnalysisResult {
    word: string;
    analyses: MorphAnalysis[];
    success: boolean;
    raw: string;
}

export interface AnalysisOptions {
    format?: 'perseus' | 'database' | 'lemma';
    ignoreAccents?: boolean;
    strictCase?: boolean;
    checkPreverb?: boolean;
    verbsOnly?: boolean;
}

// PrntFlags from prntflags.h
const SHOW_ANAL = 0x01;
const SHOW_LEMMA = 0x02;
const SHOW_MISSES = 0x04;
const BUFFER_ANALS = 0x08;
const CHECK_PREVERB = 0x10;
const KEEP_BETA = 0x20;
const SHOW_FULL_INFO = 0x40;
const DBASEFORMAT = 0x80;
const DBASESHORT = 0xC0;
const STRICT_CASE = 0x100;
const PARSE_FORMAT = 0x200;
const PERSEUS_FORMAT = 0x400;
const ENDING_INDEX = 0x800;
const IGNORE_ACCENTS = 0x20000;
const LEXICON_OUTPUT = 0x40000;
const LATIN = 0x10000;
const VERBS_ONLY = 0x400000;

/**
 * MorpheusTagger class
 */
export class MorpheusTagger {
    private wasmModule: any = null;
    private initialized: boolean = false;
    private defaultLanguage: 'latin' | 'greek' | 'italian' = 'latin';

    /**
     * Initialize the WASM module
     * @param wasmPath Path to morpheus.js (default: /wasm/morpheus.js)
     */
    async initialize(wasmPath: string = '/wasm/morpheus.js'): Promise<void> {
        if (this.initialized) return;

        // Load the WASM module script
        await this.loadScript(wasmPath);

        // Get the module (Emscripten modularize)
        const Module = (window as any).MorpheusModule;
        if (!Module) {
            throw new Error('MorpheusModule not found on window. Did the script load?');
        }

        this.wasmModule = await Module();

        // Initialize Morpheus
        this.wasmModule.ccall('morpheus_init', null, [], []);

        // Set default language
        this.setLanguage(this.defaultLanguage);

        this.initialized = true;
    }

    /**
     * Analyze a single word
     * @param word The word to analyze
     * @param options Analysis options
     * @returns AnalysisResult
     */
    analyze(word: string, options: AnalysisOptions = {}): AnalysisResult {
        if (!this.initialized) {
            throw new Error('Morpheus not initialized. Call initialize() first.');
        }

        const flags = this.optionsToFlags(options);
        const bufferSize = 65536;
        const bufferPtr = this.wasmModule._malloc(bufferSize);

        try {
            const numAnalyses = this.wasmModule.ccall(
                'morpheus_analyze',
                'number',
                ['string', 'number', 'number', 'number'],
                [word, bufferPtr, bufferSize, flags]
            );

            const output = this.wasmModule.UTF8ToString(bufferPtr);
            return this.parseOutput(word, output, numAnalyses);
        } finally {
            this.wasmModule._free(bufferPtr);
        }
    }

    /**
     * Analyze multiple words in batch
     * @param words Array of words
     * @param options Analysis options
     * @returns Array of AnalysisResult
     */
    analyzeBatch(words: string[], options: AnalysisOptions = {}): AnalysisResult[] {
        if (!this.initialized) {
            throw new Error('Morpheus not initialized. Call initialize() first.');
        }

        const flags = this.optionsToFlags(options);
        const bufferSize = 65536;

        // Allocate array of buffers (one per word)
        const buffersPtr = this.wasmModule._malloc(words.length * bufferSize);
        const bufferPointers: number[] = [];

        try {
            // Set up array of pointers
            for (let i = 0; i < words.length; i++) {
                const bufPtr = buffersPtr + i * bufferSize;
                bufferPointers.push(bufPtr);
            }

            // Convert string array to C array
            const cWordsArray = this.wasmModule._malloc(words.length * 4); // 4 bytes per pointer
            for (let i = 0; i < words.length; i++) {
                const wordPtr = this.wasmModule._malloc((words[i].length + 1) * 2); // UTF-8
                this.wasmModule.stringToUTF8(words[i], wordPtr, words[i].length + 1);
                this.wasmModule.setValue(cWordsArray + i * 4, wordPtr, 'i32');
            }

            // Call batch analyze
            const successCount = this.wasmModule.ccall(
                'morpheus_analyze_batch',
                'number',
                ['number', 'number', 'number', 'number', 'number'],
                [cWordsArray, words.length, buffersPtr, bufferSize, flags]
            );

            // Collect results
            const results: AnalysisResult[] = [];
            for (let i = 0; i < words.length; i++) {
                const bufPtr = buffersPtr + i * bufferSize;
                const output = this.wasmModule.UTF8ToString(bufPtr);
                const result = this.parseOutput(words[i], output, successCount > 0 ? 1 : 0);
                results.push(result);
            }

            // Free word strings
            for (let i = 0; i < words.length; i++) {
                const wordPtr = this.wasmModule.getValue(cWordsArray + i * 4, 'i32');
                this.wasmModule._free(wordPtr);
            }
            this.wasmModule._free(cWordsArray);

            return results;
        } finally {
            this.wasmModule._free(buffersPtr);
        }
    }

    /**
     * Set analysis language
     * @param lang 'greek' | 'latin' | 'italian'
     */
    setLanguage(lang: 'greek' | 'latin' | 'italian'): void {
        if (!this.initialized) {
            throw new Error('Morpheus not initialized. Call initialize() first.');
        }
        const langCode = lang === 'greek' ? 0 : lang === 'latin' ? 1 : 2;
        this.wasmModule.ccall('morpheus_set_language', null, ['number'], [langCode]);
        this.defaultLanguage = lang;
    }

    /**
     * Destroy the tagger and free resources
     */
    destroy(): void {
        if (this.wasmModule) {
            this.wasmModule.ccall('morpheus_destroy', null, [], []);
            this.wasmModule = null;
            this.initialized = false;
        }
    }

    /**
     * Check if the tagger is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private optionsToFlags(options: AnalysisOptions): number {
        let flags = SHOW_ANAL; // Default: show full analysis

        if (options.format === 'lemma') flags |= SHOW_LEMMA;
        else if (options.format === 'database') flags |= DBASEFORMAT;
        // perseus is default (PERSEUS_FORMAT is set by default in C code)

        if (options.ignoreAccents) flags |= IGNORE_ACCENTS;
        if (!options.strictCase) flags &= ~STRICT_CASE; // Clear STRICT_CASE flag
        if (options.checkPreverb) flags |= CHECK_PREVERB;
        if (options.verbsOnly) flags |= VERBS_ONLY;

        // Always include LATIN flag (overrides Greek default)
        flags |= LATIN;

        return flags;
    }

    private parseOutput(word: string, raw: string, numAnalyses: number): AnalysisResult {
        const analyses: MorphAnalysis[] = [];

        // Perseus format: <NL>POS stem [features] ending</NL>
        // Example: <NL>N a)/nqrwpos  masc nom sg      os_ou</NL>
        const regex = /<NL>([^<]*)<\/NL>/g;
        let match;
        while ((match = regex.exec(raw)) !== null) {
            const line = match[1].trim();
            if (line) {
                const analysis = this.parseAnalysisLine(line);
                if (analysis) {
                    analyses.push(analysis);
                }
            }
        }

        return {
            word,
            analyses,
            success: analyses.length > 0,
            raw
        };
    }

    private parseAnalysisLine(line: string): MorphAnalysis | null {
        // Split by whitespace, but keep beta-code intact
        // Format: POS stem [features...] ending
        // Features may include: masc/fem/neut, nom/gen/dat/acc/abl/voc, sg/pl, etc.
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) return null;

        const posCode = parts[0]; // e.g., "N", "V", "A"
        const stem = parts[1];    // e.g., "a)/nqrwpos"

        // The last part is the ending code (e.g., "os_ou")
        const ending = parts[parts.length - 1];

        // Build formInfo from POS and features
        const formInfo = this.parseFormInfo(posCode, parts.slice(2, -1));

        return {
            lemma: stem,
            stem,
            ending,
            formInfo,
            raw: line
        };
    }

    private parseFormInfo(posCode: string, features: string[]): MorphFormInfo {
        const info: MorphFormInfo = { partOfSpeech: this.posCodeToName(posCode) };

        // Parse features like "masc", "nom", "sg", "fem", "acc", etc.
        for (const f of features) {
            const lower = f.toLowerCase();
            if (!lower) continue;

            // Case
            if (lower.includes('nom')) info.case = 'nominative';
            else if (lower.includes('gen')) info.case = 'genitive';
            else if (lower.includes('dat')) info.case = 'dative';
            else if (lower.includes('acc')) info.case = 'accusative';
            else if (lower.includes('abl')) info.case = 'ablative';
            else if (lower.includes('voc')) info.case = 'vocative';
            else if (lower.includes('loc')) info.case = 'locative';

            // Number
            if (lower.includes('sg')) info.number = 'singular';
            else if (lower.includes('pl')) info.number = 'plural';
            else if (lower.includes('du')) info.number = 'dual';

            // Gender
            if (lower.includes('masc')) info.gender = 'masculine';
            else if (lower.includes('fem')) info.gender = 'feminine';
            else if (lower.includes('neut')) info.gender = 'neuter';

            // Tense (verbs)
            if (lower.includes('pres')) info.tense = 'present';
            else if (lower.includes('impf')) info.tense = 'imperfect';
            else if (lower.includes('fut')) info.tense = 'future';
            else if (lower.includes('perf')) info.tense = 'perfect';
            else if (lower.includes('plup')) info.tense = 'pluperfect';
            else if (lower.includes('futperf')) info.tense = 'future perfect';
            else if (lower.includes('past')) info.tense = 'past';

            // Mood
            if (lower.includes('ind')) info.mood = 'indicative';
            else if (lower.includes('sub')) info.mood = 'subjunctive';
            else if (lower.includes('imp')) info.mood = 'imperative';
            else if (lower.includes('inf')) info.mood = 'infinitive';
            else if (lower.includes('part')) info.mood = 'participle';
            else if (lower.includes('ger')) info.mood = 'gerund';
            else if (lower.includes('sup')) info.mood = 'supine';

            // Voice
            if (lower.includes('act')) info.voice = 'active';
            else if (lower.includes('pass')) info.voice = 'passive';
            else if (lower.includes('mid')) info.voice = 'middle';
            else if (lower.includes('med')) info.voice = 'middle';

            // Person
            if (lower.includes('1')) info.person = '1st';
            else if (lower.includes('2')) info.person = '2nd';
            else if (lower.includes('3')) info.person = '3rd';

            // Degree (adjectives)
            if (lower.includes('pos')) info.degree = 'positive';
            else if (lower.includes('comp')) info.degree = 'comparative';
            else if (lower.includes('sup')) info.degree = 'superlative';
        }

        return info;
    }

    private posCodeToName(code: string): string {
        const map: Record<string, string> = {
            'N': 'noun',
            'V': 'verb',
            'A': 'adjective',
            'P': 'pronoun',
            'ADV': 'adverb',
            'PREP': 'preposition',
            'CONJ': 'conjunction',
            'INTERJ': 'interjection',
            'NUM': 'numeral',
            'PART': 'particle',
            'X': 'unknown'
        };
        return map[code] || code.toLowerCase();
    }

    private loadScript(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
            document.head.appendChild(script);
        });
    }
}

// Declare global module variable (Emscripten)
declare global {
    interface Window {
        MorpheusModule: () => Promise<any>;
    }
}
