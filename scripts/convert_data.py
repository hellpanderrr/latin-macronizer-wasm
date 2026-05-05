#!/usr/bin/env python3
"""
Convert Python data files to JSON for browser use
Usage: python scripts/convert_data.py
"""

import json
import sys
import os

def convert_lemmas():
    """Convert lemmas.py to lemmas.json"""
    print("Converting lemmas.py...")
    
    # Import the Python module
    sys.path.insert(0, 'latin_macronizer')
    import lemmas
    
    # Convert to sorted list for better compression
    lemma_list = [
        {"lemma": k, "frequency": v}
        for k, v in lemmas.lemma_frequency.items()
    ]
    lemma_list.sort(key=lambda x: x["frequency"], reverse=True)
    
    # Save as JSON
    output_path = 'src/data/lemmas.json'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(lemma_list, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"  Saved {len(lemma_list)} lemmas to {output_path}")
    print(f"  Size: {os.path.getsize(output_path) / 1024:.1f} KB")

def convert_endings():
    """Convert macronized_endings.py to endings.json"""
    print("Converting macronized_endings.py...")
    
    sys.path.insert(0, 'latin_macronizer')
    import macronized_endings
    
    # Convert to more compact format
    endings_data = macronized_endings.tag_to_endings
    
    output_path = 'src/data/endings.json'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(endings_data, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"  Saved {len(endings_data)} tag patterns to {output_path}")
    print(f"  Size: {os.path.getsize(output_path) / 1024:.1f} KB")

def convert_meters():
    """Convert meters.py to meters.json"""
    print("Converting meters.py...")
    
    sys.path.insert(0, 'latin_macronizer')
    import meters
    
    # Extract meter data
    meters_data = {
        'hexameter': meters.hexameter if hasattr(meters, 'hexameter') else [],
        'pentameter': meters.pentameter if hasattr(meters, 'pentameter') else [],
        'hendecasyllable': meters.hendecasyllable if hasattr(meters, 'hendecasyllable') else [],
    }
    
    output_path = 'src/data/meters.json'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(meters_data, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"  Saved {len(meters_data)} meters to {output_path}")

def main():
    print("=" * 50)
    print("Data Conversion for Browser Macronizer")
    print("=" * 50)
    
    try:
        convert_lemmas()
        convert_endings()
        convert_meters()
        print("\n✅ All conversions completed successfully!")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
