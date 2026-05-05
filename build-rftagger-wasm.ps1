#!/usr/bin/env powershell
# Build script for compiling RFTagger to WebAssembly using Emscripten
# Usage: .\build-rftagger-wasm.ps1

param(
    [string]$BuildType = "Release",
    [string]$OutputDir = "public\wasm",
    [string]$SourceDir = "rftagger\src",
    [string]$ModelFile = "latin_macronizer\rftagger-ldt.model"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "RFTagger WebAssembly Build Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Configuration
$BuildDir = "build-wasm"

# Emscripten flags
$env:EMCC_FORCE_STDLIBS = 1

# Compiler flags based on build type
if ($BuildType -eq "Debug") {
    $OptFlags = "-O0 -g"
} else {
    $OptFlags = "-O3 -flto"
}

$CXXFlags = "$OptFlags -std=c++11 -Wno-deprecated"

# Source files needed for annotation (not training)
$SourceFiles = @(
    "$SourceDir\POSTagger.C",
    "$SourceDir\SuffixLexicon.C",
    "$SourceDir\DataMapping.C",
    "$SourceDir\io.C",
    "$SourceDir\Entry.C",
    "$SourceDir\Lexicon.C",
    "$SourceDir\embind-wrapper.C"
)

# WASM flags
$WASMFlags = @(
    "-s WASM=1",
    "-s MODULARIZE=1",
    "-s EXPORT_NAME='RFTaggerModule'",
    "-s ALLOW_MEMORY_GROWTH=1",
    "-s INITIAL_MEMORY=67108864",
    "-s MAXIMUM_MEMORY=268435456",
    "-s ENVIRONMENT='web,worker'",
    "-s FILESYSTEM=1",
    "-s FORCE_FILESYSTEM=1",
    "-s EXPORTED_RUNTIME_METHODS=['FS','ccall','cwrap']",
    "-s SINGLE_FILE=0",
    "-s USE_ES6_IMPORT_META=0",
    "--bind"
)

# Create directories
if (!(Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir | Out-Null
}
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Write-Host ""
Write-Host "Build Configuration:" -ForegroundColor Yellow
Write-Host "  Build Type: $BuildType"
Write-Host "  Source: $SourceDir"
Write-Host "  Output: $OutputDir"
Write-Host "  Memory: 64MB (initial) / 256MB (max)"
Write-Host ""

# Check for Emscripten
$emcc = Get-Command emcc -ErrorAction SilentlyContinue
if (!$emcc) {
    # Try to find emsdk
    $emsdkPaths = @(
        "$env:USERPROFILE\emsdk\emsdk_env.bat",
        "$env:USERPROFILE\emsdk\emsdk.bat",
        "C:\emsdk\emsdk_env.bat",
        "C:\emsdk\emsdk.bat"
    )
    
    $found = $false
    foreach ($path in $emsdkPaths) {
        if (Test-Path $path) {
            Write-Host "Found Emscripten SDK at: $path" -ForegroundColor Green
            $found = $true
            
            # Try to activate and get environment
            $emsdkDir = Split-Path $path
            Push-Location $emsdkDir
            try {
                $envStr = cmd /c "emsdk_env.bat" 2`>`&1
                # Parse and set environment variables
                $envStr | ForEach-Object {
                    if ($_ -match "^\s*set\s+(\w+)=(.+)$") {
                        $varName = $matches[1]
                        $varValue = $matches[2]
                        [Environment]::SetEnvironmentVariable($varName, $varValue, "Process")
                    }
                }
            } finally {
                Pop-Location
            }
            break
        }
    }
    
    if (!$found) {
        Write-Host "ERROR: Emscripten (emcc) not found!" -ForegroundColor Red
        Write-Host "Please install Emscripten SDK:" -ForegroundColor Red
        Write-Host "  https://emscripten.org/docs/getting_started/downloads.html" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Or activate it with:" -ForegroundColor Yellow
        Write-Host "  cd ~/emsdk" -ForegroundColor Yellow
        Write-Host "  ./emsdk activate latest" -ForegroundColor Yellow
        Write-Host "  ./emsdk_env.bat" -ForegroundColor Yellow
        exit 1
    }
}

# Verify emcc is available now
$emcc = Get-Command emcc -ErrorAction SilentlyContinue
if (!$emcc) {
    Write-Host "ERROR: emcc still not found after setup" -ForegroundColor Red
    exit 1
}

Write-Host "Emscripten version:" -ForegroundColor Green
& emcc --version | Select-Object -First 1
Write-Host ""

# Check for source files
$missingFiles = @()
foreach ($file in $SourceFiles) {
    if (!(Test-Path $file)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "ERROR: Missing source files:" -ForegroundColor Red
    foreach ($file in $missingFiles) {
        Write-Host "  - $file" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Source files to compile:" -ForegroundColor Yellow
foreach ($file in $SourceFiles) {
    Write-Host "  - $file"
}
Write-Host ""

# Compile RFTagger to WebAssembly
Write-Host "Compiling RFTagger to WebAssembly..." -ForegroundColor Cyan
Write-Host "This may take several minutes..." -ForegroundColor Yellow
Write-Host ""

$emccArgs = @()
$emccArgs += $SourceFiles
$emccArgs += $CXXFlags.Split(" ")
$emccArgs += "-I$SourceDir"
$emccArgs += "-DSGI__gnu_cxx"
$emccArgs += $WASMFlags
$emccArgs += "-o"
$emccArgs += "$OutputDir\rftagger.js"

# Build command
$buildLog = "$BuildDir\build.log"

Write-Host "Running: emcc $emccArgs" -ForegroundColor DarkGray
& emcc @emccArgs 2>&1 | Tee-Object -FilePath $buildLog

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Output files:" -ForegroundColor Yellow
    Get-ChildItem "$OutputDir\rftagger.*" | ForEach-Object {
        $size = "{0:N2}" -f ($_.Length / 1KB)
        Write-Host "  $($_.Name): $size KB"
    }
    Write-Host ""
    
    # Copy model file to output directory
    if (Test-Path $ModelFile) {
        Write-Host "Copying model file..." -ForegroundColor Yellow
        Copy-Item $ModelFile $OutputDir -Force
        $modelDest = Join-Path $OutputDir (Split-Path $ModelFile -Leaf)
        Write-Host "Model: $modelDest" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Model file not found at $ModelFile" -ForegroundColor Yellow
        Write-Host "The WASM module compiled but you'll need to provide a .par model file." -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Include rftagger.js in your HTML:" -ForegroundColor White
    Write-Host "     <script src='wasm/rftagger.js'></script>" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Initialize the module:" -ForegroundColor White
    Write-Host "     const module = await RFTaggerModule();" -ForegroundColor Gray
    Write-Host "     const tagger = new module.RFTagger();" -ForegroundColor Gray
    Write-Host "     tagger.loadModel('/wasm/rftagger-ldt.model');" -ForegroundColor Gray
    Write-Host "     const tags = tagger.tagTokens(['Gallia', 'est', 'omnis']);" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "Build failed!" -ForegroundColor Red
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check $buildLog for details" -ForegroundColor Yellow
    exit 1
}
