@echo off
chcp 65001 >nul

echo ==========================================
echo Building original Morpheus cruncher...
echo ==========================================
docker-compose -f native/morpheus/js\docker-compose.compare.yml build

echo.
echo ==========================================
echo Testing with original cruncher:
echo ==========================================

REM Create temp file with test words
echo puellam > native/morpheus/js\testwords.txt
echo Gallia >> native/morpheus/js\testwords.txt
echo est >> native/morpheus/js\testwords.txt
echo omnis >> native/morpheus/js\testwords.txt
echo divisa >> native/morpheus/js\testwords.txt

REM Run cruncher with test words (type command for Windows)
type native/morpheus/js\testwords.txt | docker-compose -f native/morpheus/js\docker-compose.compare.yml run --rm -T morpheus-compare -L

del native/morpheus/js\testwords.txt

echo.
echo ==========================================
echo Now test with WASM in browser:
echo ==========================================
echo Open test-morpheus-wasm.html and compare outputs
echo.
echo Expected format from original:
echo   word
echo   ^<NL^>N lemma ending ...^</NL^>
echo.
echo Words to test: puellam, Gallia, est, omnis, divisa
pause
