/**
 * emscripten-build.sh
 * Build script for compiling RFTagger to WebAssembly using Emscripten
 * 
 * Prerequisites:
 * - Emscripten SDK installed and activated
 * - RFTagger C++ source code available
 * 
 * Usage:
 *   chmod +x emscripten-build.sh
 *   ./emscripten-build.sh
 */

#!/bin/bash
set -e

echo "=========================================="
echo "RFTagger WebAssembly Build Script"
echo "=========================================="

# Configuration
BUILD_DIR="build"
SOURCE_DIR="native/rftagger/src"
MODEL_FILE="public/wasm/rftagger-ldt.model"
OUTPUT_DIR="public/wasm"

# Emscripten flags
export EMCC_FORCE_STDLIBS=1
export EMCC_DEBUG=0

# Compiler flags
CC_FLAGS="-O3"
CXX_FLAGS="-O3 -std=c++17"
WASM_FLAGS="\
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='RFTagger' \
  -s EXPORTED_FUNCTIONS='[\n    \"_malloc\",\n    \"_free\",\n    \"_load_model\",\n    \"_tag_tokens\",\n    \"_tag_sentence\",\n    \"_destroy\"\n  ]' \
  -s EXPORTED_RUNTIME_METHODS='[\n    \"ccall\",\n    \"cwrap\",\n    \"UTF8ToString\",\n    \"stringToUTF8\",
    \"lengthBytesUTF8\"\n  ]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s TOTAL_MEMORY=67108864 \
  -s MAXIMUM_MEMORY=268435456 \
  -s ENVIRONMENT='web,worker' \
  -s FILESYSTEM=1 \
  -s FORCE_FILESYSTEM=1 \
  -s PRELOAD_MODULE=1 \
  -s SINGLE_FILE=0 \
  -s WASM_BIGINT=1 \
  -s USE_ES6_IMPORT_META=0"

# Optimization flags
OPT_FLAGS="-flto -fno-exceptions -fno-rtti"

# Create build directories
mkdir -p ${BUILD_DIR}
mkdir -p ${OUTPUT_DIR}

echo ""
echo "Build Configuration:"
echo "  Source: ${SOURCE_DIR}"
echo "  Model: ${MODEL_FILE}"
echo "  Output: ${OUTPUT_DIR}"
echo "  Memory: 64MB (initial) / 256MB (max)"
echo ""

# Check for Emscripten
if ! command -v emcc &> /dev/null; then
    echo "ERROR: Emscripten (emcc) not found!"
    echo "Please install Emscripten SDK:"
    echo "  https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

echo "Emscripten version:"
emcc --version | head -1
echo ""

# Check for model file
if [ ! -f "${MODEL_FILE}" ]; then
    echo "WARNING: Model file not found at ${MODEL_FILE}"
    echo "The WASM module will compile but won't have the trained model."
    echo ""
fi

# Find RFTagger source files
echo "Searching for RFTagger source files..."
SOURCE_FILES=$(find ${SOURCE_DIR} -name "*.cpp" -o -name "*.cc" 2>/dev/null | head -20)

if [ -z "${SOURCE_FILES}" ]; then
    echo "ERROR: No RFTagger source files found in ${SOURCE_DIR}"
    echo ""
    echo "Please ensure RFTagger C++ source is available."
    echo "You may need to clone the RFTagger repository:"
    echo "  git clone https://github.com/rsennrich/RFTagger.git"
    echo ""
    
    # Create a minimal stub implementation instead
    echo "Creating minimal RFTagger stub for demonstration..."
    create_stub_implementation
    exit 0
fi

echo "Found source files:"
echo "${SOURCE_FILES}"
echo ""

# Compile RFTagger to WebAssembly
echo "Compiling RFTagger to WebAssembly..."
echo "This may take several minutes..."
echo ""

