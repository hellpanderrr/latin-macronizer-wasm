#include <gkstring.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <emscripten.h>

// Prototypes
extern int checkstring(char *string, int prntflags, FILE *fout);

EMSCRIPTEN_KEEPALIVE
void morpheus_init() {
    // Set MORPHLIB environment variable to point to stemlib in virtual FS
    setenv("MORPHLIB", "/stemlib", 1);
}

EMSCRIPTEN_KEEPALIVE
void morpheus_set_language(int lang) {
    // lang should be GREEK (0), LATIN (32768), or ITALIAN (262144)
    set_lang(lang);
}

// Buffer to capture output
static char output_buffer[262144];  // 256KB buffer

// Custom printf handler for Emscripten
static void capture_printf(const char* fmt, ...) {
    va_list args;
    va_start(args, fmt);
    size_t current_len = strlen(output_buffer);
    if (current_len < sizeof(output_buffer) - 1) {
        vsnprintf(output_buffer + current_len, sizeof(output_buffer) - current_len - 1, fmt, args);
    }
    va_end(args);
}

EMSCRIPTEN_KEEPALIVE
int morpheus_analyze(const char* word, char* result_buf, int buf_size, int flags) {
    if (!word || !result_buf || buf_size <= 0) return 0;
    memset(result_buf, 0, buf_size);
    output_buffer[0] = '\0';  // Clear global buffer

    // Setup output capture - Morpheus uses stdout internally
    // We need to use a temp file for Emscripten compatibility
    const char* tmpfile = "/tmp/morph_out.txt";

    // Redirect stdout to temp file
    FILE* old_stdout = stdout;
    FILE* outf = fopen(tmpfile, "w");
    if (outf) {
        // Hack: redirect stdout by replacing the file descriptor
        // Note: in Emscripten, FILE* redirection is limited
        // Use freopen for proper redirection
        fclose(outf);
        freopen(tmpfile, "w", stdout);
    }

    // Call checkstring - it prints to stdout
    int rval = checkstring((char*)word, (int)flags, stdout);
    fflush(stdout);

    // Restore stdout and read the file
    freopen("/dev/null", "w", stdout);  // Redirect to null first
    FILE* f = fopen(tmpfile, "r");
    if (f) {
        size_t n = fread(result_buf, 1, buf_size - 1, f);
        result_buf[n] = '\0';
        fclose(f);
    }

    return rval;
}

EMSCRIPTEN_KEEPALIVE
int morpheus_analyze_batch(const char** words, int count, char** results, int buf_size, int flags) {
    if (!words || !results || count <= 0) return 0;
    int success = 0;
    for (int i = 0; i < count; i++) {
        int r = morpheus_analyze(words[i], results[i], buf_size, flags);
        if (r > 0) success++;
    }
    return success;
}

EMSCRIPTEN_KEEPALIVE
const char* morpheus_get_last_error() {
    return "";
}

EMSCRIPTEN_KEEPALIVE
void morpheus_destroy() {
    // Nothing to cleanup currently
}
