# Pickax Post-Type Audit v2 — pickax-post-to-image

**Date:** 2026-09-24 (evening pass)
**Scope:** Every regular post type reachable via `https://pickax.com/post/######` — the tool's entire supported URL shape — tested through the import (Cloudflare worker `/post` extraction, `worker/src/index.ts`) + render (canvas PNG, `src/renderer.ts renderPostImage`) pipeline, ahead of a public promo.
**Method:** Public feed/API only, no sign-in. Worker extraction run via local esbuild simulation of the exact deployed bundle (now at commit `4ffb053`, which includes the YouTube-embed fix) against real curl-fetched post HTML. Rendering via the real `renderPostImage` with live image fetching and a stubbed canvas/Image.
**Effort:** ~5 hours, three breadth agents + two depth agents. Builds on [POST_TYPE_AUDIT.md](POST_TYPE_AUDIT.md) (v1); does not redo it.

**What's new vs v1:** 99 fresh fixtures (55 feed-crawl + 22 special-hunt + 25 historical samples/edge cases, deduped across files), YouTube embeds found and verified (v1 wrongly said "Rumble only"), Spotify + Apple Podcasts oEmbeds discovered (new unhandled types), Rumble Shorts embeds found, quote-of-article case found, markup sampled quarterly from 2024-07 (post #1) to 2026-09, and the v1 "works" claims re-verified on all-new fixtures.

## Post-type catalog

| # | Type | Example post(s) | Notes |
|---|------|-----------------|-------|
| 1 | Text-only | https://pickax.com/post/730573, https://pickax.com/post/1 ("hello world!", 2024-07-28, oldest post) | |
| 2 | Single post image | https://pickax.com/post/672620, https://pickax.com/post/710273, https://pickax.com/post/8000 (empty-text image post) | Legacy `image` field |
| 3 | Multiple post images (2) | fixtures in `v2-fixtures/feed-crawl.json` | Uses `attachments` array (`type:"image"`) |
| 4 | Multiple post images (3–5) | https://pickax.com/post/745772 (4 images) | Up to 5 found; ~2% of trending |
| 5 | Rumble video embed | https://pickax.com/post/728424, https://pickax.com/post/758447 (user's), https://pickax.com/post/755581 | Escaped `\u003Ciframe` oEmbed in all eras |
| 6 | Rumble Shorts embed | https://pickax.com/post/596538, https://pickax.com/post/167979 | `rumble.com/shorts/…` → oEmbed; v1 missed this flavor |
| 7 | YouTube video embed | https://pickax.com/post/758588 (user's), https://pickax.com/post/164644 (Live URL), https://pickax.com/post/749396 (timestamped) | Fixed 2026-09-24 (commit `4ffb053`); `i.ytimg.com` thumbnails. v1 wrongly said "Rumble only" |
| 8 | YouTube embed inside article | https://pickax.com/post/521149 (inline iframe), https://pickax.com/post/45921 (anchor-wrapped) | `<iframe src="youtube.com/embed/…">` in article body |
| 9 | Spotify embed | https://pickax.com/post/176163 (track), https://pickax.com/post/739931 (artist) | NEW type; `open.spotify.com/embed/…`; currently unhandled |
| 10 | Apple Podcasts embed | https://pickax.com/post/395769 (show), https://pickax.com/post/748462 (episode) | NEW type; `embed.podcasts.apple.com`; currently unhandled |
| 11 | Native video upload | https://pickax.com/post/753296 (3 videos), https://pickax.com/post/756851 (portrait, 38s), https://pickax.com/post/752631, https://pickax.com/post/747932 | `/video/trending` API; renders text-only today |
| 12 | Link card (shared website) | https://pickax.com/post/706574 (pickax.shop), https://pickax.com/post/93619 (Substack), https://pickax.com/post/759176 (Breitbart), https://pickax.com/post/726967 (USA Today) | `youtu.be` links render as plain OG cards (738137), not embeds |
| 13 | Quote post | https://pickax.com/post/747517 → 745975 | |
| 14 | Quote of article | https://pickax.com/post/100 → article 99, https://pickax.com/post/7036 → article 7035 | Quoted card renders empty (Fix #4) |
| 15 | Nested quote (depth 2–3) | https://pickax.com/post/747756 → 747517 → 745975 (depth 2) | Depth-3 exists but rare (2 found in ~1,800 posts); none deeper observed |
| 16 | Article | https://pickax.com/post/716654, https://pickax.com/post/752979 (~6.8k chars), https://pickax.com/post/4500 | Mostly a verified-user feature; title/timestamp/views dropped (Fix #2) |
| 17 | Long text | https://pickax.com/post/672620 (850 chars) | Composer hard-caps at 1000 chars — truly longer regular posts don't exist |
| 18 | No-avatar author | https://pickax.com/post/260000 (`user.avatar=null`), https://pickax.com/post/758350 | Renders placeholder; handled |
| 19 | Deleted / bogus post | https://pickax.com/post/50000, https://pickax.com/post/999999999 | 404 byte-identical to never-existed IDs; worker → `{"error":"not-found"}` → manual-entry fallback |

