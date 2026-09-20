# Privacy Policy — Pickax Post to Image (browser extension)

**Last updated:** September 19, 2026

## What this extension does

Pickax Post to Image adds a toolbar button. When you click it while viewing
a public Pickax post (`pickax.com/post/…`), it reads that page and opens the
[Pickax Post to Image web tool](https://masteringrumble.github.io/pickax-post-to-image/)
with the post's details (author, avatar, text, timestamp, counts, images)
pre-filled, so you can generate a shareable image of the post.

## Data handling

- **No accounts. No analytics. No tracking.**
- The extension reads the Pickax post page **only on your device, only when
  you click the toolbar button**. Nothing is read in the background.
- The extracted post data is passed to the web tool through the page URL
  (a `#import=` link you open yourself). It is never sent anywhere else.
- **Nothing is stored** by the extension — no local storage, no cookies, no
  servers, no third parties.

## Permissions used

- **Read access to `pickax.com/post/*`** — required to extract the post you
  asked to convert. Used only when you click the button on a post page.
- **`scripting`** — fallback that re-injects the extractor if the tab was
  open before the extension was installed.

## Contact

Issues: https://github.com/masteringrumble/pickax-post-to-image/issues
