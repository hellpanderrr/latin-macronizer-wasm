#!/bin/sh

echo "Transducer compilation ..."
./update-indices.perl wordclass.fst
fst-compiler wordclass.fst wordclass.a
fst-print wordclass.a | ./convert-automaton.perl > wordclass.txt
echo "compilation finished"
