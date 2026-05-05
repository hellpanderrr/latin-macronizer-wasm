# build-morpheus-wasm.ps1
# PowerShell build script for Morpheus WASM (Windows)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Building Morpheus WebAssembly Module" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MorpheusSrcDir = Join-Path $ScriptDir "..\morpheus-master\src"
$MorpheusIncludeDir = Join-Path $MorpheusSrcDir "includes"
$MorpheusStemlibDir = Join-Path $ScriptDir "..\morpheus-master\stemlib"
$OutputDir = Join-Path $ScriptDir "..\public\wasm"
$BuildDir = Join-Path $ScriptDir "build"

# Create directories
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

# Check Emscripten
$emcc = Get-Command emcc -ErrorAction SilentlyContinue
if (-not $emcc) {
    Write-Host "ERROR: Emscripten (emcc) not found!" -ForegroundColor Red
    Write-Host "Please install Emscripten SDK or use Docker." -ForegroundColor Yellow
    exit 1
}

Write-Host "Emscripten version:"
& emcc --version | Select-Object -First 1
Write-Host ""

if (-not (Test-Path $MorpheusSrcDir)) {
    Write-Host "ERROR: Morpheus source not found at $MorpheusSrcDir" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $MorpheusStemlibDir "Latin"))) {
    Write-Host "WARNING: Latin stemlib not found at $MorpheusStemlibDir\Latin" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Creating C wrapper..." -ForegroundColor Cyan
$wrapperContent = @'
#include <gkstring.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <emscripten.h>

#define OUTPUT_BUFFER_SIZE 65536

EMSCRIPTEN_KEEPALIVE
void morpheus_init() {
    setenv("MORPHLIB", "/stemlib", 1);
    set_lang(LATIN);
}

EMSCRIPTEN_KEEPALIVE
void morpheus_set_language(int lang) {
    set_lang(lang);
}

EMSCRIPTEN_KEEPALIVE
int morpheus_analyze(const char* word, char* result_buf, int buf_size, int flags) {
    if (!word || !result_buf || buf_size <= 0) return 0;
    memset(result_buf, 0, buf_size);
    gk_word* gkw = CreatGkword(1);
    if (!gkw) return 0;
    set_workword(gkw, (char*)word);
    set_prntflags(gkw, (PrntFlags)flags);
    char* old_buf = setbuf(stdout, result_buf);
    int rval = checkstring1(gkw);
    if (old_buf) setbuf(stdout, old_buf); else setbuf(stdout, NULL);
    FreeGkword(gkw);
    return rval > 0 ? rval : 0;
}

EMSCRIPTEN_KEEPALIVE
int morpheus_analyze_batch(const char** words, int count, char** results, int buf_size, int flags) {
    if (!words || !results || count <= 0) return 0;
    int success = 0;
    for (int i = 0; i < count; i++) {
        if (morpheus_analyze(words[i], results[i], buf_size, flags) > 0) success++;
    }
    return success;
}

EMSCRIPTEN_KEEPALIVE
const char* morpheus_get_last_error() {
    return "";
}

EMSCRIPTEN_KEEPALIVE
void morpheus_destroy() {
}
'@

$wrapperContent | Out-File -FilePath (Join-Path $BuildDir "morpheus_wrapper.c") -Encoding UTF8

Write-Host "Collecting source files..." -ForegroundColor Cyan

function Find-Sources($dir) {
    Get-ChildItem -Path $dir -Filter *.c -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\index|\\mk|\\exp|\\imain|\\expsuff|\\expend|\\expword' } |
        Select-Object -First 100 -ExpandProperty FullName
}

$analFiles = Find-Sources (Join-Path $MorpheusSrcDir "anal")
$generFiles = Find-Sources (Join-Path $MorpheusSrcDir "gener")
$gkdictFiles = Find-Sources (Join-Path $MorpheusSrcDir "gkdict")
$gkendsFiles = Find-Sources (Join-Path $MorpheusSrcDir "gkends")
$morphlibFiles = Find-Sources (Join-Path $MorpheusSrcDir "morphlib")

$sourceFiles = @()
$sourceFiles += $analFiles
$sourceFiles += $generFiles
$sourceFiles += $gkdictFiles
$sourceFiles += $gkendsFiles
$sourceFiles += $morphlibFiles
$sourceFiles += (Join-Path $BuildDir "morpheus_wrapper.c")

$fileCount = $sourceFiles.Count
Write-Host "Total source files: $fileCount"
Write-Host ""

Write-Host "Compiling with Emscripten..." -ForegroundColor Cyan
Write-Host "This may take several minutes..." -ForegroundColor Yellow
Write-Host ""

$emccArgs = @(
    "-O3"
    "-s WASM=1"
    "-s MODULARIZE=1"
    "-s EXPORT_NAME=Morpheus"
    "-s ALLOW_MEMORY_GROWTH=1"
    "-s TOTAL_MEMORY=134217728"
    "-s MAXIMUM_MEMORY=536870912"
    "-s FILESYSTEM=1"
    "-s FORCE_FILESYSTEM=1"
    "-s ENVIRONMENT=web,worker"
    '-s EXPORTED_RUNTIME_METHODS=["ccall","cwrap","UTF8ToString","stringToUTF8","lengthBytesUTF8","allocate","free"]'
    '-s EXPORTED_FUNCTIONS=["_morpheus_init","_morpheus_set_language","_morpheus_analyze","_morpheus_analyze_batch","_morpheus_get_last_error","_morpheus_destroy","_malloc","_free"]'
    "--preload-file `"$MorpheusStemlibDir@/stemlib`""
    "-I`"$MorpheusIncludeDir`""
    "-o `"$OutputDir\morpheus.js`""
) + $sourceFiles

$logFile = Join-Path $BuildDir "build.log"
& emcc @emccArgs 2>&1 | Tee-Object -FilePath $logFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Output files:" -ForegroundColor Cyan
    Get-ChildItem $OutputDir\morpheus.* | Format-Table Name, Length
    Write-Host ""
    Write-Host "WASM module ready: $OutputDir\morpheus.js" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Include /wasm/morpheus.js in your HTML" -ForegroundColor White
    Write-Host "  2. Use MorpheusTagger class from morpheus_js\MorpheusTagger.js" -ForegroundColor White
    Write-Host "  3. Test with test-morpheus-wasm.html" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "Build FAILED!" -ForegroundColor Red
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check build log: $logFile" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "Build complete!" -ForegroundColor Green
