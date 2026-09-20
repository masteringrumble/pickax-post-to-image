# Pickax Post to Image

A free tool that turns any public Pickax post into a clean, downloadable
PNG image.

Paste a Pickax post URL → generate a polished post graphic → download the PNG.

## What it does

- Takes a public Pickax post URL (e.g. `https://pickax.com/post/######`)
- Tries to import the public post data automatically
- **Limitation:** Pickax does not send CORS headers, so browsers block
  direct page access. When automatic import is blocked, the app says so
  plainly and switches to manual entry: you paste the display name,
  username, post text, timestamp, engagement numbers, and images exactly
  as they appear on the post. Nothing is ever invented — fields left
  blank are simply omitted from the image.
- Renders a clean 1200px-wide graphic on a `<canvas>` (auto-growing
  height, word-wrapped text preserving line breaks/emojis/hashtags,
  attached images with aspect ratio preserved, the supplied Pickax logo
  in the upper-right) and downloads it as `pickax-post-<id>.png`.

Only public information is used. No accounts, no backend, no database,
no analytics — everything runs in your browser.

## Fast import (no typing)

**One-click bookmarklet:** drag the "📥 Pickax → Image" button from the
site to your bookmarks bar. While viewing any Pickax post, click it — the
post opens in the tool with everything filled in. The bookmarklet runs
inside the page you're already viewing (so it sees your logged-in session
too), extracts the public post data from the page itself, and hands it to
the app. No password is stored anywhere and no server is involved.

**Paste the page source:** open the post, press Ctrl+U (Mac:
Cmd+Option+U), copy everything, paste it into the box on the site, and hit
"Import from page source".

Both methods pull the display name, @username, profile picture, post text,
timestamp, attached images, and like/view counts straight from the page.
Anything the page doesn't provide stays empty and is omitted from the
image — nothing is ever invented.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL (usually http://localhost:5173).

## Build

```bash
npm run build
```

Output goes to `dist/`. `npm run preview` serves the production build
locally. The build also copies `dist/index.html` to `dist/404.html` so
refreshing the GitHub Pages site never 404s.

## GitHub Pages deployment

Deployment is automatic via GitHub Actions (`.github/workflows/deploy.yml`):

1. Push to the `main` branch.
2. The workflow installs dependencies, runs `npm run build`, and
   publishes `dist/` to GitHub Pages.
3. The site is served at `https://www.pickax2image.top/` (custom domain;
   Vite `base` is `"./"` so the build works on any host or subpath).

One-time setup in the repo: Settings → Pages → Source: **GitHub Actions**,
Custom domain: `www.pickax2image.top`.

## Share to Instagram Stories

After rendering an image, a **Connect Instagram** button appears next to
Download PNG. Connect once, then **Share to Instagram Story** posts the
rendered image straight to your Story via Instagram's Graph API.

The OAuth flow and API calls run through the Cloudflare worker
(`worker/src/instagram.ts`); the Meta app secret never leaves the worker.
The PNG is staged on the worker for ~10 minutes so Instagram can fetch it,
then deleted.

### One-time setup (site owner)

1. Your Instagram account must be **Business or Creator** (IG app →
   Settings → Account type and tools → Switch to professional account).
2. At [developers.facebook.com](https://developers.facebook.com), create an
   app and add the **Instagram** product (the Instagram API with Instagram
   Login — `graph.instagram.com`).
3. Under the Instagram product's OAuth settings, add this Valid OAuth
   Redirect URI:
   `https://pickax-post-api.masteringrumble.workers.dev/ig/auth/callback`
4. Copy the **App ID** and **App Secret** (App settings → Basic).
5. In the Cloudflare dashboard → Workers & Pages → `pickax-post-api` →
   Settings → Variables and Secrets, add secrets `META_APP_ID` and
   `META_APP_SECRET`, then redeploy the worker.

Your own account works without Meta app review (Standard Access). Tokens are
long-lived (60 days) and refresh automatically when you share.
