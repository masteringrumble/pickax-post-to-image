#!/usr/bin/env bash
# Build the store-ready extension zip.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
VERSION="$(python3 -c "import json; print(json.load(open('$HERE/manifest.json'))['version'])")"
OUT="$ROOT/dist-ext"
ZIP="$OUT/pickax-post-to-image-extension-$VERSION.zip"

rm -rf "$OUT"
mkdir -p "$OUT"

# Validate manifest before packaging.
python3 -c "import json; json.load(open('$HERE/manifest.json')); print('manifest.json: valid JSON')"
node --check "$HERE/content.js"
node --check "$HERE/background.js"
for s in 16 32 48 128; do
  [ -f "$HERE/icons/icon-$s.png" ] || { echo "missing icons/icon-$s.png"; exit 1; }
done

# Zip layout: files at top level, exactly what the stores expect.
(cd "$HERE" && zip -q -r "$ZIP" manifest.json background.js content.js icons)
echo "built $ZIP"
unzip -l "$ZIP"
