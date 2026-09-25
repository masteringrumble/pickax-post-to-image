# Pickax Post to Image

A free tool that turns any public Pickax post into a clean, downloadable
PNG image.

**Live site:** https://www.pickax2image.top/

Paste a Pickax post URL → the post is imported automatically → customize
with the "Show in image" toggles → download the PNG.

## Browser extension

Skip the site entirely — do it right on the Pickax page:

- **Chrome / Edge / Brave / Opera:**
  https://chromewebstore.google.com/detail/ailpedkkcffcdjkimccmhgimfefgdppl
- **Firefox (desktop & Android):**
  https://addons.mozilla.org/en-US/firefox/addon/pickax-post-to-image/

Click the toolbar button on any Pickax page to enter picker mode: hover a
post card to highlight it, click it, and an options panel pops up right on
the page with a live preview and the same "Show in image" toggles as the
website. Download renders the final PNG — everything happens inside the
extension, the site never opens. Esc cancels.

Extension source, build/test/packaging docs, and the privacy policy live
in [`extension/`](extension/) (see `extension/README.md`,
`extension/PRIVACY.md`, `extension/STORE_LISTING.md`).

## How importing works

**Paste a post URL (automatic).** The site sends the URL to a Cloudflare
Worker (`https://api.pickax2image.top/post?url=…`) that fetches the public
post page server-side — where Pickax's missing CORS headers don't apply —
and returns clean JSON: display name, @username, avatar, full post text,
timestamp, views/picks/axes/comments, verified badge, attached images,
video thumbnails, link cards, and quoted posts. The form fills itself in.

**Manual entry (fallback).** If the worker can't read a post (private,
deleted, or temporarily unavailable), the app says so plainly and you can
fill in the fields yourself: display name, username, post text, timestamp,
engagement numbers, and images, exactly as they appear on the post.
Nothing is ever invented — fields left blank are simply omitted from the
image.

**Legacy bookmarklet.** Older versions of the site offered a "Pickax →
Image" bookmarklet that opens the app with the post data in a `#import=`
URL hash. That hash is still honored, so existing bookmarklets keep
working, but the site no longer advertises it — the worker import and the
extension cover it.

Only public post information is ever used. No accounts, no logins, no
database.

## The image

- Rendered on `<canvas>` at 1200px wide with auto-growing height.
- Full post text, word-wrapped, preserving line breaks, emojis, and
  hashtags — never truncated.
- Attached images keep their aspect ratio; avatars are never stretched.
- Pickax logo in the upper-right; footer shows the post URL and
  `www.pickax2image.top`.
- Downloads as `pickax-post-<id>.png`. Very long posts are scaled to fit
  the 16384px canvas limit.

## Architecture

- **Frontend:** React + Vite static site, served by **Cloudflare Pages**
  (project `pickax-post-to-image`, unlimited bandwidth) at
  `https://www.pickax2image.top/`. The apex domain 301-redirects to www.
  DNS is on Cloudflare.
- **Backend:** Cloudflare Worker `pickax-post-api` on the custom domain
  `api.pickax2image.top`:
  - `GET /post?url=<pickax-post-url>` — server-side post extraction.
  - `GET /img?url=<image-url>` — CORS proxy so avatars and post images
    load in the browser (img.pickax.com sends no CORS headers).
  - Edge cache rules sit in front: successful `/post` responses cached
    5 minutes, `/img` responses 7 days — repeat views never re-invoke the
    worker. Errors are never cached. A per-IP rate limit (40 requests /
    10 seconds) throttles abusers.
- **Analytics:** Google Analytics on the site, with the owner's own
  visits excluded via an internal-traffic filter.
- **Fallbacks:** the worker's `workers.dev` URL stays live as a backup,
  and the old GitHub Pages build still serves at
  `https://masteringrumble.github.io/pickax-post-to-image/` (Vite `base`
  is `"./"` so one build works on every host).

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL (usually http://localhost:5173).

## Build & test

```bash
npm run build   # output goes to dist/
npm run preview # serve the production build locally
npm test        # unit + smoke tests
```

The build also copies `dist/index.html` to `dist/404.html` so refreshing
a deep link never 404s on static hosts.

## Deployment

**Primary — Cloudflare Pages.** Build, then upload `dist/` with the
direct-upload script (no wrangler needed):

```bash
npm run build
python3 ~/workspace/skills/cloudflare/bin/deploy_pages.py pickax-post-to-image dist
```

The `www.pickax2image.top` custom domain is attached to the Pages
project; `pickax-post-to-image.pages.dev` works too.

**Fallback — GitHub Pages.** `.github/workflows/deploy.yml` still builds
`dist/` and publishes to GitHub Pages on every push to `main`, keeping
the old `masteringrumble.github.io/pickax-post-to-image/` URL alive.
Repo one-time setup: Settings → Pages → Source: **GitHub Actions**.

## Privacy

- The worker fetches only public post pages. It stores nothing about
  you and needs no login.
- The site keeps everything in your browser; the only network calls are
  to the worker (post data / images) and Google Analytics.
- The extension's data practices are documented in
  [`extension/PRIVACY.md`](extension/PRIVACY.md) — same story: public
  post data only, fetched through the worker, nothing stored.
