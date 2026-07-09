@echo off
REM Docker build script for Morpheus WASM on Windows
REM This script builds the WASM module using Docker (no Emscripten install needed)

echo ================================
echo Morpheus WASM Docker Builder
echo ================================
echo.

REM Check if Docker is running
docker --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not installed or not running.
    echo Please install Docker Desktop for Windows and start it.
    pause
    exit /b 1
)

REM Navigate to project root (assumes script is in native/morpheus/js/)
cd /d "%~dp0..\..\.."

echo Building Morpheus WASM using Docker...
echo.

REM Build the builder image (no cache to ensure latest Dockerfile changes)
docker-compose -f native/morpheus/js/docker-compose.morpheus.yml build --no-cache morpheus-wasm-builder

if errorlevel 1 (
    echo.
    echo Build failed! Check errors above.
    pause
    exit /b 1
)

echo.
echo Running build container to produce WASM files...
docker-compose -f native/morpheus/js/docker-compose.morpheus.yml run --rm ^
    --no-deps ^
    morpheus-wasm-builder ^
    /build/build-morpheus-wasm.sh /build/output

if errorlevel 1 (
    echo.
    echo Build failed inside container!
    pause
    exit /b 1
)

echo.
echo Build completed successfully!
echo Output files: cruncher.js, cruncher.wasm in public\wasm\
echo.
echo Verifying output...
dir public\wasm\cruncher.* 2>nul || echo WARNING: cruncher.* not found in public\wasm\
echo.
echo To run test server: docker-compose -f native/morpheus/js/docker-compose.morpheus.yml up morpheus-server
echo Then open: http://localhost:8080/test.html
echo.
pause
