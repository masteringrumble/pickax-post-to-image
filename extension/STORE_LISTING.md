# Store listing copy + publishing checklist

## Listing copy (all stores)

**Name:** Pickax Post to Image

**Tagline / short description (≤132 chars):**
> One click turns any Pickax post into a clean, shareable image.

**Detailed description:**
> Pickax Post to Image converts any public Pickax post into a polished,
> shareable image that matches the look of Pickax itself.
>
> HOW IT WORKS
> 1. Open any post on pickax.com.
> 2. Click the Pickax Post to Image toolbar button.
> 3. The post opens in the web tool with the author, avatar, full text,
>    timestamp, picks, axes, views, and images already filled in —
>    including quoted posts with both authors' verification badges.
> 4. Download the PNG and share it anywhere.
>
> PRIVACY
> No accounts, no analytics, no tracking. The extension reads the post page
> only on your device and only when you click the button; the extracted post
> is passed to the web tool through the page URL. Nothing is stored or sent
> anywhere else.
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

## Publishing checklist

The code is store-ready (one MV3 zip for all stores). Publishing needs the
store developer accounts, which only you can create — here's each step.

### 1. Chrome Web Store (covers Chrome, Brave, and most Chromium browsers)
- Register at https://chromewebstore.google.com/devconsole — one-time $5
  developer fee (Google's charge, unchanged for years).
- Upload `dist-ext/pickax-post-to-image-extension-1.0.0.zip`.
- Fill in the listing copy above; set visibility Public; submit for review
  (typically a few days).

### 2. Microsoft Edge Add-ons
- Register free at https://partner.microsoft.com/dashboard (Microsoft account).
- Upload the same zip at
  https://partner.microsoft.com/dashboard/microsoftedge/publications/overview.
- Same listing copy; submit for review.

### 3. Firefox Add-ons (AMO)
- Register free at https://addons.mozilla.org/developers/.
- Upload the same zip. Choose distribution:
  - **"On this site"** — public listing on addons.mozilla.org.
  - **"On your own"** — Mozilla signs it and gives you a `.xpi` for
    self-hosting/sideloading (the alternative-distribution route, since
    Firefox blocks unsigned permanent installs).
- Review is usually the fastest of the four.

### 4. Opera addons
- Register free at https://addons.opera.com/developer/.
- Upload the same zip; same listing copy; submit for review.

### 5. Alternative / sideload distribution
- **GitHub Release** (this repo): attach the zip from `package.sh` —
  Chromium users can **Load unpacked** in developer mode (see README.md).
- **Firefox unlisted**: use AMO's "On your own" option to get a signed
  `.xpi`, then host it on the release page.

## After publishing

- Add the store links to the web app's "More ways" section and this README.
- Each update: bump `version` in `manifest.json`, re-run `package.sh`,
  re-upload to each store, tag `extension-vX.Y.Z`.
