#!/bin/bash
set -e
cd morpheus-master

# Fix duplicate symbols (same as WASM and Docker builds)
rm -f src/gkends/indexendtables.c src/greeklib/sprntGkflags.c
sed -i '/^sprntGkflags\.o/d' src/greeklib/makefile || true
sed -i 's/indexendtables\.o //' src/gkends/makefile || true

# Build libraries and cruncher
cd src
make -C greeklib
make -C morphlib
make -C gkends gkends.a
make -C gkdict
make -C gener
make -C anal cruncher

# Copy compiled cruncher to /usr/local/bin
cp anal/cruncher /usr/local/bin/cruncher
chmod +x /usr/local/bin/cruncher
echo "Morpheus cruncher successfully built and installed in WSL!"
