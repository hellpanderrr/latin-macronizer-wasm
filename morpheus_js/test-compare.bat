@echo off
chcp 65001 >nul

echo ==========================================
echo Building original Morpheus cruncher...
echo ==========================================
docker-compose -f morpheus_js\docker-compose.compare.yml build

echo.
echo ==========================================
echo Testing with original cruncher:
echo ==========================================

REM Create temp file with test words
echo puellam > morpheus_js\testwords.txt
echo Gallia >> morpheus_js\testwords.txt
echo est >> morpheus_js\testwords.txt
echo omnis >> morpheus_js\testwords.txt
echo divisa >> morpheus_js\testwords.txt

REM Run cruncher with test words (type command for Windows)
type morpheus_js\testwords.txt | docker-compose -f morpheus_js\docker-compose.compare.yml run --rm -T morpheus-compare -L

del morpheus_js\testwords.txt

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
