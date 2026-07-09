@echo off
chcp 65001 >nul
echo Comparing WASM vs Original RFTagger...
echo.

set MODEL=latin_macronizer\rftagger-ldt.model
set BINARY=rftagger\bin\rft-annotate

REM Create test file
echo Gallia > test-words.txt
echo est >> test-words.txt
echo omnis >> test-words.txt

echo Running original RFTagger...
echo.
"%BINARY%" -s -q "%MODEL%" test-words.txt original-output.txt

echo Original output:
type original-output.txt
echo.

REM Cleanup
del test-words.txt 2>nul
del original-output.txt 2>nul

echo Compare with WASM output in browser.
pause
