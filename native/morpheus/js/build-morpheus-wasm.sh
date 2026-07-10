#!/bin/bash
set -e

echo "=========================================="
echo "Building Morpheus WebAssembly Module"
echo "=========================================="

# Inside container, all paths are absolute
MORPHEUS_SRC_DIR="/build/native/morpheus/c/src"
MORPHEUS_INCLUDE_DIR="${MORPHEUS_SRC_DIR}/includes"
MORPHEUS_STEMLIB_DIR="/build/native/morpheus/c/stemlib"
OUTPUT_DIR="/build/output"
BUILD_DIR="/build"

mkdir -p "${OUTPUT_DIR}"
mkdir -p "${BUILD_DIR}"

if ! command -v emcc &> /dev/null; then
    echo "ERROR: Emscripten (emcc) not found!"
    exit 1
fi

echo "Emscripten version:"
emcc --version | head -1
echo ""

if [ ! -d "${MORPHEUS_SRC_DIR}" ]; then
    echo "ERROR: Morpheus source not found at ${MORPHEUS_SRC_DIR}"
    exit 1
fi

if [ ! -d "${MORPHEUS_STEMLIB_DIR}/Latin" ]; then
    echo "WARNING: Latin stemlib not found at ${MORPHEUS_STEMLIB_DIR}/Latin"
    echo ""
fi

echo "Stripping Greek stemlib (Latin-only build for macronizer)..."
rm -rf "${MORPHEUS_STEMLIB_DIR}/Greek"
echo "Stemlib size after stripping Greek:"
du -sh "${MORPHEUS_STEMLIB_DIR}" || true

echo "Defining source files from makefiles..."

# Directories
ANAL_DIR="${MORPHEUS_SRC_DIR}/anal"
GENER_DIR="${MORPHEUS_SRC_DIR}/gener"
GKDICT_DIR="${MORPHEUS_SRC_DIR}/gkdict"
GKENDS_DIR="${MORPHEUS_SRC_DIR}/gkends"
MORPHLIB_DIR="${MORPHEUS_SRC_DIR}/morphlib"
GKLIB_DIR="${MORPHEUS_SRC_DIR}/greeklib"

# Use arrays for file lists (handles spaces properly)
declare -a ANAL_FILES=(
    "${ANAL_DIR}/checkcrasis.c"
    "${ANAL_DIR}/checkdict.c"
    "${ANAL_DIR}/checkgenwds.c"
    "${ANAL_DIR}/checkhalf1.c"
    "${ANAL_DIR}/checkindecl.c"
    "${ANAL_DIR}/checkirreg.c"
    "${ANAL_DIR}/checknom.c"
    "${ANAL_DIR}/checkpreverb.c"
    "${ANAL_DIR}/checkstem.c"
    "${ANAL_DIR}/checkstring.c"
    "${ANAL_DIR}/checkverb.c"
    "${ANAL_DIR}/checkword.c"
    "${ANAL_DIR}/dictstems.c"
    "${ANAL_DIR}/prntanal.c"
    "${ANAL_DIR}/prvb.c"
    "${ANAL_DIR}/stdiomorph.c"
)

declare -a GENER_FILES=("${GENER_DIR}/genwd.c")

declare -a GKDICT_FILES=(
    "${GKDICT_DIR}/dictio.c"
    "${GKDICT_DIR}/derivio.c"
    "${GKDICT_DIR}/compnoun.c"
)

declare -a GKENDS_FILES=(
    "${GKENDS_DIR}/acccompos.c"
    "${GKENDS_DIR}/checkforbreath.c"
    "${GKENDS_DIR}/contract.c"
    "${GKENDS_DIR}/countendtables.c"
    "${GKENDS_DIR}/endindex.c"
    "${GKENDS_DIR}/euphend.c"
    "${GKENDS_DIR}/expendtable.c"
    "${GKENDS_DIR}/fixeta.c"
    "${GKENDS_DIR}/getcurrend.c"
    "${GKENDS_DIR}/lcontr.c"
    "${GKENDS_DIR}/merge.c"
    "${GKENDS_DIR}/mkend.c"
    "${GKENDS_DIR}/nextsufftab.c"
    "${GKENDS_DIR}/retrends.c"
    "${GKENDS_DIR}/stor.c"
)

