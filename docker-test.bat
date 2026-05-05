@echo off
echo Building Docker image for RFTagger test...
docker build -f Dockerfile.test -t rftagger-test .

echo.
echo Creating test input...
echo Gallia> test-input.txt
echo est>> test-input.txt
echo omnis>> test-input.txt
echo puella>> test-input.txt
echo videt>> test-input.txt
echo puerum>> test-input.txt
echo mare>> test-input.txt
echo magnum>> test-input.txt
echo canis>> test-input.txt
echo parvus>> test-input.txt
echo currit>> test-input.txt

echo.
echo Running original RFTagger...
docker run --rm -v "%cd%:/data" rftagger-test -s -q /app/rftagger-ldt.model /data/test-input.txt /data/original-output.txt

echo.
echo Original RFTagger output:
type original-output.txt

echo.
echo Now open test-compare.html in browser to compare with WASM
echo.
pause
