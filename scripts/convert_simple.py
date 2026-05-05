#!/usr/bin/env python3
"""Simple conversion without importing latin_macronizer modules"""

import json
import re
import os

def extract_dict_from_py(filename, varname):
    """Extract a dictionary from Python file by parsing text"""
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find the variable assignment
    pattern = rf'{varname}\s*=\s*(\{{.*?\}})\n\w+'
    match = re.search(pattern, content, re.DOTALL)
    
    if not match:
        # Try simpler pattern - just get until next variable
        start = content.find(f'{varname} = ')
        if start == -1:
            return {}
        
        brace_start = content.find('{', start)
        # Count braces to find matching close
        count = 0
        for i, c in enumerate(content[brace_start:]):
            if c == '{':
                count += 1
            elif c == '}':
                count -= 1
                if count == 0:
                    dict_str = content[brace_start:brace_start+i+1]
                    break
    else:
        dict_str = match.group(1)
    
    # Parse as Python literal
    try:
        import ast
        return ast.literal_eval(dict_str)
    except:
        print(f"Failed to parse {varname}")
        return {}

def convert_lemmas():
    print("Converting lemmas.py...")
    
    lemma_freq = extract_dict_from_py(
        'latin_macronizer/lemmas.py', 
        'lemma_frequency'
    )
    
    lemma_list = [
        {"lemma": k, "frequency": v}
        for k, v in lemma_freq.items()
    ]
    lemma_list.sort(key=lambda x: x["frequency"], reverse=True)
    
    os.makedirs('src/data', exist_ok=True)
    with open('src/data/lemmas.json', 'w', encoding='utf-8') as f:
        json.dump(lemma_list, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"  Saved {len(lemma_list)} lemmas")
    print(f"  Size: {os.path.getsize('src/data/lemmas.json') / 1024:.1f} KB")

def convert_endings():
    print("Converting macronized_endings.py...")
    
    endings = extract_dict_from_py(
        'latin_macronizer/macronized_endings.py',
        'tag_to_endings'
    )
    
    with open('src/data/endings.json', 'w', encoding='utf-8') as f:
        json.dump(endings, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"  Saved {len(endings)} tag patterns")
    print(f"  Size: {os.path.getsize('src/data/endings.json') / 1024:.1f} KB")

if __name__ == '__main__':
    print("=" * 50)
    print("Data Conversion")
    print("=" * 50)
    
    try:
        convert_lemmas()
        convert_endings()
        print("\n✅ Done!")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