declare -a MORPHLIB_FILES=(
    "${MORPHLIB_DIR}/adddomain.c"
    "${MORPHLIB_DIR}/addninfix.c"
    "${MORPHLIB_DIR}/antepenform.c"
    "${MORPHLIB_DIR}/augment.c"
    "${MORPHLIB_DIR}/beta2rtf.c"
    "${MORPHLIB_DIR}/beta2smarta.c"
    "${MORPHLIB_DIR}/cmpend.c"
    "${MORPHLIB_DIR}/conjstem.c"
    "${MORPHLIB_DIR}/endio.c"
    "${MORPHLIB_DIR}/errormess.c"
    "${MORPHLIB_DIR}/fixacc.c"
    "${MORPHLIB_DIR}/gkstring.c"
    "${MORPHLIB_DIR}/gktoasc.c"
    "${MORPHLIB_DIR}/indkeys.c"
    "${MORPHLIB_DIR}/is_thirdmono.c"
    "${MORPHLIB_DIR}/loadeuph.c"
    "${MORPHLIB_DIR}/markstem.c"
    "${MORPHLIB_DIR}/morphflags.c"
    "${MORPHLIB_DIR}/morphkeys.c"
    "${MORPHLIB_DIR}/morphpath.c"
    "${MORPHLIB_DIR}/morphstrcmp.c"
    "${MORPHLIB_DIR}/new_val.c"
    "${MORPHLIB_DIR}/nextkey.c"
    "${MORPHLIB_DIR}/numovable.c"
    "${MORPHLIB_DIR}/penultform.c"
    "${MORPHLIB_DIR}/pres_redup.c"
    "${MORPHLIB_DIR}/preverb.c"
    "${MORPHLIB_DIR}/preverb2.c"
    "${MORPHLIB_DIR}/preverb3.c"
    "${MORPHLIB_DIR}/retrentry.c"
    "${MORPHLIB_DIR}/setlang.c"
    "${MORPHLIB_DIR}/smk2beta.c"
    "${MORPHLIB_DIR}/sprntGkflags.c"
    "${MORPHLIB_DIR}/standphon.c"
    "${MORPHLIB_DIR}/trimwhite.c"
    "${MORPHLIB_DIR}/ultform.c"
    "${MORPHLIB_DIR}/ulttakescirc.c"
)

declare -a GKLIB_FILES=(
    "${GKLIB_DIR}/Fclose.c"
    "${GKLIB_DIR}/addaccent.c"
    "${GKLIB_DIR}/addbreath.c"
    "${GKLIB_DIR}/aspirate.c"
    "${GKLIB_DIR}/beta_tolower.c"
    "${GKLIB_DIR}/binlook.c"
    "${GKLIB_DIR}/checkaccent.c"
    "${GKLIB_DIR}/cinsert.c"
    "${GKLIB_DIR}/do_dissim.c"
    "${GKLIB_DIR}/endsinstr.c"
    "${GKLIB_DIR}/getaccent.c"
    "${GKLIB_DIR}/getaccp.c"
    "${GKLIB_DIR}/getbreath.c"
    "${GKLIB_DIR}/getquantity.c"
    "${GKLIB_DIR}/getsyll.c"
    "${GKLIB_DIR}/gkstrlen.c"
    "${GKLIB_DIR}/hasaccent.c"
    "${GKLIB_DIR}/hasdiaer.c"
    "${GKLIB_DIR}/hasquant.c"
    "${GKLIB_DIR}/isblank.c"
    "${GKLIB_DIR}/isdiphth.c"
    "${GKLIB_DIR}/issubstring.c"
    "${GKLIB_DIR}/keyio.c"
    "${GKLIB_DIR}/longbyposition.c"
    "${GKLIB_DIR}/naccents.c"
    "${GKLIB_DIR}/normucase.c"
    "${GKLIB_DIR}/nsylls.c"
    "${GKLIB_DIR}/quantprim.c"
    "${GKLIB_DIR}/shortanalog.c"
    "${GKLIB_DIR}/standalpha.c"
    "${GKLIB_DIR}/standword.c"
    "${GKLIB_DIR}/stripacc.c"
    "${GKLIB_DIR}/stripacute.c"
    "${GKLIB_DIR}/stripbreath.c"
    "${GKLIB_DIR}/stripchar.c"
    "${GKLIB_DIR}/stripdiaer.c"
    "${GKLIB_DIR}/stripmeta.c"
    "${GKLIB_DIR}/stripquant.c"
    "${GKLIB_DIR}/stripstemsep.c"
    "${GKLIB_DIR}/stripzeroend.c"
    "${GKLIB_DIR}/strsqz.c"
    "${GKLIB_DIR}/subchar.c"
    "${GKLIB_DIR}/vaxwords.c"
    "${GKLIB_DIR}/xstrings.c"
    "${GKLIB_DIR}/zap2ndbreath.c"
)

