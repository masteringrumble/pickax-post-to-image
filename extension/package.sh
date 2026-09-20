#!/usr/bin/env bash
# Build the store-ready extension zips — one per browser family.
#
#   pickax-post-to-image-chromium-<version>.zip  # Chrome Web Store, Edge Add-ons, Opera addons
#   pickax-post-to-image-firefox-<version>.zip   # Firefox AMO
#   pickax-post-to-image-sources-<version>.zip   # unminified sources (AMO review of minified code)
#
# The two store zips share one codebase (content.js, background.js,
# render-src/). Differences are mechanical:
#   - Chromium: MV3 service worker + offscreen document for rendering.
#   - Firefox:  event-page background (scripts), no "offscreen" permission
#     (unknown to Firefox), rendering via a hidden render.html tab.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
VERSION="$(python3 -c "import json; print(json.load(open('$HERE/manifest.json'))['version'])")"
OUT="$ROOT/dist-ext"
CHROME_ZIP="$OUT/pickax-post-to-image-chromium-$VERSION.zip"
FIREFOX_ZIP="$OUT/pickax-post-to-image-firefox-$VERSION.zip"
SOURCES_ZIP="$OUT/pickax-post-to-image-sources-$VERSION.zip"

rm -rf "$OUT"
mkdir -p "$OUT"

# Validate sources before packaging.
python3 -c "import json; json.load(open('$HERE/manifest.json')); print('manifest.json: valid JSON')"
node --check "$HERE/content.js"
node --check "$HERE/background.js"
[ -f "$HERE/offscreen.html" ] || { echo "missing offscreen.html"; exit 1; }
[ -f "$HERE/render.html" ] || { echo "missing render.html"; exit 1; }
[ -f "$HERE/icons/logo.svg" ] || { echo "missing icons/logo.svg"; exit 1; }
for s in 16 32 48 128; do
  [ -f "$HERE/icons/icon-$s.png" ] || { echo "missing icons/icon-$s.png"; exit 1; }
done

# Bundle the renderers:
#   render-src/offscreen.ts   -> offscreen.js    (Chromium hidden document)
#   render-src/render-page.ts  -> render-page.js  (hidden tab, Firefox + fallback)
"$ROOT/node_modules/.bin/esbuild" "$HERE/render-src/offscreen.ts" \
  --bundle --minify --format=iife --outfile="$HERE/offscreen.js" \
  --log-level=warning
"$ROOT/node_modules/.bin/esbuild" "$HERE/render-src/render-page.ts" \
  --bundle --minify --format=iife --outfile="$HERE/render-page.js" \
  --log-level=warning
node --check "$HERE/offscreen.js"
node --check "$HERE/render-page.js"

# --- Chromium zip (Chrome Web Store, Edge Add-ons, Opera addons) ---
(cd "$HERE" && zip -q -r "$CHROME_ZIP" \
  manifest.json background.js content.js \
  offscreen.html offscreen.js render.html render-page.js icons)
echo "built $CHROME_ZIP"

# --- Firefox zip: event-page background, no offscreen permission ---
FFDIR="$OUT/firefox-stage"
rm -rf "$FFDIR"
mkdir -p "$FFDIR"
cp "$HERE/background.js" "$HERE/content.js" "$HERE/render.html" "$HERE/render-page.js" "$FFDIR/"
cp -r "$HERE/icons" "$FFDIR/icons"
python3 - "$HERE/manifest.json" "$FFDIR/manifest.json" << 'PYEOF'
import json, sys
m = json.load(open(sys.argv[1]))
# Firefox MV3 uses an event page, not a service worker.
m["background"] = {"scripts": ["background.js"]}
# "offscreen" is unknown to Firefox; rendering goes through render.html.
m["permissions"] = [p for p in m.get("permissions", []) if p != "offscreen"]
json.dump(m, open(sys.argv[2], "w"), indent=2, ensure_ascii=False)
open(sys.argv[2], "a").write("\n")
print("firefox manifest.json: valid JSON")
PYEOF
(cd "$FFDIR" && zip -q -r "$FIREFOX_ZIP" \
  manifest.json background.js content.js render.html render-page.js icons)
echo "built $FIREFOX_ZIP"

# --- Sources zip (for AMO review of the minified bundles) ---
SRCDIR="$OUT/sources-stage"
rm -rf "$SRCDIR"
mkdir -p "$SRCDIR"
cp -r "$HERE/render-src" "$SRCDIR/render-src"
mkdir -p "$SRCDIR/src"
cp "$ROOT/src/renderer.ts" "$ROOT/src/types.ts" "$SRCDIR/src/"
cp "$HERE/package.sh" "$SRCDIR/package.sh"
cat > "$SRCDIR/BUILD.txt" << 'EOF'
Pickax Post to Image — extension renderer sources.

The store zips contain two minified bundles built from these sources:
  render-src/offscreen.ts   -> extension/offscreen.js     (Chromium)
  render-src/render-page.ts  -> extension/render-page.js   (Firefox + fallback)

They share render-src/prepare.ts and src/renderer.ts + src/types.ts
(the same renderer the web app at https://www.pickax2image.top/ uses).

Reproduce the bundles with:
  extension/package.sh
which runs:
  esbuild extension/render-src/offscreen.ts \
    --bundle --minify --format=iife --outfile=extension/offscreen.js
  esbuild extension/render-src/render-page.ts \
    --bundle --minify --format=iife --outfile=extension/render-page.js
(esbuild version is pinned in the repo's package.json devDependencies.)
EOF
(cd "$SRCDIR" && zip -q -r "$SOURCES_ZIP" render-src src package.sh BUILD.txt)
echo "built $SOURCES_ZIP"

echo
echo "=== chromium ==="
unzip -l "$CHROME_ZIP"
echo "=== firefox ==="
unzip -l "$FIREFOX_ZIP"
