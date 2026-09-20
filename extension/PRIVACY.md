# Privacy Policy — Pickax Post to Image (browser extension)

**Last updated:** September 20, 2026

## What this extension does

Pickax Post to Image adds a toolbar button. When you click it while on
pickax.com, the page enters picker mode: hover any post and it highlights,
click it, and an options panel pops up right on the page with the same
"Show in image" choices as the
[Pickax Post to Image web tool](https://www.pickax2image.top/)
(Logo, Views, Post images, Site embed, Picks & axes — each shown only when
the post has that content). Hit Download PNG and the image saves straight
to your device. Press Esc to leave picker mode. Nothing is injected
into posts — no buttons, no page changes — and the website never opens.

## Data handling

- **No accounts. No analytics. No tracking.**
- The extension reads a Pickax post **only on your device, only when you
  click a highlighted post in picker mode**. Nothing is read in the
  background.
- The extracted post data is rendered locally in your browser (offscreen
  document) into a PNG saved to your downloads. It is never sent anywhere
  else.
- **Nothing is stored** by the extension — no local storage, no cookies, no
  servers, no third parties.

## Permissions used

- **Read access to `pickax.com/*`** — required to highlight posts and
  extract the one you click. Used only in picker mode, only after you click
  the toolbar button.
- **`scripting`** — fallback that loads the picker if the tab was open
  before the extension was installed.
- **`offscreen`** — renders the post image in a hidden document.
- **`downloads`** — saves the generated PNG to your device.

## Contact

Questions: open an issue at
https://github.com/masteringrumble/pickax-post-to-image
