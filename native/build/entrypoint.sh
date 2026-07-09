#!/bin/bash
set -e

# Source directory where WASM files were built
SRC_DIR="/src/native/morpheus/c/src/anal"
# Output directory (mounted volume)
OUT_DIR="/build/output"

# Check if output directory exists and is writable
if [ ! -d "$OUT_DIR" ]; then
    echo "Error: Output directory $OUT_DIR does not exist or is not mounted"
    exit 1
fi

# Copy WASM files
echo "Copying WASM files from $SRC_DIR to $OUT_DIR..."
cp -f "$SRC_DIR/cruncher.wasm" "$OUT_DIR/" 2>/dev/null || true
cp -f "$SRC_DIR/cruncher.js" "$OUT_DIR/" 2>/dev/null || true
cp -f "$SRC_DIR/cruncher.mjs" "$OUT_DIR/" 2>/dev/null || true
cp -f "$SRC_DIR/cruncher.data" "$OUT_DIR/" 2>/dev/null || true

# Also copy any supporting files
cp -f "$SRC_DIR/cruncher"* "$OUT_DIR/" 2>/dev/null || true

# List output
echo "Files in output directory:"
ls -la "$OUT_DIR" 2>/dev/null || echo "No files found"

echo "Copy complete."
