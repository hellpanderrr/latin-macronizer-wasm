/**
 * MorpheusTagger - JavaScript wrapper for Morpheus WASM module
 *
 * Provides a clean, Promise-based API for morphological analysis
 * of Latin words using the Morpheus engine compiled to WebAssembly.
 *
 * Usage:
 *   const tagger = new MorpheusTagger();
 *   await tagger.initialize();
 *   const result = tagger.analyze('puellam');
 *   console.log(result.analyses[0].lemma); // "puella"
 */

// PrntFlags from prntflags.h (decimal values)
const SHOW_ANAL = 1;           // 0o1
const SHOW_LEMMA = 2;          // 0o2
const SHOW_MISSES = 4;         // 0o4
const BUFFER_ANALS = 8;        // 0o10
const CHECK_PREVERB = 16;      // 0o20
const KEEP_BETA = 32;          // 0o40
const SHOW_FULL_INFO = 64;     // 0o100
const DBASEFORMAT = 128;       // 0o200
const DBASESHORT = 384;        // 0o400|DBASEFORMAT
const STRICT_CASE = 512;       // 0o1000
const PARSE_FORMAT = 1024;     // 0o2000
const PERSEUS_FORMAT = 2048;   // 0o4000
const ENDING_INDEX = 4096;     // 0o10000
const IGNORE_ACCENTS = 8192;   // 0o20000
const LEXICON_OUTPUT = 16384;  // 0o40000
const GREEK = 0;               // 0
const LATIN = 32768;           // 0o100000
const LEMCOUNT = 65536;        // 0o200000
const VERBS_ONLY = 131072;     // 0o400000
const ITALIAN = 262144;        // 0o1000000

/**
 * MorpheusTagger class
 */
class MorpheusTagger {
    constructor() {
        this.wasmModule = null;
        this.initialized = false;
        this.defaultLanguage = 'latin';
    }

    /**
     * Initialize the WASM module
     * @param {string} wasmPath Path to cruncher.js (default: ../public/wasm/cruncher.js)
     */
    async initialize(wasmPath = '../public/wasm/cruncher.js') {
        if (this.initialized) return;

        await this.loadScript(wasmPath);

        const Module = window.Morpheus;
        if (!Module) {
            throw new Error('Morpheus not found on window. Did the script load?');
        }

        // Configure locateFile to find .data file in the same directory as .js
        const wasmDir = wasmPath.substring(0, wasmPath.lastIndexOf('/') + 1);
        Module['locateFile'] = (path, prefix) => {
            if (path.endsWith('.data')) {
                return wasmDir + path;
            }
            return prefix + path;
        };

        this.wasmModule = await Module();
        this.initialized = true;
        console.log('[Morpheus] WASM module loaded, calling morpheus_init...');
        this.wasmModule.ccall('morpheus_init', null, [], []);
        console.log('[Morpheus] morpheus_init done, setting language to', this.defaultLanguage);
        this.setLanguage(this.defaultLanguage);
        console.log('[Morpheus] Initialization complete');
    }

