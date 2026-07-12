#!/usr/bin/env python3
"""Export the Python macronizer's lemma tables to JSON for the TS port.

Reads python/lemmas.py (lemma_frequency, word_lemma_freq,
wordform_to_corpus_lemmas) and writes src/data/lemma-data.json as:

    { "lemmaFrequency": { lemma: freq },
      "corpus": { wordform: [[lemma, word_lemma_freq], ...] } }

The corpus lists preserve wordform_to_corpus_lemmas order — Python's
addlemmas() iterates them in order and keeps the FIRST maximum.
"""
import importlib.util
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEMMAS_PY = os.path.join(ROOT, 'python', 'lemmas.py')
OUT_JSON = os.path.join(ROOT, 'src', 'data', 'lemma-data.json')

spec = importlib.util.spec_from_file_location('lemmas', LEMMAS_PY)
lemmas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lemmas)

missing = 0
corpus = {}
for wordform, corpus_lemmas in lemmas.wordform_to_corpus_lemmas.items():
    pairs = []
    for lemma in corpus_lemmas:
        freq = lemmas.word_lemma_freq.get((wordform, lemma))
        if freq is None:
            missing += 1
            freq = 0
        pairs.append([lemma, freq])
    corpus[wordform] = pairs

data = {
    'lemmaFrequency': lemmas.lemma_frequency,
    'corpus': corpus,
}

with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

print(f'lemmaFrequency: {len(lemmas.lemma_frequency)} lemmas')
print(f'corpus: {len(corpus)} wordforms')
if missing:
    print(f'WARNING: {missing} (wordform, lemma) pairs missing from word_lemma_freq', file=sys.stderr)
print(f'wrote {OUT_JSON} ({os.path.getsize(OUT_JSON)} bytes)')
