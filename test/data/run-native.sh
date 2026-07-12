#!/bin/bash
# Run native RFTagger on problem words inside the container
set -e
echo "omnis" > /tmp/words.txt
echo "lingua" >> /tmp/words.txt
echo "lingua" >> /tmp/words.txt
echo "Matrona" >> /tmp/words.txt
echo "causa" >> /tmp/words.txt
echo "una" >> /tmp/words.txt
echo "altera" >> /tmp/words.txt
echo "gloria" >> /tmp/words.txt
echo "milia" >> /tmp/words.txt
/app/rftagger/rft-annotate -s -q /app/rftagger-ldt.model /tmp/words.txt /tmp/out.txt
cat /tmp/out.txt
