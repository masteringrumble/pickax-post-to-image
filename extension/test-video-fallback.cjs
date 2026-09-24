/* Focused test: extension/content.js backup-path video extraction must handle
 * every video post type the worker/site handles — Rumble (new + old thumb
 * hosts), YouTube, native <video> uploads, Spotify, Apple Podcasts — and
 * prefer a thumbnailed candidate when several iframes are present.
 *
 * Run: NODE_PATH=./node_modules node extension/test-video-fallback.cjs
 */
const { JSDOM } = require("jsdom");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");

function extractFrom(html, url) {
  // The content script guards against double-injection via a globalThis
  // flag — correct in real browsers (one global per tab), but the jsdom
  // instances here share Node's globalThis, so reset it per extraction.
  delete globalThis.__pickaxPostToImageInjected;
  delete globalThis.__pickaxExtractPost;
  const dom = new JSDOM(html, { url: url || "https://pickax.com/post/1" });
  const factory = new dom.window.Function(
    "document",
    "location",
    src + "\nreturn globalThis.__pickaxExtractPost;"
  );
  return factory(dom.window.document, dom.window.location)();
}

function page(body, thumbJson) {
  return `<!DOCTYPE html><html><head>
<meta property="og:title" content="Vid Poster posted">
<meta property="og:description" content="watch this">
</head><body>
<div><a href="/someuser">@someuser</a></div>
<a href="/someuser"><img src="https://img.pickax.com/user-1/pic.jpeg" class="rounded-full"></a>
${body}
<script id="__NUXT_DATA__" type="application/json">${thumbJson || "[]"}</script>
</body></html>`;
}

let n = 0;
function check(name, cond) {
  n++;
  assert.ok(cond, name);
  console.log("ok  " + name);
}

// 1. YouTube embed -> videoSrc + i.ytimg.com thumbnail
{
  const o = extractFrom(
    page('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Never Gonna"></iframe>')
  );
  check("youtube: src captured", o.videoSrc.includes("youtube.com/embed/dQw4w9WgXcQ"));
  check("youtube: thumb from i.ytimg.com", o.videoThumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  check("youtube: title captured", o.videoTitle === "Never Gonna");
}

// 2. Rumble embed + new cdn.rumble.cloud thumbnail in page HTML
{
  const o = extractFrom(
    page(
      '<iframe src="https://rumble.com/embed/v6x7y8/" title="Rumble vid"></iframe>' +
        '<img src="https://abc123.cdn.rumble.cloud/video/s16/5/thumb.jpg">'
    )
  );
  check("rumble: src captured", o.videoSrc.includes("rumble.com/embed/v6x7y8"));
  check(
    "rumble: cdn.rumble.cloud thumb",
    o.videoThumb === "https://abc123.cdn.rumble.cloud/video/s16/5/thumb.jpg"
  );
}

// 3. Rumble embed + OLD 1a-1791.com thumbnail (pre-~Sep-2026 posts)
{
  const o = extractFrom(
    page(
      '<iframe src="https://rumble.com/embed/v1a2b3c/"></iframe>' +
        '<img src="https://1a-1791.com/video/s16/1/old-thumb.jpg">'
    )
  );
  check("rumble: 1a-1791.com thumb", o.videoThumb === "https://1a-1791.com/video/s16/1/old-thumb.jpg");
}

// 4. Native <video> upload with poster
{
  const o = extractFrom(
    page('<video poster="https://img.pickax.com/vid-preview-1.jpg" src="https://img.pickax.com/vid1.mp4"></video>')
  );
  check("native: poster as thumb", o.videoThumb === "https://img.pickax.com/vid-preview-1.jpg");
  check("native: src captured", o.videoSrc.length > 0);
}

// 5. Spotify embed (+ spotifycdn artwork in page)
{
  const o = extractFrom(
    page(
      '<iframe src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQm"></iframe>' +
        '<img src="https://i.scdn.co/image/ab67616d0000b273abc.jpg">'
    )
  );
  check("spotify: src captured", o.videoSrc.includes("open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQm"));
  check(
    "spotify: spotifycdn thumb",
    o.videoThumb === "https://i.scdn.co/image/ab67616d0000b273abc.jpg"
  );
}

// 6. Apple Podcasts embed (+ mzstatic artwork in page)
{
  const o = extractFrom(
    page(
      '<iframe src="https://embed.podcasts.apple.com/us/podcast/x/id123456789?i=1000600000000"></iframe>' +
        '<img src="https://is1-ssl.mzstatic.com/image/thumb/art.jpg">'
    )
  );
  check("apple: src captured", o.videoSrc.includes("embed.podcasts.apple.com"));
  check("apple: mzstatic thumb", o.videoThumb === "https://is1-ssl.mzstatic.com/image/thumb/art.jpg");
}

// 7. Multi-iframe: thumbnail-less iframe first, YouTube second -> YouTube wins
{
  const o = extractFrom(
    page(
      '<iframe src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQm"></iframe>' +
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'
    )
  );
  check("multi-iframe: thumbnailed candidate wins", o.videoSrc.includes("youtube.com/embed/"));
}

// 8. No video at all -> empty fields, nothing crashes
{
  const o = extractFrom(page("<p>just text</p>"));
  check("no video: fields empty", o.videoSrc === "" && o.videoThumb === "" && o.videoTitle === "");
}

console.log(`\nALL VIDEO FALLBACK TESTS PASSED (${n} assertions)`);