WRAPPER="${BUILD_DIR}/morpheus_wrapper.c"

# Combine all into one array
declare -a ALL_FILES=(
    "${ANAL_FILES[@]}"
    "${GENER_FILES[@]}"
    "${GKDICT_FILES[@]}"
    "${GKENDS_FILES[@]}"
    "${MORPHLIB_FILES[@]}"
    "${GKLIB_FILES[@]}"
    "${WRAPPER}"
)

FILE_COUNT=${#ALL_FILES[@]}
echo "Total source files: ${FILE_COUNT}"
echo ""

echo "Compiling with Emscripten..."
echo "This may take several minutes..."
echo ""

EMCC_FLAGS=(
    -O3
    -w
    -Wno-error=return-type
    -Wno-implicit-function-declaration
    -s WASM=1
    -s MODULARIZE=1
    -s EXPORT_NAME="Morpheus"
    -s ALLOW_MEMORY_GROWTH=1
    -s TOTAL_MEMORY=134217728
    -s MAXIMUM_MEMORY=536870912
    -s FILESYSTEM=1
    -s FORCE_FILESYSTEM=1
    -s ENVIRONMENT="web,worker"
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","lengthBytesUTF8","allocate","free"]'
    -s EXPORTED_FUNCTIONS='["_morpheus_init","_morpheus_set_language","_morpheus_analyze","_morpheus_analyze_batch","_morpheus_get_last_error","_morpheus_destroy","_malloc","_free"]'
    --preload-file "${MORPHEUS_STEMLIB_DIR}@/stemlib"
    -I"${MORPHEUS_INCLUDE_DIR}"
    -I"${ANAL_DIR}"
    -I"${GENER_DIR}"
    -I"${GKDICT_DIR}"
    -I"${GKENDS_DIR}"
    -I"${MORPHLIB_DIR}"
    -I"${GKLIB_DIR}"
    -o "${OUTPUT_DIR}/cruncher.js"
)

if emcc "${ALL_FILES[@]}" "${EMCC_FLAGS[@]}" > "${BUILD_DIR}/build.log" 2>&1; then
    echo ""
    echo "=========================================="
    echo "Build successful!"
    echo "=========================================="
    echo ""
    echo "Output files:"
    ls -lh "${OUTPUT_DIR}/cruncher."* 2>/dev/null || true
    echo ""
    echo "WASM module ready: ${OUTPUT_DIR}/cruncher.js"
    echo ""
else
    echo ""
    echo "Build FAILED!"
    echo ""
    echo "=== Last 50 lines of build log: ==="
    tail -50 "${BUILD_DIR}/build.log"
    echo ""
    exit 1
fi

echo "Build complete! (artifacts in ${OUTPUT_DIR})"
