#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

int main(int argc, char **argv) {
    if (argc != 2) {
        printf("Usage: %s <model-file>\n", argv[0]);
        return 1;
    }
    const char *model_path = argv[1];
    FILE *f = fopen(model_path, "rb");
    if (!f) {
        printf("Cannot open model file: %s\n", model_path);
        return 1;
    }

    printf("Model file: %s\n", model_path);

    // 1. Read tag count (8-byte size_t, 64-bit LE, as model was built on 64-bit Linux)
    uint64_t tag_count_64;
    if (fread(&tag_count_64, sizeof(uint64_t), 1, f) != 1) {
        printf("Failed to read tag count\n");
        fclose(f);
        return 1;
    }
    printf("8-byte tag count (from model header): %llu\n", (unsigned long long)tag_count_64);

    // 2. Read tag count as 4-byte uint32 (current incorrect WASM reading)
    fseek(f, 0, SEEK_SET);
    uint32_t tag_count_32;
    if (fread(&tag_count_32, sizeof(uint32_t), 1, f) != 1) {
        printf("Failed to read 4-byte tag count\n");
        fclose(f);
        return 1;
    }
    printf("4-byte tag count (WASM reads this): %u\n", tag_count_32);

    // 3. Read and count actual tags (read tag_count_64 strings)
    fseek(f, 0, SEEK_SET);
    uint64_t n;
    fread(&n, sizeof(uint64_t), 1, f); // skip 8-byte count
    printf("Reading %llu tags...\n", (unsigned long long)n);
    size_t actual_tag_count = 0;
    for (uint64_t i = 0; i < n; i++) {
        int c;
        while ((c = fgetc(f)) != '\0' && c != EOF) {} // skip string until null terminator
        if (c == EOF) {
            printf("Unexpected EOF while reading tag %llu\n", (unsigned long long)i);
            break;
        }
        actual_tag_count++;
    }
    printf("Actual number of tags read: %zu\n", actual_tag_count);

    // 4. Read the rest of the model to verify no early EOF
    fseek(f, 0, SEEK_END);
    long file_size = ftell(f);
    printf("Total model file size: %ld bytes\n", file_size);

    fclose(f);
    return 0;
}
