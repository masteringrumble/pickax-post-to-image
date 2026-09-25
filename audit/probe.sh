#!/bin/bash
# Probe a pickax post ID: HTTP status, size, key markup markers.
# Usage: ./probe.sh <postid> [outfile]
ID="$1"
OUT="${2:-/tmp/pickax_$ID.html}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
CODE=$(curl -sS -o "$OUT" -w "%{http_code}" -A "$UA" --max-time 25 "https://pickax.com/post/$ID")
SZ=$(wc -c < "$OUT")
NUXT=$(grep -c 'id="__NUXT_DATA__"' "$OUT" 2>/dev/null)
LITIFRAME=$(grep -c '<iframe' "$OUT" 2>/dev/null)
ESCIFRAME=$(grep -c 'u003Ciframe\|u003ciframe' "$OUT" 2>/dev/null)
RUMBLEEMB=$(grep -c 'rumble.com/embed' "$OUT" 2>/dev/null)
IMGC=$(grep -c 'img.pickax.com' "$OUT" 2>/dev/null)
AV=$(grep -c 'rounded-full' "$OUT" 2>/dev/null)
OGD=$(grep -o '<meta[^>]*property="og:description"[^>]*' "$OUT" 2>/dev/null | head -c 200)
echo "id=$ID http=$CODE size=$SZ nuxt=$NUXT litiframe=$LITIFRAME esciframe=$ESCIFRAME rumble=$RUMBLEEMB imgcdn=$IMGC roundedfull=$AV"
echo "og:desc: $OGD" | head -c 400; echo
sleep 2
