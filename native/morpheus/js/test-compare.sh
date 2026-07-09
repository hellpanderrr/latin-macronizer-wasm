#!/bin/bash

# Test script to compare WASM output with original cruncher

echo "=========================================="
echo "Building original Morpheus cruncher..."
echo "=========================================="
docker-compose -f docker-compose.compare.yml build

echo ""
echo "=========================================="
echo "Testing with original cruncher:"
echo "=========================================="

TEST_WORDS="puellam\nGallia\nest\nomnis\ndivisa"

# Test each word with original cruncher
echo -e "$TEST_WORDS" | docker-compose -f docker-compose.compare.yml run --rm morpheus-compare -L

echo ""
echo "=========================================="
echo "Now test with WASM in browser:"
echo "=========================================="
echo "Open test-morpheus-wasm.html and compare outputs"
echo ""
echo "Expected format from original:"
echo "  word"
echo "  <NL>N lemma ending ...</NL>"
echo ""
echo "Words to test: puellam, Gallia, est, omnis, divisa"