Not found on Pickax: polls, audio posts, youtube-nocookie embeds, YouTube Shorts embeds, quote nesting deeper than 3.

## Works / broken matrix (by type)

| Type | Import (extraction) | Render | Notes |
|------|---------------------|--------|-------|
| Text-only | ✅ | ✅ | Re-verified on new fixtures; post #1 (2024) extracts cleanly |
| Single image | ✅ | ✅ | All eras; weird filenames (space + U+202F, post 99) handled |
| Multiple images | ✅ | ✅ | 2/3/4/5-image fixtures extract correct counts; 2×2 grid, aspects kept |
| Rumble video (current thumbs) | ✅ | ✅ | 728424, 755581, 758447: thumbnail + title + play button |
| Rumble video (old `1a-1791.com` thumbs) | ❌ thumbnail null | ⚠️ placeholder player | Fix #1: 11983, 95731, 2500, 3500, 80000, 85000 |
| Rumble Shorts | ✅ | ✅ | 596538, 167979 |
| YouTube embed (watch/Live/timestamped) | ✅ (fixed 4ffb053) | ✅ | 758588, 164644, 749396 — thumbnails verified downloadable |
| YouTube embed (article inline) | ✅ video; ❌ timestamp/views | ✅ | 521149 — article-view markup gap, not an embed gap |
| YouTube embed (anchor-wrapped, 2nd iframe) | ❌ first-match-wins | ⚠️ wrong video | 45921 — extractor takes the earlier Rumble iframe; Fix #5 |
| Spotify embed | ❌ video null | ⚠️ imageless card | Fix #3: 176163, 739931 — oEmbed `thumbnail_url` (spotifycdn) never mapped |
| Apple Podcasts embed | ❌ dropped | ⚠️ imageless card | Fix #3b: 395769, 748462 — oEmbed `thumbnail_url` (mzstatic) never mapped |
| Native video | ❌ video dropped | ❌ text-only | Fix #1b (v1 #1): 756851, 741776, 757040, 755772, 753296, 753756 |
| Link card (with preview image) | ✅ | ✅ | Domain+title+image; re-verified across 10+ domains |
| Link card (no preview image) | ✅ | ✅ | 274937 (supremecourt.gov): card renders text-only; faithful |
| youtu.be plain card | ✅ | ✅ | 738137: correctly NOT treated as embed |
| Quote post | ✅ | ✅ | Re-verified on new fixtures |
| Quote of article | ❌ quoted text empty + title dropped | ⚠️ empty quoted card | Fix #4: 100, 7036 |
| Nested quote (depth 2–3) | ✅ | ✅ | Verified with PNG inspection; avatars/timestamps/badges correct |
| Article | ⚠️ title/timestamp/views dropped | ✅ (renders long post) | Fix #2: 716654, 4944, 99, 675064, 752979, 723242, 713099, 4500 |
| Long text (≤1000 chars) | ✅ | ✅ | No overflow; longest real article 6.8k chars hits canvas cap → downscales per design |
| No-avatar author | ✅ | ✅ | Placeholder avatar; handled |
| Deleted / bogus post | ✅ graceful | N/A | |

## Works / broken matrix (by age bracket)

Markup sampled quarterly 2024-07 → 2026-09 (`v2-fixtures/historical.json`). Core `__NUXT_DATA__` devalue schema (`id/content/createdAt/user/attachments/link/repostOf`), avatar markup, byline classes, time `<span title>`, link-card payload keys, quote nesting, and `img.pickax.com` CDN are **unchanged since post #1** — extraction is era-proof for standard posts.

