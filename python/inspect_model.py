#!/usr/bin/env python3
import struct, sys, traceback

def read_uint64(f):
    data = f.read(8)
    if len(data) < 8: raise EOFError
    return struct.unpack('<Q', data)[0]

def read_float(f):
    data = f.read(4)
    if len(data) < 4: raise EOFError
    return struct.unpack('<f', data)[0]

def read_double(f):
    data = f.read(8)
    if len(data) < 8: raise EOFError
    return struct.unpack('<d', data)[0]

def read_string(f):
    chars = []
    while True:
        b = f.read(1)
        if not b or b == b'\x00': return ''.join(chars)
        chars.append(b.decode('latin1'))

def read_uint32(f):
    data = f.read(4)
    if len(data) < 4: raise EOFError
    return struct.unpack('<I', data)[0]

def main():
    model_path = 'public/wasm/rftagger-ldt.model'
    target_words = ['omnis', 'aliam', 'lingua', 'nostra']
    try:
        with open(model_path, 'rb') as f:
            n_tags = read_uint64(f)
            tag_strings = [read_string(f) for _ in range(n_tags)]
            print(f"Tag SymbolTable: {n_tags} tags")
            n_words = read_uint64(f)
            word_strings = [read_string(f) for _ in range(n_words)]
            print(f"Word SymbolTable: {n_words} words")
            word_to_id = {w: i for i, w in enumerate(word_strings)}
            n_entries = read_uint64(f)
            entries = []
            for i in range(n_entries):
                freq = read_float(f)
                n_t = read_uint64(f)
                tags = [(read_uint32(f), read_float(f)) for _ in range(n_t)]
                entries.append((freq, tags))
            print(f"Entries read: {len(entries)}")
            n_priors = read_uint64(f)
            priors = [read_double(f) for _ in range(n_priors)]
            print(f"Priors read: {len(priors)}")
            for word in target_words:
                if word not in word_to_id:
                    print(f"Word '{word}' not found")
                    continue
                wid = word_to_id[word]
                freq, tags = entries[wid]
                print(f"\nWord: {word} (ID {wid}), freq={freq}")
                for tnum, tprob in sorted(tags):
                    tname = tag_strings[tnum] if tnum < len(tag_strings) else "???"
                    prior = priors[tnum] if tnum < len(priors) else float('nan')
                    lexp = tprob / prior if prior > 0 else float('inf')
                    print(f"  tag {tnum} ({tname}): emit={tprob:.6f}, prior={prior:.6f}, lexprob={lexp:.6f}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
