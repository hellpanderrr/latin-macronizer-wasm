# build-wasm.ps1
# PowerShell build script for RFTagger WebAssembly compilation
# Usage: .\build-wasm.ps1

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Building RFTagger WebAssembly Module" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Create output directory
$OutputDir = "public/wasm"
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Check if Emscripten is available
$emccPath = (Get-Command emcc -ErrorAction SilentlyContinue).Source
if ($emccPath) {
    Write-Host "Emscripten found, compiling RFTagger to WASM..." -ForegroundColor Green
    
    $emccArgs = @(
        "native/rftagger/src/embind-wrapper.C",
        "native/rftagger/src/rft-annotate.C",
        "native/rftagger/src/io.C",
        "native/rftagger/src/DataMapping.C",
        "native/rftagger/src/SuffixLexicon.C",
        "native/rftagger/src/POSTagger.C",
        "native/rftagger/src/Lexicon.C",
        "native/rftagger/src/Entry.C",
        "-O3",
        "-s WASM=1",
        "-s MODULARIZE=1",
        "-s EXPORT_NAME=RFTagger",
        "-s ALLOW_MEMORY_GROWTH=1",
        "-s TOTAL_MEMORY=67108864",
        "-s FILESYSTEM=1",
        "-s ENVIRONMENT='web,worker'",
        "-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']",
        "-o public/wasm/rftagger.js"
    )
    
    & emcc $emccArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Build complete!" -ForegroundColor Green
        Get-ChildItem $OutputDir | Format-Table Name, Length
    } else {
        Write-Host "Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Emscripten not found!" -ForegroundColor Red
    Write-Host "Please install Emscripten SDK:" -ForegroundColor Yellow
    Write-Host "  https://emscripten.org/docs/getting_started/downloads.html" -ForegroundColor Yellow
    Write-Host "" 
    Write-Host "Or use Docker:" -ForegroundColor Yellow
    Write-Host "  docker-compose up wasm-builder" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Include public/wasm/rftagger.js in your HTML" -ForegroundColor White
Write-Host "  2. Initialize: const tagger = await RFTagger();" -ForegroundColor White
Write-Host "  3. Load model: await tagger.load_model();" -ForegroundColor White
Write-Host "  4. Tag text: const tags = tagger.tag_tokens(tokens);" -ForegroundColor White
