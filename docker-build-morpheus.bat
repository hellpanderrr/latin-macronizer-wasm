@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo Building Morpheus WASM via Docker (Windows)
echo ==========================================
echo.

rem Get project root (directory where this script is located)
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PROJECT_ROOT=%SCRIPT_DIR%"

rem Convert Windows path to Unix-style (forward slashes) for Docker
set "PROJECT_ROOT_UNIX=%PROJECT_ROOT:\=/%"

echo Project root: %PROJECT_ROOT%
echo Unix-style path: %PROJECT_ROOT_UNIX%
echo.

rem Create output directory
if not exist "%PROJECT_ROOT%\public\wasm" (
    mkdir "%PROJECT_ROOT%\public\wasm"
    echo Created output directory: %PROJECT_ROOT%\public\wasm
) else (
    echo Output directory exists: %PROJECT_ROOT%\public\wasm
)

echo.
echo Step 1: Building Docker image and copying WASM files...
echo.

docker-compose -f "%PROJECT_ROOT%\morpheus_js\docker-compose.morpheus.yml" run --rm morpheus-wasm-builder

if errorlevel 1 (
    echo.
    echo [ERROR] Build failed! Check Docker output for errors.
    echo.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] WASM files built and copied to public/wasm/
echo.

rem Check if files were created
if exist "%PROJECT_ROOT%\public\wasm\cruncher.wasm" (
    echo Found cruncher.wasm
) else (
    echo [WARNING] cruncher.wasm not found in output directory
)

if exist "%PROJECT_ROOT%\public\wasm\cruncher.js" (
    echo Found cruncher.js
) else (
    echo [WARNING] cruncher.js not found in output directory
)

echo.
echo Step 2: Starting test server? (optional)
echo.

set /p START_SERVER="Start test server on http://localhost:8080 ? (Y/N): "

if /i "%START_SERVER%"=="Y" (
    echo.
    echo Starting test server... Press Ctrl+C to stop.
    echo.
    docker-compose -f "%PROJECT_ROOT%\morpheus_js\docker-compose.morpheus.yml" up morpheus-server
) else (
    echo.
    echo To test later, run: docker-compose -f morpheus_js/docker-compose.morpheus.yml up morpheus-server
    echo.
    echo Or open test-morpheus-wasm.html directly in browser (may need local server).
)

echo.
echo Done.
pause
