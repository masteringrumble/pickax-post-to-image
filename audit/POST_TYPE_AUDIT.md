# Pickax Post-Type Audit — pickax-post-to-image

**Date:** 2026-09-24
**Scope:** Every regular post type on Pickax.com tested through the tool's import (Cloudflare worker `/post` extraction) + render (canvas PNG) pipeline, before a public promo.
**Method:** Public feed/API only, no sign-in. Worker extraction run via local simulation of the exact deployed bundle (`worker/src/index.ts` @ commit 15feca5) against real fetched post HTML. Rendering via `src/renderer.ts` `renderPostImage` with real image fetching (node, dimension probing) and a recording canvas stub.

## Post-type catalog

| # | Type | Example post(s) | Notes |
|---|------|-----------------|-------|
| 1 | Text-only | https://pickax.com/post/730573 | |
| 2 | Single post image | https://pickax.com/post/672620, https://pickax.com/post/710273 | |
| 3 | Multiple post images | https://pickax.com/post/745772 (4 images) | Genuinely rare: 1 of 47 trending posts (~2%) |
| 4 | Rumble video embed | https://pickax.com/post/728424, https://pickax.com/post/707864 | Only 2 found in feed Sep 16–24 |
| 5 | Native video upload | https://pickax.com/post/753296, https://pickax.com/post/752631, https://pickax.com/post/747932 | `/video/trending` API |
| 6 | Link card (shared website) | https://pickax.com/post/706574 (pickax.shop), https://pickax.com/post/710273 | |
| 7 | Quote post | https://pickax.com/post/747517 → https://pickax.com/post/745975 | |
| 8 | Nested quote (quote of a quote) | https://pickax.com/post/747756 → 747517 → 745975 | |
| 9 | Article | https://pickax.com/post/716654 | `isArticle`, has title |
| 10 | Long text | https://pickax.com/post/672620 (850 chars) | Longest found in trending |
| 11 | Ads in feed | `ad_254_5` (mygoldguy.com) | Not real posts; out of scope |

Not found on Pickax: polls, audio posts, Spotify/YouTube embeds (only Rumble video embeds observed).

## Works / broken matrix

