# WASM vs Original Morpheus Comparison

## Quick Start

### Option 1: Batch file (Windows)
```cmd
cd native/morpheus/js
test-compare.bat
```

### Option 2: Python script
```bash
cd native/morpheus/js
python compare_results.py
```

### Option 3: Manually via Docker
```bash
# Build image
docker-compose -f docker-compose.compare.yml build

# Test a single word
echo "puellam" | docker-compose -f docker-compose.compare.yml run --rm morpheus-compare -L

# Test multiple words
echo -e "puellam\nGallia\nest" | docker-compose -f docker-compose.compare.yml run --rm morpheus-compare -L
```

## Original output format

```
word
<NL>N lemma ending case number gender</NL>
```

Example:
```
puellam
<NL>N puella a_ae fem acc sg</NL>
```

## Comparison with WASM

1. Run `test-compare.bat` — you'll see the original output
2. Open `test-morpheus-wasm.html` in a browser
3. Enter the same words
4. Compare results:
   - Lemmas should match
   - Parts of speech should match
   - Case/number/gender should match

## Expected results

| Word | Original | WASM |
|-------|----------|------|
| puellam | puella (noun, acc, sg, fem) | puella (noun, acc, sg, fem) ✓ |
| Gallia | Gallia (noun, nom, sg, fem) + others | Should match |
| est | sum/edo (verb) | Should match |

## Files

- `Dockerfile.compare` — image for the original cruncher
- `docker-compose.compare.yml` — compose config
- `test-compare.bat` — Windows batch script
- `compare_results.py` — Python script for comparison
