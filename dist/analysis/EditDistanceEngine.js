/**
 * EditDistanceEngine.ts
 * Edit distance-based lookup for Latin macronization
 * Finds closest known words using Levenshtein distance
 */
export class EditDistanceEngine {
    constructor(maxDistance = 3) {
        Object.defineProperty(this, "knownWords", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxDistance", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "loaded", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.knownWords = new Map();
        this.maxDistance = maxDistance;
        this.loaded = false;
    }
    /**
     * Load known words dictionary
     */
    async load(data) {
        if (this.loaded)
            return;
        // Initialize with common Latin words
        this.initializeCommonWords();
        if (data) {
            this.loadFromData(data);
        }
        this.loaded = true;
    }
    /**
     * Initialize common Latin words
     */
    initializeCommonWords() {
        const words = [
            // Common verbs
            ['sum', 'sum'],
            ['esse', 'esse'],
            ['fui', 'fui'],
            ['erat', 'erat'],
            ['amare', 'amare'],
            ['videre', 'vidēre'],
            ['audire', 'audīre'],
            ['ducere', 'ducere'],
            ['facere', 'facere'],
            ['legere', 'legere'],
            ['scribere', 'scrībere'],
            ['dicere', 'dīcere'],
            ['venire', 'venīre'],
            ['capere', 'capere'],
            ['fugere', 'fugere'],
            // Common nouns
            ['puer', 'puer'],
            ['puella', 'puella'],
            ['bellum', 'bellum'],
            ['vir', 'vir'],
            ['femina', 'femina'],
            ['civis', 'civis'],
            ['urbs', 'urbs'],
            ['domus', 'domus'],
            ['terra', 'terra'],
            ['aqua', 'aqua'],
            ['lux', 'lūx'],
            ['nox', 'nox'],
            ['via', 'via'],
            ['vita', 'vīta'],
            ['mors', 'mors'],
            // Common adjectives
            ['bonus', 'bonus'],
            ['magnus', 'magnus'],
            ['parvus', 'parvus'],
            ['altus', 'altus'],
            ['longus', 'longus'],
            ['brevis', 'brevis'],
            ['novus', 'novus'],
            ['vetus', 'vetus'],
            ['bonus', 'bona'],
            ['magnus', 'magna'],
            ['parvus', 'parva'],
            // Common adverbs
            ['bene', 'bene'],
            ['male', 'male'],
            ['magnopere', 'magnopere'],
            ['valde', 'valde'],
            ['nimis', 'nimis'],
            ['modo', 'modo'],
            ['iam', 'iam'],
            ['nunc', 'nunc'],
            ['tunc', 'tunc'],
            ['ibi', 'ibi'],
            ['hic', 'hic'],
            ['ibi', 'ibi'],
            // Common prepositions
            ['in', 'in'],
            ['ad', 'ad'],
            ['cum', 'cum'],
            ['ex', 'ex'],
            ['de', 'de'],
            ['ab', 'ab'],
            ['pro', 'pro'],
            ['per', 'per'],
            ['sine', 'sine'],
            ['sub', 'sub'],
            // Common conjunctions
            ['et', 'et'],
            ['sed', 'sed'],
            ['autem', 'autem'],
            ['enim', 'enim'],
            ['nam', 'nam'],
            ['que', 'que'],
            ['neque', 'neque'],
            ['aut', 'aut'],
            ['vel', 'vel'],
            // Common pronouns
            ['ego', 'ego'],
            ['tu', 'tu'],
            ['nos', 'nos'],
            ['vos', 'vos'],
            ['is', 'is'],
            ['ea', 'ea'],
            ['id', 'id'],
            ['ille', 'ille'],
            ['illa', 'illa'],
            ['hic', 'hic'],
            ['haec', 'haec'],
            ['quod', 'quod'],
            ['quis', 'quis'],
            ['quid', 'quid'],
            ['quisque', 'quisque'],
            // Common numbers
            ['unus', 'ūnus'],
            ['duo', 'duo'],
            ['tres', 'trēs'],
            ['quattuor', 'quattuor'],
            ['quinque', 'quinque'],
            ['sex', 'sex'],
            ['septem', 'septem'],
            ['octo', 'octo'],
            ['novem', 'novem'],
            ['decem', 'decem'],
        ];
        words.forEach(([word, macronized]) => {
            this.knownWords.set(word.toLowerCase(), macronized);
        });
    }
    /**
     * Load words from data
     */
    loadFromData(data) {
        if (Array.isArray(data)) {
            data.forEach(([word, macronized]) => {
                this.knownWords.set(word.toLowerCase(), macronized);
            });
        }
        else if (typeof data === 'object') {
            Object.entries(data).forEach(([word, macronized]) => {
                this.knownWords.set(word.toLowerCase(), macronized);
            });
        }
    }
    /**
     * Find closest known word using edit distance
     */
    findClosest(word, posTag) {
        const lowerWord = word.toLowerCase();
        // Exact match
        if (this.knownWords.has(lowerWord)) {
            return {
                word,
                distance: 0,
                macronized: this.knownWords.get(lowerWord),
                confidence: 1.0,
            };
        }
        let bestMatch = null;
        let bestDistance = this.maxDistance + 1;
        for (const [knownWord, macronized] of this.knownWords) {
            const distance = this.levenshteinDistance(lowerWord, knownWord);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestMatch = {
                    word: knownWord,
                    distance,
                    macronized,
                    confidence: this.calculateConfidence(distance, word.length),
                };
            }
        }
        return bestMatch && bestMatch.distance <= this.maxDistance ? bestMatch : null;
    }
    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(a, b) {
        const matrix = [];
        // Initialize matrix
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        // Fill matrix
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1, // insertion
                    matrix[i - 1][j] + 1 // deletion
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }
    /**
     * Calculate confidence based on edit distance and word length
     */
    calculateConfidence(distance, length) {
        if (distance === 0)
            return 1.0;
        if (length === 0)
            return 0.0;
        const ratio = distance / length;
        if (ratio <= 0.2)
            return 0.90;
        if (ratio <= 0.4)
            return 0.75;
        if (ratio <= 0.5)
            return 0.60;
        return 0.40;
    }
    /**
     * Add a word to the dictionary
     */
    addWord(word, macronized) {
        this.knownWords.set(word.toLowerCase(), macronized);
    }
    /**
     * Check if word is known
     */
    hasWord(word) {
        return this.knownWords.has(word.toLowerCase());
    }
    /**
     * Get macronized form
     */
    getMacronized(word) {
        return this.knownWords.get(word.toLowerCase()) || null;
    }
    /**
     * Get dictionary size
     */
    size() {
        return this.knownWords.size;
    }
    /**
     * Check if loaded
     */
    isLoaded() {
        return this.loaded;
    }
    /**
     * Find all words within max distance
     */
    findAllWithinDistance(word, maxDistance = 2) {
        const lowerWord = word.toLowerCase();
        const results = [];
        for (const [knownWord, macronized] of this.knownWords) {
            const distance = this.levenshteinDistance(lowerWord, knownWord);
            if (distance <= maxDistance) {
                results.push({
                    word: knownWord,
                    distance,
                    macronized,
                    confidence: this.calculateConfidence(distance, word.length),
                });
            }
        }
        return results.sort((a, b) => a.distance - b.distance);
    }
}
//# sourceMappingURL=EditDistanceEngine.js.map