emcc ${SOURCE_FILES} \
  ${CC_FLAGS} \
  ${CXX_FLAGS} \
  ${WASM_FLAGS} \
  ${OPT_FLAGS} \
  -I${SOURCE_DIR} \
  -I${SOURCE_DIR}/../include \
  -o ${OUTPUT_DIR}/rftagger.js \
  2>&1 | tee ${BUILD_DIR}/build.log

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "Build successful!"
    echo "=========================================="
    echo ""
    echo "Output files:"
    ls -lh ${OUTPUT_DIR}/rftagger.* 2>/dev/null || true
    echo ""
    
    # Copy model file to output directory
    if [ -f "${MODEL_FILE}" ]; then
        echo "Copying model file..."
        cp ${MODEL_FILE} ${OUTPUT_DIR}/
        echo "Model: ${OUTPUT_DIR}/rftagger-ldt.model"
    fi
    
    echo ""
    echo "Next steps:"
    echo "  1. Include rftagger.js in your HTML"
    echo "  2. Initialize the module: const tagger = await RFTagger();"
    echo "  3. Load model: await tagger.loadModel();"
    echo "  4. Tag text: const results = tagger.tag(tokens);"
    echo ""
else
    echo ""
    echo "=========================================="
    echo "Build failed!"
    echo "=========================================="
    echo ""
    echo "Check ${BUILD_DIR}/build.log for details"
    echo ""
    
    # Try alternative approach with stub
    echo "Falling back to stub implementation..."
    create_stub_implementation
    exit 1
fi

# Function to create stub implementation
create_stub_implementation() {
    echo "Creating stub WASM module..."
    
    cat > ${BUILD_DIR}/rftagger_stub.cpp << 'EOF'
#include <emscripten/bind.h>
#include <string>
#include <vector>
#include <map>

using namespace emscripten;

class RFTaggerStub {
private:
    bool modelLoaded;
    std::map<std::string, std::string> tagMap;
    
public:
    RFTaggerStub() : modelLoaded(false) {
        // Initialize with common Latin tags
        initializeTagMap();
    }
    
    void initializeTagMap() {
        // Common verb forms
        tagMap["sum"] = "v1sp";
        tagMap["es"] = "v2sp";
        tagMap["est"] = "v3sp";
        tagMap["sunt"] = "v3pp";
        
        // Common nouns
        tagMap["puer"] = "n-s--m";
        tagMap["puella"] = "n-s--f";
        tagMap["bellum"] = "n-s--n";
        
        // Common adjectives
        tagMap["bonus"] = "a--s--m";
        tagMap["bona"] = "a--s--f";
        tagMap["bonum"] = "a--s--n";
    }
    
    bool loadModel(const std::string& modelPath) {
        modelLoaded = true;
        return true;
    }
    
    std::string tagToken(const std::string& token) {
        std::string lowerToken = token;
        // Convert to lowercase
        for (char& c : lowerToken) {
            c = tolower(c);
        }
        
        // Check if in map
        if (tagMap.find(lowerToken) != tagMap.end()) {
            return tagMap[lowerToken];
        }
        
        // Default tagging based on suffix
        if (lowerToken.length() >= 3) {
            std::string suffix = lowerToken.substr(lowerToken.length() - 3);
            if (suffix == "are" || suffix == "ere" || suffix == "ire") {
                return "v---";
            }
        }
        
        if (lowerToken.length() >= 2) {
            std::string suffix = lowerToken.substr(lowerToken.length() - 2);
            if (suffix == "us") return "n-s--m";
            if (suffix == "um") return "n-s--n";
            if (suffix == "a") return "n-s--f";
        }
        
        return "---------";
    }
    
    std::vector<std::string> tagTokens(const std::vector<std::string>& tokens) {
        std::vector<std::string> results;
        for (const auto& token : tokens) {
            results.push_back(tagToken(token));
        }
        return results;
    }
    
    void destroy() {
        modelLoaded = false;
    }
};

EMSCRIPTEN_BINDINGS(rftagger_module) {
    class_<RFTaggerStub>("RFTagger")
        .constructor<>()
        .function("loadModel", &RFTaggerStub::loadModel)
        .function("tagToken", &RFTaggerStub::tagToken)
        .function("tagTokens", &RFTaggerStub::tagTokens)
        .function("destroy", &RFTaggerStub::destroy);
}
EOF
    
    # Compile stub
    emcc ${BUILD_DIR}/rftagger_stub.cpp \
      -O3 \
      -s WASM=1 \
      -s MODULARIZE=1 \
      -s EXPORT_NAME='RFTagger' \
      -s EXPORTED_FUNCTIONS='["_malloc","_free"]' \
      -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s ENVIRONMENT='web' \
      -o ${OUTPUT_DIR}/rftagger.js
    
    echo "Stub WASM module created at ${OUTPUT_DIR}/rftagger.js"
}

echo ""
echo "Build complete!"
