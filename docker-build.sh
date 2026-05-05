#!/bin/bash
cd /src
# Touch source files to force rebuild
touch rftagger/src/*.h rftagger/src/*.C
emcc rftagger/src/embind-wrapper.C rftagger/src/rft-annotate.C rftagger/src/io.C rftagger/src/DataMapping.C rftagger/src/SuffixLexicon.C rftagger/src/POSTagger.C rftagger/src/Lexicon.C rftagger/src/Entry.C \
  -O0 -std=c++17 -Wno-deprecated -Irftagger/src \
  -D__EMSCRIPTEN__ -DNDEBUG \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="RFTaggerModule" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=134217728 \
  -s FILESYSTEM=1 \
  -s FORCE_FILESYSTEM=1 \
  -s ENVIRONMENT=web,worker \
  -s EXPORTED_RUNTIME_METHODS='["FS","PATH"]' \
  --bind --no-entry \
  -o public/wasm/rftagger.js \
  2>&1

# Ensure the Latin model is up-to-date in the public/wasm directory
cp -f latin_macronizer/rftagger-ldt.model public/wasm/rftagger-ldt.model
echo "Model copied to public/wasm/rftagger-ldt.model"
