#!/bin/bash
# Docker build script for Morpheus WASM
# Usage: ./docker-build-morpheus.sh

set -e

echo "=========================================="
echo "Building Morpheus WASM via Docker"
echo "=========================================="

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Build using docker-compose (no cache to ensure latest changes)
echo "Building with docker-compose (no cache)..."
docker-compose -f "$SCRIPT_DIR/docker-compose.morpheus.yml" build --no-cache morpheus-wasm-builder

if [ $? -ne 0 ]; then
    echo "Docker build failed!"
    exit 1
fi

echo ""
echo "Running build container to produce WASM..."
docker-compose -f "$SCRIPT_DIR/docker-compose.morpheus.yml" run --rm \
    --no-deps \
    morpheus-wasm-builder \
    /build/build-morpheus-wasm.sh /build/output

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "Build complete!"
    echo "=========================================="
    echo ""
    echo "Output files in: $PROJECT_ROOT/public/wasm/"
    ls -lh "$PROJECT_ROOT/public/wasm/cruncher."* 2>/dev/null || true
    echo ""
    echo "To test, serve the public/ directory and open test-morpheus-wasm.html"
else
    echo ""
    echo "Build failed inside container"
    exit 1
fi
