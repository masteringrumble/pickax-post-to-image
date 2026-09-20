# Privacy Policy — Pickax Post to Image (browser extension)

**Last updated:** September 20, 2026

## What this extension does

Pickax Post to Image adds a toolbar button. When you click it while on
pickax.com, the page enters picker mode: hover any post and it highlights,
click it, and the
[Pickax Post to Image web tool](https://www.pickax2image.top/)
opens with that post's details (author, avatar, text, timestamp, counts,
images) pre-filled, so you can tweak the options and generate a shareable
image of the post. Press Esc to leave picker mode. Nothing is injected
into posts — no buttons, no page changes.

## Data handling

- **No accounts. No analytics. No tracking.**
- The extension reads a Pickax post **only on your device, only when you
  click a highlighted post in picker mode**. Nothing is read in the
  background.
- The extracted post data is passed to the web tool through the page URL
  (a `#import=` link opened in a new tab). It is never sent anywhere else.
- **Nothing is stored** by the extension — no local storage, no cookies, no
  servers, no third parties.

## Permissions used

- **Read access to `pickax.com/*`** — required to highlight posts and
  extract the one you click. Used only in picker mode, only after you click
  the toolbar button.
- **`scripting`** — fallback that loads the picker if the tab was open
  before the extension was installed.

## Contact

Questions: open an issue at
https://github.com/masteringrumble/pickax-post-to-image
