#!/usr/bin/env python3
"""Minimal runner for the Python macronizer — reads stdin, writes macronized text to stdout.
   Optional flags: --utov, --itoj, --maius, --nomacrons"""
import sys
import os
import unicodedata

sys.path.insert(0, '/app')

from latin_macronizer.macronizer import Macronizer

domacronize = True
alsomaius = False
performutov = False
performitoj = False

for arg in sys.argv[1:]:
    if arg == '--utov': performutov = True
    elif arg == '--itoj': performitoj = True
    elif arg == '--maius': alsomaius = True
    elif arg == '--nomacrons': domacronize = False

text = sys.stdin.read()
text = unicodedata.normalize('NFC', text)

m = Macronizer()
m.settext(text)
result = m.gettext(domacronize, alsomaius, performutov, performitoj)
sys.stdout.write(result)
