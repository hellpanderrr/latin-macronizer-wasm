/bin/bash
set -e

echo "=========================================="
echo "Building RFTagger WebAssembly Module"
echo "=========================================="

# Create output directory
mkdir -p public/wasm

# Check if Emscripten is available
if command -v emcc &> /dev/null; then
    echo "Emscripten found, compiling RFTagger to WASM..."
    
    emcc native/rftagger/src/rftagger.cpp \
        -O3 \
        -s WASM=1 \
        -s MODULARIZE=1 \
        -s EXPORT_NAME="RFTagger" \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s TOTAL_MEMORY=67108864 \
        -s FILESYSTEM=1 \
        -s ENVIRONMENT='web,worker' \
        -s EXPORTED_FUNCTIONS='["_malloc","_free","_load_model","_tag_token","_tag_tokens","_get_model_stats","_destroy_tagger"]' \
        -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","lengthBytesUTF8"]' \
        -o public/wasm/rftagger.js
    
    echo "Build complete!"
    ls -lh public/wasm/
else
    echo "Emscripten not found, installing emsdk..."
    
    # Clone and install emsdk
    git clone https://github.com/emscripten-core/emsdk.git /tmp/emsdk
    cd /tmp/emsdk
    ./emsdk install latest
    ./emsdk activate latest
    source ./emsdk_env.sh
    
    # Build
    cd /f/projects/macronizer/latin-macronizer-master
    emcc native/rftagger/src/rftagger.cpp \
        -O3 \
        -s WASM=1 \
        -s MODULARIZE=1 \
        -s EXPORT_NAME="RFTagger" \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s TOTAL_MEMORY=67108864 \
        -s FILESYSTEM=1 \
        -s ENVIRONMENT='web,worker' \
        -o public/wasm/rftagger.js
    
    echo "Build complete!"
    ls -lh public/wasm/
fi

echo ""
echo "Next steps:"
echo "  1. Include public/wasm/rftagger.js in your HTML"
echo "  2. Initialize: const tagger = await RFTagger();"
echo "  3. Load model: tagger.load_model();"
echo "  4. Tag text: const tags = tagger.tag_tokens(tokens);"