| Type | Import (extraction) | Render | Notes |
|------|---------------------|--------|-------|
| Text-only | ✅ | ✅ | 730573: avatar+text+engagement, 2400×1134, no overflow |
| Single image | ✅ | ✅ | 672620, 710273 + 18 more found: image loads, aspect kept |
| Multiple images | ✅ | ✅ | 745772 (4 imgs): all loaded, 2×2 grid 540×405 each, aspects kept, no overflow |
| Rumble video | ✅ (fixed 2026-09-24) | ✅ | 728424: thumbnail 1097×617, aspect kept; link card correctly suppressed on video posts |
| Native video | ❌ extraction drops video | ❌ renders text-only | Posters available server-side (see Fix #1); renderer needs downscale for ~11 MB posters; multi-video posts: only 1st renders in SSR |
| Link card | ✅ | ✅ | 706574, 710273: domain+title+preview image; preview excluded from post images |
| Quote post | ✅ | ✅ | 4/5 chains field-for-field correct; 742139's quoted text is null because the quoting page omits it (see Fix #3) |
| Nested quote | ✅ | ✅ | 747756: quotedDepth=2, both levels verified against the quoted posts' own pages |
| Article | ⚠️ title/timestamp/views dropped | ✅ (renders as long post) | 716654: 3310 chars → 2400×11530, no title/timestamp/views (see Fix #2) |
| Deleted / bogus post | ✅ graceful | N/A | worker → 404 `{"error":"not-found"}` → site shows manual-entry fallback |

## Edge cases

- **Canvas cap:** synthetic 56k-char post → 285×16384, scaled down per design (repo's documented behavior). Longest real post found (905 chars) renders at 2400×5416 — cap not hit in practice.
- **Image proxy dependency:** `img.pickax.com` sends no CORS headers → in browsers ALL avatars/post images/link images load via the worker `/img` proxy (verified: no `access-control-allow-origin` on img.pickax.com). Rumble CDN thumbnails send `access-control-allow-origin: *` → load directly. If the worker is down, the tool degrades to text-only output.
- **Worker reachability:** `pickax-post-api.masteringtherumble.workers.dev` intermittently returns empty replies (curl exit 52) from the QA VM while `api.cloudflare.com` works and the script is confirmed deployed — likely a local egress/proxy quirk, not a worker outage.

## Fix list (prioritized)

### 1. Native video uploads render as text-only (HIGH)
Worker `extractVideo()` only handles Rumble oEmbed iframes; native uploads are dropped entirely (`payload.video` null, poster not folded into `images`). Verified on 3 real posts: https://pickax.com/post/753296, https://pickax.com/post/752631, https://pickax.com/post/747932.
- The data IS available server-side: the `__NUXT_DATA__` post object carries a `videos` array (`{id, preview, previewWidth, previewHeight, videoWidth, videoHeight, durationSeconds, viewCount, postId}`); full poster URL = `https://img.pickax.com/<preview>`. Verified reachable (HTTP 200, image/png), e.g. `https://img.pickax.com/user-44076/video-14093/1790248483065-a0e9817b-3b1b-4ecf-b12a-f8a42050844b.png`. The stream `.mp4` URL is fetched client-side on play and is NOT in the page — the tool can only ever show the poster, never a playable video.
- Payload needs a native-video variant (poster URL, duration, dimensions) since `src` can never be populated. The existing `/img` proxy allowlist already covers `img.pickax.com`, so no infra change needed.
- Edge cases: post 753296 has 3 videos in NUXT data but SSR renders only the first — fix must decide first-vs-all. Posters can be ~11 MB (portrait 1090×1920) — renderer needs downscale handling.

### 2. Article posts lose title, timestamp, and views (MEDIUM)
Two real article-layout posts verified: https://pickax.com/post/716654 ("PROBLEM? Group Shoutouts & Welcome Parties") and https://pickax.com/post/742087 ("Elon is Afraid").
- **Title dropped:** payload has no `title` field. The title is in the page's `<title>`/`og:title` AND in a `title` slot in `__NUXT_DATA__` (with an `isArticle` flag) — the worker maps neither. Article renders as a title-less long text post.
- **Timestamp/views null:** the worker's time regex requires `@user</a><span title="…">`, but article bylines render as plain `<span>Name</span>` with no `@username` anchor, so `timestamp`/`timeAgo`/`views` all come back null even though the ISO `createdAt` is available in NUXT_DATA and could be used as fallback.
- Fix: map NUXT `title` for `isArticle` posts (render as headline); fall back to NUXT `createdAt` when the DOM time regex misses.

### 3. Quoted text can be null when the quoting page omits it (LOW)
Quote https://pickax.com/post/742139 → quoted 742087: the quoting page's `__NUXT_DATA__` `repostOf` node has `content: ''`, so the worker's `quoted.text` is null (the real quoted text is 861 chars). Everything else about the quote (author, avatar, verified, timestamp) extracts correctly. Fixing would require fetching the quoted post's own page — a design decision, not a regex bug. All other quote checks passed, including the nested chain 747756→747517→745975 (depth-2 verified field-for-field).
- Note: quoted posts' *images* are intentionally not carried in the `quoted` payload (product decision: "Quote posts: no attached images, only the two profile pictures" — commit e004b8b). Only the null *text* is a gap.

### 4. Worker is load-bearing for ALL images (ARCHITECTURE NOTE)
`img.pickax.com` sends no CORS headers (verified), so in browsers every avatar/post image/link image loads via the worker `/img` proxy. Rumble CDN thumbnails send `Access-Control-Allow-Origin: *` and load directly. If the worker is down, the tool degrades to text-only output — worth a fallback message in the UI rather than silently imageless renders.

