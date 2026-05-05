# docker-build.ps1
# Build Morpheus WASM using Docker on Windows

param(
    [string]$ProjectRoot = (Resolve-Path "..\..").Path
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Building Morpheus WASM via Docker (Windows)" -ForegroundColor Cyan
Write