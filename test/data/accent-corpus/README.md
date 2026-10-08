# Liturgical accent corpus (gold standard for stress output)

Hand-accentuated Latin prose from the Roman Missal (Ordo Missae), used as the
gold standard for the macronizer's stress-accent feature and for
`test/e2e/test-accent-corpus.mjs`.

Source: <https://github.com/gregorio-project/latin-ecclesiastic-accents>
(`corpus/missal/ordo/`), maintained by the Gregorio project with the Abbey of
Solesmes and the Abbey of Flavigny. Documentation is CC0; the liturgical texts
of the corpus are in the public domain.

The accentuation follows the notational rules in that repository's
`doc/accentuation-rules.md` (the rules the stress feature implements). Notes on
using it as gold:

- Words carry only the acute (´), never macrons; compare stress placement, not
  vowel quantity.
- Rubric/heading lines are deliberately left unaccented and are skipped by the
  test (a line with no acute at all is not gold).
- The corpus disagrees with itself in a few places (`Fílii` 22× vs `Filii` 1×,
  `Omnípotens` 3× vs `Omnipotens` 1×); these are recorded in
  `accent-failures-snapshot.json`, not matched.
