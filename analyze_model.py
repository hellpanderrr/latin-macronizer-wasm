#!/usr/bin/env python3
import struct

with open('latin_macronizer/rftagger-ldt.model', 'rb') as f:
    data = f.read(128)

print('=== First 128 bytes hex dump ===')
for i in range(0, 128, 16):
    hex_part = ' '.join(f'{b:02X}' for b in data[i:i+16])
    ascii_part = ''.join(chr(b) if 32 <= b < 127 else '.' for b in data[i:i+16])
    print(f'{i:04X}: {hex_part}  {ascii_part}')

print('\n=== Size analysis ===')
print(f'First 8 bytes as LE uint64: {struct.unpack("<Q", data[:8])[0]}')
print(f'First 4 bytes as LE uint32: {struct.unpack("<I", data[:4])[0]}')
print(f'Bytes 4-8 as LE uint32: {struct.unpack("<I", data[4:8])[0]}')

# Check various positions for size_t patterns
print('\n=== Potential size_t at offset 0 ===')
val_32 = struct.unpack('<I', data[0:4])[0]
val_64 = struct.unpack('<Q', data[0:8])[0]
print(f'As uint32: {val_32}')
print(f'As uint64: {val_64}')

if val_32 == 60 or val_32 == 59 or val_32 == 61:
    print(f'  -> Looks like tag count (uint32): {val_32}')
elif val_64 == 60 or val_64 == 59 or val_64 == 61:
    print(f'  -> Looks like tag count (uint64): {val_64}')
