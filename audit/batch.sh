#!/bin/bash
# Batch: curl a list of IDs, run analyzer, print one-line summary each.
cd ~/workspace/pickax-post-to-image/audit
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for ID in "$@"; do
  F="/tmp/batch_p$ID.html"
  CODE=$(curl -sS -o "$F" -w "%{http_code}" -A "$UA" --max-time 25 "https://pickax.com/post/$ID")
  if [ "$CODE" = "200" ]; then
    node /tmp/pickax-analyze.cjs "$F" "$ID" 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
f=d.get('fields') or {}
r=d.get('raw') or {}
print('$ID', 'ok', (f.get('createdAtISO') or '?')[:10], '|user:'+str(f.get('username')), '|txt:'+str(f.get('textLen')), '|img:'+str(len(f.get('images') or [])), '|vid:'+str(bool(f.get('video'))), '|link:'+str(bool(f.get('linkCard'))), '|q:'+str(bool(f.get('quoted'))), '|vbadge:'+str(f.get('verified')), '|picks:'+str(f.get('picks')), '|axes:'+str(f.get('axes')), '|litifr:'+str(r.get('literalIframeCount')), '|escifr:'+str(r.get('escapedIframeCount')))
"
  else
    echo "$ID http=$CODE"
  fi
  sleep 2
done
