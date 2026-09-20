# Store listing copy + publishing checklist

## Listing copy (all stores)

**Name:** Pickax Post to Image

**Tagline / short description (≤132 chars):**
> Turn any Pickax post into a clean, shareable image — right from the post itself.

**Detailed description:**
> Pickax Post to Image converts any public Pickax post into a polished,
> shareable image that matches the look of Pickax itself.
>
> HOW IT WORKS
> 1. Install the extension and browse pickax.com as usual.
> 2. Click the toolbar button: the page enters picker mode — hover any post
>    and it lights up with a blue highlight; click it.
> 3. An options panel pops up right on the page with a live preview and the
>    same "Show in image" choices as the website: Logo, Views, Post images,
>    Site embed, Picks & axes (each shown only when the post has that
>    content). The preview updates as you flip toggles. Hit Download PNG
>    and the image saves to your device. Press Esc to leave picker
>    mode. The website never opens.
> 4. Share the image anywhere.
>
> PRIVACY
> No accounts, no analytics, no tracking. The extension reads the post only
> on your device and only when you click the button; the image is rendered
> in your browser and saved to your downloads. Post images that block
> cross-site loading are fetched through our own image proxy (which stores
> nothing). Full policy:
> https://github.com/masteringrumble/pickax-post-to-image/blob/main/extension/PRIVACY.md
>
> The companion web tool is free and open source:
> https://github.com/masteringrumble/pickax-post-to-image

**Category:** Social & Communication (Chrome/Edge/Opera) · Social (Firefox)
**Language:** English
**Privacy policy URL:**
`https://github.com/masteringrumble/pickax-post-to-image/blob/main/extension/PRIVACY.md`
**Homepage / support URL:** `https://github.com/masteringrumble/pickax-post-to-image`

**Permission justifications (for review notes):**
- `host_permissions: https://pickax.com/*` — read the Pickax post page the
  user asked to convert. Only used on click, on `pickax.com/post/*` pages.
- `scripting` — fallback re-injection when the tab predates the install.
- `offscreen` (Chromium zip only) — renders the post image in a hidden
  document. On Firefox the same render runs in a hidden extension tab
  instead; the Firefox manifest omits this permission.
- `downloads` — saves the generated PNG to the user's device.

## Publishing checklist

`bash extension/package.sh` builds three files in `dist-ext/`:
- `pickax-post-to-image-chromium-<version>.zip` — Chrome Web Store,
  Edge Add-ons, Opera addons (same MV3 zip for all three).
- `pickax-post-to-image-firefox-<version>.zip` — Firefox AMO only
  (event-page background, no `offscreen` permission, hidden-tab render).
- `pickax-post-to-image-sources-<version>.zip` — unminified renderer
  sources + build instructions, for AMO's review of the minified bundles.

Publishing needs the store developer accounts, which only you can create —
here's each step.

### 1. Chrome Web Store (covers Chrome, Brave, and most Chromium browsers)
- Register at https://chromewebstore.google.com/devconsole — one-time $5
  developer fee (Google's charge, unchanged for years).
- Upload the **chromium** zip.
- Fill in the listing copy above; set visibility Public; submit for review
  (typically a few days).

### 2. Microsoft Edge Add-ons
- Register free at https://partner.microsoft.com/dashboard (Microsoft account).
- Upload the **chromium** zip at
  https://partner.microsoft.com/dashboard/microsoftedge/publications/overview.
- Same listing copy; submit for review.

### 3. Firefox Add-ons (AMO)
- Register free at https://addons.mozilla.org/developers/.
- Upload the **firefox** zip, and attach the **sources** zip when AMO asks
  for the source of the minified code (or point the reviewer at
  `extension/render-src/` on GitHub). Choose distribution:
  - **"On this site"** — public listing on addons.mozilla.org.
  - **"On your own"** — Mozilla signs it and gives you a `.xpi` for
    self-hosting/sideloading (the alternative-distribution route, since
    Firefox blocks unsigned permanent installs).
- Review is usually the fastest of the four.

### 4. Opera addons
- Register free at https://addons.opera.com/developer/.
- Upload the **chromium** zip; same listing copy; submit for review.

### 5. Alternative / sideload distribution
- **GitHub Release** (this repo): attach both store zips from `package.sh` —
  Chromium users can **Load unpacked** in developer mode (see README.md).
- **Firefox unlisted**: use AMO's "On your own" option to get a signed
  `.xpi`, then host it on the release page.

## After publishing

- Add the store links to the web app's "More ways" section and this README.
- Each update: bump `version` in `manifest.json`, re-run `package.sh`,
  re-upload the matching zip to each store, tag `extension-vX.Y.Z`.
