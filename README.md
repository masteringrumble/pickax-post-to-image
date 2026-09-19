# Pickax Post to Image

A lightweight personal-use tool that converts public Pickax posts into
downloadable PNG images.

Paste a Pickax post URL → generate a polished post graphic → download the PNG.

## What it does

- Takes a public Pickax post URL (e.g. `https://pickax.com/post/707864`)
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
3. The site is served at `https://<your-username>.github.io/pickax-post-to-image/`
   (Vite `base` is set to `/pickax-post-to-image/` for this project path).

One-time setup in the repo: Settings → Pages → Source: **GitHub Actions**.
