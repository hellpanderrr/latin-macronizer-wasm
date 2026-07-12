#!/usr/bin/env python3
import struct, random

with open('public/wasm/rftagger-ldt.model', 'rb') as f:
    data = f.read()

# Scan every 8 bytes — but skip the first 8 bytes (magic) and stop early if we see
# patterns. Let's be smarter: unpack in one big batch using array
import array
d = array.array('d')
d.frombytes(data[8:])

# These are doubles that decode to values in [0,1] + clean near-zero ones
probs = [v for v in d if 0.0 <= v <= 1.0]
print(f'Total doubles in [0,1]: {len(probs):,}')
print(f'Total doubles in file: {len(d):,}')
print(f'Min: {min(probs):.10f}  Max: {max(probs):.10f}')
print(f'Mean: {sum(probs)/len(probs):.10f}')

near0 = sum(1 for v in probs if v < 0.01)
near1 = sum(1 for v in probs if v > 0.99)
print(f'\nNear 0 (<0.01):     {near0:>8d} ({100*near0/len(probs):.2f}%)')
print(f'Middle (0.01-0.99): {len(probs)-near0-near1:>8d} ({100*(len(probs)-near0-near1)/len(probs):.2f}%)')
print(f'Near 1 (>0.99):     {near1:>8d} ({100*near1/len(probs):.2f}%)')

sorted_vals = sorted(probs, reverse=True)
print(f'\nTop 10 values:')
for i in range(10):
    print(f'  {i+1}: {sorted_vals[i]:.6f}')

def q_u8(p):  return round(p * 255) / 255.0
def q_u16(p): return round(p * 65535) / 65535.0

for label, fn in [('uint8', q_u8), ('uint16', q_u16)]:
    errs = [abs(v - fn(v)) for v in probs]
    lvls = 2**8 if label == 'uint8' else 2**16
    print(f'\n--- {label} ({lvls} levels) ---')
    print(f'  Max error:  {max(errs):.10f}  (theoretical worst: 1/{lvls//2} = {1/(lvls//2):.6f})')
    print(f'  Mean error: {sum(errs)/len(errs):.10f}')
    s = sorted(errs)[int(len(errs)*0.95)]
    s2 = sorted(errs)[int(len(errs)*0.99)]
    print(f'  95th: {s:.6f}  99th: {s2:.6f}')

# Argmax: 578 trees, pick random leaf per tree, see if quant flips winner
random.seed(42)
for label, fn in [('float32', lambda p: struct.unpack("<f", struct.pack("<f", p))[0]),
                  ('uint16', q_u16), ('uint8', q_u8)]:
    changed = 0
    trials = 50000
    n_trees = 578
    block = len(probs) // n_trees
    for _ in range(trials):
        picks = [probs[random.randrange(t*block, min((t+1)*block, len(probs)))] for t in range(n_trees)]
        orig_max = max(range(n_trees), key=lambda i: picks[i])
        quant_max = max(range(n_trees), key=lambda i: fn(picks[i]))
        if orig_max != quant_max:
            changed += 1
    print(f'\n{label} argmax changes: {changed}/{trials} ({100*changed/trials:.2f}%)')

print(f'\n--- Size of leaf probability data ---')
print(f'  double: {len(probs)*8:,} B  ({len(probs)*8/1024/1024:.1f} MB)')
print(f'  float:  {len(probs)*4:,} B  ({len(probs)*4/1024/1024:.1f} MB)')
print(f'  uint16: {len(probs)*2:,} B  ({len(probs)*2/1024/1024:.1f} MB)')
print(f'  uint8:  {len(probs):,} B    ({len(probs)/1024/1024:.1f} MB)')
print(f'  Total file: 12,949,296 B (12.9 MB)')
print(f'  Leaf probs as double: {100*len(probs)*8/12949296:.0f}% of file')
print(f'  Non-prob overhead:    {12949296 - len(probs)*8:,} B ({100-100*len(probs)*8/12949296:.0f}% of file)')
