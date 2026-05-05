#!/usr/bin/env python3
"""
Compare WASM Morpheus output with original cruncher output
"""

import subprocess
import json
import sys

def run_original_cruncher(words):
    """Run original cruncher in Docker and get output"""
    # Build first
    build_result = subprocess.run(
        ['docker-compose', '-f', 'docker-compose.compare.yml', 'build'],
        capture_output=True,
        text=True
    )
    if build_result.returncode != 0:
        print("Build failed:", build_result.stderr)
        return None

    # Run cruncher
    input_text = '\n'.join(words) + '\n'
    result = subprocess.run(
        ['docker-compose', '-f', 'docker-compose.compare.yml', 'run', '--rm', 'morpheus-compare', '-L'],
        input=input_text,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print("Cruncher failed:", result.stderr)
        return None

    return result.stdout

def parse_cruncher_output(output):
    """Parse cruncher output into structured format"""
    lines = output.strip().split('\n')
    results = {}

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # Check if this is a word (not <NL>...)
        if not line.startswith('<NL>'):
            word = line.lower()
            if i + 1 < len(lines):
                nl_line = lines[i + 1].strip()
                if '<NL>' in nl_line:
                    # Extract analyses
                    analyses = []
                    for nl in nl_line.split('<NL>'):
                        nl = nl.replace('</NL>', '').strip()
                        if nl:
                            analyses.append(nl)
                    results[word] = analyses
                    i += 2
                    continue
        i += 1

    return results

def main():
    test_words = ['puellam', 'Gallia', 'est', 'omnis', 'divisa']

    print("Comparing WASM vs Original cruncher...")
    print("=" * 60)

    # Get original output
    print("Running original cruncher in Docker...")
    original_output = run_original_cruncher(test_words)
    if not original_output:
        print("Failed to run original cruncher")
        return 1

    print("\nOriginal cruncher output:")
    print("-" * 60)
    print(original_output)
    print("-" * 60)

    original_parsed = parse_cruncher_output(original_output)

    print("\nParsed results from original:")
    for word, analyses in original_parsed.items():
        print(f"  {word}: {len(analyses)} analysis(es)")
        for a in analyses[:3]:  # Show first 3
            print(f"    - {a[:80]}...")

    print("\n" + "=" * 60)
    print("Now open test-morpheus-wasm.html and compare.")
    print("WASM should produce same lemma and morphological info.")

    return 0

if __name__ == '__main__':
    sys.exit(main())
