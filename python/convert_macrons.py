#!/usr/bin/env python3
"""
Convert macrons.txt to indexedDB format
Input: macrons.txt (33MB wordlist)
Output: wordlist.json or pipe to .txt with format: wordform|tag|macronized|lemma
"""

import sys
import json
import re

def parse_macrons_line(line):
    """Parse a line from macrons.txt"""
    line = line.strip()
    if not line or line.startswith('#'):
        return None
    
    # Expected format varies, try common patterns
    # Pattern 1: wordform<TAB>tag<TAB>macronized<TAB>lemma
    parts = line.split('\t')
    if len(parts) >= 3:
        return {
            'wordform': parts[0].strip(),
            'tag': parts[1].strip(),
            'macronized': parts[2].strip(),
            'lemma': parts[3].strip() if len(parts) > 3 else parts[0].strip()
        }
    
    # Pattern 2: wordform|macronized|lemma|tag
    parts = line.split('|')
    if len(parts) >= 3:
        return {
            'wordform': parts[0].strip(),
            'macronized': parts[1].strip(),
            'lemma': parts[2].strip(),
            'tag': parts[3].strip() if len(parts) > 3 else '---------'
        }
    
    return None

def convert_to_pipe_format(input_file, output_file, max_entries=None):
    """Convert macrons.txt to pipe-delimited format for IndexedDB"""
    entries = []
    count = 0
    
    with open(input_file, 'r', encoding='utf-8') as f:
        for line in f:
            parsed = parse_macrons_line(line)
            if parsed:
                # Format: wordform|tag|macronized|lemma
                entry = f"{parsed['wordform']}|{parsed['tag']}|{parsed['macronized']}|{parsed['lemma']}"
                entries.append(entry)
                count += 1
                
                if max_entries and count >= max_entries:
                    break
                
                if count % 10000 == 0:
                    print(f"Processed {count} entries...", file=sys.stderr)
    
    # Write output
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(entries))
    
    print(f"Converted {count} entries to {output_file}", file=sys.stderr)
    return count

def convert_to_json(input_file, output_file, max_entries=None):
    """Convert to JSON format (smaller for demo)"""
    entries = []
    count = 0
    
    with open(input_file, 'r', encoding='utf-8') as f:
        for line in f:
            parsed = parse_macrons_line(line)
            if parsed:
                entries.append(parsed)
                count += 1
                
                if max_entries and count >= max_entries:
                    break
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=None)
    
    print(f"Converted {count} entries to JSON {output_file}", file=sys.stderr)
    return count

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Convert macrons.txt to IndexedDB format')
    parser.add_argument('input', help='Input macrons.txt file')
    parser.add_argument('output', help='Output file')
    parser.add_argument('--format', choices=['pipe', 'json'], default='pipe',
                        help='Output format (pipe: word|tag|mac|lemma, json: array)')
    parser.add_argument('--max', type=int, help='Maximum entries to convert (for testing)')
    
    args = parser.parse_args()
    
    if args.format == 'pipe':
        convert_to_pipe_format(args.input, args.output, args.max)
    else:
        convert_to_json(args.input, args.output, args.max)
