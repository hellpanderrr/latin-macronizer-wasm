#!/bin/sh
# Run inside rftagger-native container
/app/rftagger/rft-annotate -s -q /app/rftagger-ldt.model /data/prob-sent.txt /data/prob-out.txt 2>/dev/null
cat /data/prob-out.txt