| Era | Verdict | Notes |
|-----|---------|-------|
| 2024-07 → 2025-12 | ✅ standard posts; ❌ old Rumble thumbs | Pre-~Sep-2026 Rumble thumb host was `1a-1791.com` (not `*.cdn.rumble.cloud`) → thumbnail null (Fix #1). The "pre-Sep-2026 literal iframe" hypothesis is FALSE — all video posts back to 2024-10 use the escaped oEmbed form |
| 2026-01 → 2026-09 | ✅ standard posts | Current markup matches extraction assumptions, except the 3 gaps below |
| All eras | ❌ hyphenated usernames | `[\w.]` regexes miss `-` → timestamp/timeAgo null (Fix #6, e.g. 260000 @FloatingOnSmiles-Fos) |
| All eras | ⚠️ spurious imageless linkCard on video posts | `post.link` = oEmbed dict → `linkCard{imageUrl:''}` in payload; renderer masks it (`o.showLinkCard && !data.video`) so PNGs are correct, but the payload/extension data contract carries junk (Fix #7) |

## Fix list (prioritized)

### 1. Old Rumble video thumbnails → null (HIGH — affects all pre-~Sep-2026 Rumble posts)
`extractVideoThumbnail` only matches `*.cdn.rumble.cloud` literals and literal `"thumbnail_url":"…"` strings. Old posts serve thumbnails from `https://1a-1791.com/video/…jpg` and the oEmbed `thumbnail_url` is a devalue slot reference (`"thumbnail_url":35`), not a literal string. The URL is recoverable from the devalue slots — current code never resolves it.
- Fixtures: https://pickax.com/post/11983, https://pickax.com/post/95731, https://pickax.com/post/2500, https://pickax.com/post/3500, https://pickax.com/post/80000, https://pickax.com/post/85000
- Evidence: pages literally contain the `1a-1791.com` JPEG (verified 1920×1080, loads fine); `video.thumbnail` comes back null → render falls back to placeholder player.
- Fix: resolve devalue slot references for `thumbnail_url`; match any `1a-1791.com`/`*.cdn.rumble.cloud` host.

### 2. Native video uploads render as text-only (HIGH — v1 #1, still broken)
Worker and nuxtPost both ignore the `__NUXT_DATA__` post node's `videos[]` array (`{preview, previewWidth/Height, videoWidth/Height, durationSeconds, viewCount}`; poster = `https://img.pickax.com/<preview>`). `video=null`, `images=[]` → text-only render, video silently dropped.
- Fixtures: https://pickax.com/post/756851 (portrait 720×1280, 38s), https://pickax.com/post/741776 (480×854), https://pickax.com/post/757040 (1080×1920), https://pickax.com/post/755772 (41.7s), https://pickax.com/post/753296 (3 videos — SSR shows only the first), https://pickax.com/post/753756 (1280×1152)
- Fix: native-video payload variant (poster URL + duration + dimensions); `.mp4` is client-fetched on play and can never be embedded. Watch ~11 MB posters (renderer downscale).

### 3. Spotify + Apple Podcasts embeds dropped (MEDIUM — NEW types v1 missed)
Spotify: `open.spotify.com/embed/…` iframe unmatched → `video: null`; produces imageless `linkCard{url, title, domain, imageUrl:''}`. Apple Podcasts: `embed.podcasts.apple.com` iframe likewise dropped → imageless card. Both pages carry an oEmbed `thumbnail_url` (spotifycdn / mzstatic) that is never mapped. Pickax ships dedicated embed CSS for Spotify (`iframe[src^="https://open.spotify.com/embed/track/"]{height:80px}`) — these are first-class embeds on the platform.
- Fixtures: https://pickax.com/post/176163, https://pickax.com/post/739931 (Spotify); https://pickax.com/post/395769, https://pickax.com/post/748462 (Apple Podcasts)
- Fix: extend the YouTube-style oEmbed handling (commit `4ffb053` pattern) to Spotify/Apple; map `thumbnail_url` to the card/player preview.

### 4. Quote-of-article renders an empty quoted card (MEDIUM — NEW)
When quoting an article, `repostOf` has `content:""` (body not inlined) with only `title` + `image`; extraction maps empty text and drops the title → quoted card shows avatar+name+timestamp with no text.
- Fixtures: https://pickax.com/post/100 (→ article 99), https://pickax.com/post/7036 (→ article 7035)
- Fix: fall back to the quoted article's `title` when `content` is empty (same root fix as #5).

### 5. Article posts lose title, timestamp, views (MEDIUM — v1 #2, still broken)
The NUXT payload has `isArticle` + `title` + `createdAt`; the worker maps none of them. Title exists in `og:title` too. Timestamp regex needs a `@username` anchor that article bylines lack; on article *reading-view* pages (e.g. 99) there is no standard byline at all.
- Fixtures: https://pickax.com/post/716654, https://pickax.com/post/4944, https://pickax.com/post/99, https://pickax.com/post/675064, https://pickax.com/post/752979, https://pickax.com/post/723242, https://pickax.com/post/713099, https://pickax.com/post/4500
- Fix: map NUXT `title` for `isArticle` posts (render as headline); fall back to NUXT `createdAt` when the DOM time regex misses.

### 6. Hyphenated usernames lose timestamp/timeAgo (LOW — any era)
`timeMatch`/`handleMatch` use `[\w.]` — no `-`.
- Fixture: https://pickax.com/post/260000 (@FloatingOnSmiles-Fos)
- Fix: add `-` to the character class.

### 7. Spurious imageless linkCard in worker payload on video posts (LOW — payload-level)
Since ~2025 (Rumble; YouTube since ≥2024-10) `post.link` points at the video oEmbed (`type:"video"`, no `image` key) → extractor emits `linkCard{url: watch page, imageUrl:''}` alongside `video`. The site renders no link card; the renderer already suppresses it (`o.showLinkCard && !data.video` in renderer.ts) so PNGs are correct — but the extension consumes the payload directly and sees junk.
- Fixtures: https://pickax.com/post/3000, https://pickax.com/post/80000, https://pickax.com/post/85000, https://pickax.com/post/650000, https://pickax.com/post/164644, https://pickax.com/post/749396
- Fix: skip link-card extraction when `post.link.type === "video"` (or when a video was extracted).

### 8. Multi-iframe posts: first-match-wins can pick the wrong video (LOW)
Article https://pickax.com/post/45921 has a Rumble iframe before the YouTube iframe; the extractor takes the first recognized iframe. Synthetic test proved anchor-wrapping itself extracts fine — it's ordering, not the anchor. (The Rumble thumb there is null because the page genuinely carries no Rumble thumbnail URL — missing data, not an extractor bug.)
- Fix: prefer YouTube/Rumble matches with resolvable thumbnails, or extract all iframes and pick the best.

### 9. Quoted text null when the quoting page omits it (LOW — v1 #3, still open, design decision)
https://pickax.com/post/742139 → quoted 742087: quoting page's `repostOf` has `content:''`. Fixing requires fetching the quoted post's own page.

## Side observations
- **Privacy flag:** the public feed payload's `mostEngagementComment` object includes the commenter's **email address in plaintext** — exposed to any anonymous API caller. Not the tool's bug, but worth telling Pickax.
- **Post length cap:** the composer hard-caps at 1000 characters, so "very long" regular posts don't exist; only articles run long (longest found: ~6.8k chars, hits the 16384px canvas cap and downscales per design).
- **Link rot is graceful:** 126499's link-card image 404s at source; the card renders without it, no crash.
- **Public API surface used:** `api.pickax.com/post/trending?page=N&postsOnly=true`, `articlesOnly=true`, `/video/trending?page=N`, `/post/find/{id}`, `/post/search?search=<term>&filter=articles&page=N` — all unauthenticated.
- **Worker reachability:** the live `workers.dev` subdomain still intermittently returns empty replies from this VM (curl exit 52); all v2 testing used local simulation of the deployed bundle, unaffected.

## Fixture inventory
- `audit/v2-fixtures/feed-crawl.json` — 55 fixtures, 15 types (3–5 each)
- `audit/v2-fixtures/special-hunt.json` — 22 fixtures (YouTube variants, native videos, articles, link cards, Spotify)
- `audit/v2-fixtures/historical.json` — 17 quarterly era samples (2024-07→2026-09) + 8 edge cases
- `audit/v2-fixtures/depth-feed.json` — 57 per-fixture extraction+render results
- `audit/v2-fixtures/depth-special.json` — 42 per-fixture extraction+render results
- User fixtures verified: https://pickax.com/post/758447 (Rumble, works), https://pickax.com/post/758588 (YouTube, works — fix verified)
