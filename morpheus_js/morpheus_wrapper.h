#ifndef MORPHEUS_WRAPPER_H
#define MORPHEUS_WRAPPER_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Initialize the Morpheus analyzer.
 * Must be called before any analysis.
 * Returns 0 on success, non-zero on failure.
 */
int morpheus_init(void);

/**
 * Set the language for analysis.
 * Currently only "latin" is supported.
 * Returns 0 on success, non-zero on failure.
 */
int morpheus_set_language(const char* language);

/**
 * Analyze a single word and return results as a newline-separated string.
 * The caller is responsible for freeing the returned string with morpheus_free().
 * Returns NULL on error.
 */
char* morpheus_analyze(const char* word);

/**
 * Analyze multiple words (newline-separated) and return results.
 * The caller is responsible for freeing the returned string.
 */
char* morpheus_analyze_batch(const char* words);

/**
 * Free memory allocated by morpheus_analyze() or morpheus_analyze_batch().
 */
void morpheus_free(char* str);

/**
 * Shutdown the Morpheus analyzer and free resources.
 */
void morpheus_shutdown(void);

#ifdef __cplusplus
}
#endif

#endif // MORPHEUS_WRAPPER_H
