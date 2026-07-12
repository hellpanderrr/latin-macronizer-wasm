#!/usr/bin/env python3
"""Compare TS and Python macronizer outputs character by character."""
import re, sys
from collections import Counter

# Read the pasted outputs
with open('test/data/py-output-full.txt', 'r', encoding='utf-8') as f:
    py_text = f.read().strip()
with open('test/data/ts-output-full.txt', 'r', encoding='utf-8') as f:
    ts_text = f.read().strip()

# Strip chapter/verse markers like "[1] 1 ", "[2] 3 " etc.
def strip_markers(s):
    return re.sub(r'\[\d+\]\s*\d+\s*', '', s)

py_clean = strip_markers(py_text)
ts_clean = strip_markers(ts_text)

# Find minimum length for comparison
min_len = min(len(py_clean), len(ts_clean))
max_len = max(len(py_clean), len(ts_clean))

# Character comparison
total_chars = 0
matching = 0
macron_diffs = []  # (pos, py_char, ts_char, context)
other_diffs = []
length_diff = abs(len(py_clean) - len(ts_clean))

for i in range(min_len):
    pc = py_clean[i]
    tc = ts_clean[i]
    total_chars += 1

    if pc == tc:
        matching += 1
        continue

    if ('Ā' <= pc <= 'ų' or 'Ḍ' <= pc <= 'ẛ' or pc in 'āēīōūȳĀĒĪŌŪȲ' or
        'Ā' <= tc <= 'ų' or 'Ḍ' <= tc <= 'ẛ' or tc in 'āēīōūȳĀĒĪŌŪȲ'):
        # Extract context window
        start = max(0, i-30)
        end = min(len(py_clean), i+30)
        ctx = py_clean[start:end].replace('\n', '↵')
        if start > 0: ctx = '…' + ctx
        if end < len(py_clean): ctx += '…'

        # Find containing word
        word_start = py_clean.rfind(' ', 0, i)
        word_end = py_clean.find(' ', i)
        if word_start < 0: word_start = 0
        else: word_start += 1
        if word_end < 0: word_end = len(py_clean)
        py_word = py_clean[word_start:word_end]
        ts_word = ts_clean[word_start:min(word_end, len(ts_clean))]

        macron_diffs.append({
            'pos': i,
            'py': pc, 'ts': tc,
            'py_word': py_word,
            'ts_word': ts_word
        })
    else:
        other_diffs.append((i, pc, tc))

# Group macron diffs by word pair
word_diff_counter = Counter()
word_diff_examples = {}
for d in macron_diffs:
    key = (d['py_word'], d['ts_word'])
    word_diff_counter[key] += 1
    if key not in word_diff_examples:
        word_diff_examples[key] = d

print(f"=== COMPARISON SUMMARY ===")
print(f"Py length:  {len(py_clean)}")
print(f"TS length:  {len(ts_clean)}")
print(f"Length diff: {length_diff}")
print(f"Chars compared: {total_chars}")
print(f"Exact match: {matching}/{total_chars} = {matching/total_chars*100:.2f}%")
print(f"Macron diffs: {len(macron_diffs)}")
print(f"Other diffs:  {len(other_diffs)}")

if other_diffs:
    print(f"\n=== NON-MACRON DIFFS (first 20) ===")
    for i, pc, tc in other_diffs[:20]:
        start = max(0, i-10)
        ctx = py_clean[start:i+10].replace('\n','↵')
        print(f"  [{i}] py='{pc}' ts='{tc}'  ctx='{ctx}'")

print(f"\n=== MACRON DIFFS BY WORD PAIR (top 50) ===")
for (py_word, ts_word), count in word_diff_counter.most_common(50):
    d = word_diff_examples[(py_word, ts_word)]
    print(f"  {count:3d}x  Py='{py_word}'  →  TS='{ts_word}'")

print(f"\nUnique word-pair diffs: {len(word_diff_counter)}")

# Word-level accuracy
py_words = re.findall(r'[a-zA-ZāēīōūȳĀĒĪŌŪȲ]+', py_clean)
ts_words = re.findall(r'[a-zA-ZāēīōūȳĀĒĪŌŪȲ]+', ts_clean)
word_match = sum(1 for pw, tw in zip(py_words, ts_words) if pw == tw)
print(f"\nPy words: {len(py_words)}")
print(f"TS words: {len(ts_words)}")
if min(len(py_words), len(ts_words)) > 0:
    print(f"Word match: {word_match}/{min(len(py_words), len(ts_words))} = {word_match/min(len(py_words), len(ts_words))*100:.1f}%")
