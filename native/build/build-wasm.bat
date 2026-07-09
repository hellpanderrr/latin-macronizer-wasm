@echo off
REM Build RFTagger to WebAssembly
REM Requires: Emscripten SDK (emsdk) installed and activated

setlocal EnableDelayedExpansion

echo ==========================================
echo RFTagger WebAssembly Build
echo ==========================================
echo.

REM Check for emcc
where emcc >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: emcc not found in PATH
    echo.
    echo Please install and activate Emscripten:
    echo   git clone https://github.com/emscripten-core/emsdk.git
    echo   cd emsdk
    echo   emsdk install latest
    echo   emsdk activate latest
    echo   emsdk_env.bat
    echo.
    exit /b 1
)

echo Emscripten found:
emcc --version | findstr /B "emcc"
echo.

REM Directories
set SOURCE_DIR=rftagger\src
set OUTPUT_DIR=public\wasm
set MODEL_FILE=latin_macronizer\rftagger-ldt.model

if not exist %OUTPUT_DIR% mkdir %OUTPUT_DIR%

REM Source files for annotation-only build
set SOURCES=%SOURCE_DIR%\POSTagger.C %SOURCE_DIR%\SuffixLexicon.C %SOURCE_DIR%\DataMapping.C %SOURCE_DIR%\io.C %SOURCE_DIR%\Entry.C %SOURCE_DIR%\Lexicon.C %SOURCE_DIR%\embind-wrapper.C

echo Source files:
echo  - POSTagger.C
echo  - SuffixLexicon.C
echo  - DataMapping.C
echo  - io.C
echo  - Entry.C
echo  - Lexicon.C
echo  - embind-wrapper.C
echo.

REM Compiler flags (maximum optimization)
set CXXFLAGS=-O3 -std=c++17 -Wno-deprecated -I%SOURCE_DIR% -D__EMSCRIPTEN__ -DNDEBUG

REM Emscripten flags (32-bit WASM with 2GB max)
set EMFLAGS=-s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME="RFTaggerModule" -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=268435456 -s MAXIMUM_MEMORY=2147483648 -s ENVIRONMENT="web,worker" -s FILESYSTEM=1 -s FORCE_FILESYSTEM=1 -s EXPORTED_RUNTIME_METHODS=["FS","HEAPU8","wasmMemory"] -s SINGLE_FILE=1 -s ASSERTIONS=1 --bind --no-entry

REM Output
set OUTPUT=%OUTPUT_DIR%\rftagger.js

echo Compiling to WebAssembly...
echo This may take a few minutes...
echo.

emcc %SOURCES% %CXXFLAGS% %EMFLAGS% -o %OUTPUT%

if %ERRORLEVEL% neq 0 (
    echo.
    echo ==========================================
    echo Build FAILED
    echo ==========================================
    exit /b 1
)

echo.
echo ==========================================
echo Build SUCCESSFUL
echo ==========================================
echo.
echo Output files:
dir /b %OUTPUT_DIR%\rftagger.*
echo.

REM Copy model file if exists
if exist %MODEL_FILE% (
    echo Copying model file...
    copy /Y %MODEL_FILE% %OUTPUT_DIR%\ >nul
    echo Model: %OUTPUT_DIR%\rftagger-ldt.model
    echo.
)

echo Usage:
echo   const module = await RFTaggerModule();
echo   const tagger = new module.RFTagger();
echo   tagger.loadModel('/wasm/rftagger-ldt.model');
echo   const tags = tagger.tagTokens(['Gallia', 'est', 'omnis']);
echo.