    /**
     * Analyze a single word
     * @param {string} word The word to analyze
     * @param {Object} options Analysis options
     * @returns {Object} AnalysisResult
     */
    analyze(word, options = {}) {
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
            console.log('[Morpheus] analyze word:', word, 'numAnalyses:', numAnalyses, 'output length:', output.length);
            console.log('[Morpheus] raw output:', output);
            return this.parseOutput(word, output, numAnalyses);
        } finally {
            this.wasmModule._free(bufferPtr);
        }
    }

    /**
     * Analyze multiple words in batch
     * @param {string[]} words Array of words
     * @param {Object} options Analysis options
     * @returns {Array} Array of AnalysisResult
     */
    analyzeBatch(words, options = {}) {
        if (!this.initialized) {
            throw new Error('Morpheus not initialized. Call initialize() first.');
        }

        const flags = this.optionsToFlags(options);
        const bufferSize = 65536;
        const results = [];

        for (const word of words) {
            const bufferPtr = this.wasmModule._malloc(bufferSize);
            try {
                const numAnalyses = this.wasmModule.ccall(
                    'morpheus_analyze',
                    'number',
                    ['string', 'number', 'number', 'number'],
                    [word, bufferPtr, bufferSize, flags]
                );
                const output = this.wasmModule.UTF8ToString(bufferPtr);
                results.push(this.parseOutput(word, output, numAnalyses));
            } finally {
                this.wasmModule._free(bufferPtr);
            }
        }

        return results;
    }

    /**
     * Set analysis language
     * @param {string} lang 'greek' | 'latin' | 'italian'
     */
    setLanguage(lang) {
        if (!this.initialized) {
            throw new Error('Morpheus not initialized. Call initialize() first.');
        }
        let langCode;
        switch(lang) {
            case 'greek': langCode = GREEK; break;
            case 'latin': langCode = LATIN; break;
            case 'italian': langCode = ITALIAN; break;
            default: langCode = LATIN;
        }
        this.wasmModule.ccall('morpheus_set_language', null, ['number'], [langCode]);
        this.defaultLanguage = lang;
    }

    /**
     * Destroy the tagger and free resources
     */
    destroy() {
        if (this.wasmModule) {
            this.wasmModule.ccall('morpheus_destroy', null, [], []);
            this.wasmModule = null;
            this.initialized = false;
        }
    }

    isInitialized() {
        return this.initialized;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    optionsToFlags(options) {
        // Use PERSEUS_FORMAT for structured <NL>...</NL> output
        let flags = PERSEUS_FORMAT;

        if (options.format === 'lemma') flags |= SHOW_LEMMA;

        if (options.ignoreAccents) flags |= IGNORE_ACCENTS;
        if (!options.strictCase) flags &= ~STRICT_CASE;
        if (options.checkPreverb) flags |= CHECK_PREVERB;
        if (options.verbsOnly) flags |= VERBS_ONLY;

        flags |= LATIN; // Always use Latin
        return flags;
    }

    parseOutput(word, raw, numAnalyses) {
        const analyses = [];
        // The output format: each analysis is between <NL> and </NL>
        const regex = /<NL>([^<]*)<\/NL>/g;
        let match;
        console.log('[Morpheus] parseOutput raw:', raw.substring(0, 200));
        while ((match = regex.exec(raw)) !== null) {
            const line = match[1].trim();
            console.log('[Morpheus] found analysis line:', line);
            if (line) {
                const analysis = this.parseAnalysisLine(line);
                if (analysis) {
                    analyses.push(analysis);
                }
            }
        }

        console.log('[Morpheus] parseOutput result: word=', word, 'analyses count=', analyses.length);
        return {
            word,
            analyses,
            success: analyses.length > 0,
            raw
        };
    }

    parseAnalysisLine(line) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) return null;

        const posCode = parts[0];
        const stem = parts[1];
        const ending = parts[parts.length - 1];
        const formInfo = this.parseFormInfo(posCode, parts.slice(2, -1));

        return {
            lemma: stem,
            stem,
            ending,
            formInfo,
            raw: line
        };
    }

    parseFormInfo(posCode, features) {
        const info = { partOfSpeech: this.posCodeToName(posCode) };

        for (const f of features) {
            const lower = f.toLowerCase();
            if (!lower) continue;

            if (lower.includes('nom')) info.case = 'nominative';
            else if (lower.includes('gen')) info.case = 'genitive';
            else if (lower.includes('dat')) info.case = 'dative';
            else if (lower.includes('acc')) info.case = 'accusative';
            else if (lower.includes('abl')) info.case = 'ablative';
            else if (lower.includes('voc')) info.case = 'vocative';
            else if (lower.includes('loc')) info.case = 'locative';

            if (lower.includes('sg')) info.number = 'singular';
            else if (lower.includes('pl')) info.number = 'plural';
            else if (lower.includes('du')) info.number = 'dual';

            if (lower.includes('masc')) info.gender = 'masculine';
            else if (lower.includes('fem')) info.gender = 'feminine';
            else if (lower.includes('neut')) info.gender = 'neuter';

            if (lower.includes('pres')) info.tense = 'present';
            else if (lower.includes('impf')) info.tense = 'imperfect';
            else if (lower.includes('fut')) info.tense = 'future';
            else if (lower.includes('perf')) info.tense = 'perfect';
            else if (lower.includes('plup')) info.tense = 'pluperfect';

            if (lower.includes('ind')) info.mood = 'indicative';
            else if (lower.includes('sub')) info.mood = 'subjunctive';
            else if (lower.includes('imp')) info.mood = 'imperative';
            else if (lower.includes('inf')) info.mood = 'infinitive';
            else if (lower.includes('part')) info.mood = 'participle';

            if (lower.includes('act')) info.voice = 'active';
            else if (lower.includes('pass')) info.voice = 'passive';
            else if (lower.includes('mid')) info.voice = 'middle';

            if (lower.includes('1')) info.person = '1st';
            else if (lower.includes('2')) info.person = '2nd';
            else if (lower.includes('3')) info.person = '3rd';

            if (lower.includes('pos')) info.degree = 'positive';
            else if (lower.includes('comp')) info.degree = 'comparative';
            else if (lower.includes('sup')) info.degree = 'superlative';
        }

        return info;
    }

    posCodeToName(code) {
        const map = {
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

    loadScript(url) {
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

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MorpheusTagger };
}
if (typeof window !== 'undefined') {
    window.MorpheusTagger = MorpheusTagger;
}
