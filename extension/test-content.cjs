/* Smoke test for extension/content.js: runs the real content script against a
 * fixture Pickax post page (jsdom) and asserts the extracted payload matches
 * the v5 shape the app's #import= hash accepts.
 *
 * Run: NODE_PATH=./node_modules node extension/test-content.cjs
 */
const { JSDOM } = require("jsdom");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Devalue-shaped __NUXT_DATA__: outer post 709927 (gold quoter) with
// repostOf -> quoted post 708186 (blue author).
const nuxt = JSON.stringify([
  { post: 1 }, // 0: root
  {
    // 1: outer post
    id: 709927,
    content: 2,
    createdAt: new Date(Date.now() - 3600e3).toISOString(),
    user: 3,
    repostOf: 6,
  },
  "ALL WEIRDOS WELCOME!<br>Get in here!!!", // 2
  {
    // 3: quoter (creator record -> gold)
    fullname: "Will Carlton",
    username: "whatifiamright",
    avatar: "user-2846/pic.jpeg",
    is_verified: true,
    creator: 4,
  },
  { id: 5 }, // 4
  99, // 5
  {
    // 6: quoted post
    id: 708186,
    content: 7,
    createdAt: new Date(Date.now() - 2.5 * 3600e3).toISOString(),
    user: 8,
  },
  "Quoted <b>body</b> text<br><br>Second para.", // 7
  {
    // 8: quoted author (verified, no creator -> blue)
    fullname: "hannah partridge",
    username: "Utopicfox",
    avatar: "user-78430/pic.png",
    is_verified: true,
  },
]);

const HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Will Carlton posted">
<meta property="og:description" content="ALL WEIRDOS WELCOME! user=whatifiamright 100 Followers">
</head><body>
<div>
<a href="/whatifiamright" class="cursor-pointer">Will Carlton</a>
<div class="w-5 h-5 [&_*]:fill-orange-300"><svg viewBox="0 0 32 32"><path d="M12.7893 4.26666C12.5796 4.45641Z"/></svg></div>
</div>
<div><a href="/whatifiamright">@whatifiamright</a><span title="Sep 19, 2026">1 hour ago</span></div>
<a href="/whatifiamright"><img src="https://img.pickax.com/user-2846/pic.jpeg" class="rounded-full"></a>
<img src="https://img.pickax.com/post-999/other.jpeg" alt="quoted post image">
<span title="Post views" aria-label="Post views: 42">42</span>
<button><svg><defs><linearGradient><stop stop-color="#0083f5"/></linearGradient></defs></svg><div>7</div></button>
<button><svg><defs><linearGradient><stop stop-color="#dc1919"/></linearGradient></defs></svg><div>3</div></button>
<script id="__NUXT_DATA__" type="application/json">${nuxt}</script>
</body></html>`;

const dom = new JSDOM(HTML, { url: "https://pickax.com/post/709927" });
const src = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
// Same trick as the bookmarklet e2e test: build the function inside the
// jsdom window so bare `document`/`location` resolve to the fixture DOM.
const factory = new dom.window.Function(
  "document",
  "location",
  src + "\nreturn globalThis.__pickaxExtractPost;"
);
const extractPost = factory(dom.window.document, dom.window.location);
assert.equal(typeof extractPost, "function", "content.js exposes extractPost");

const o = extractPost();
assert.ok(o, "extractPost returned a payload");
assert.equal(o.v, 5);
assert.equal(o.postId, "709927");
assert.equal(o.displayName, "Will Carlton");
assert.equal(o.username, "whatifiamright");
assert.equal(o.verified, "gold", "gold badge from creator record");
assert.equal(o.text, "ALL WEIRDOS WELCOME!\nGet in here!!!", "full text from payload");
assert.equal(o.avatarUrl, "https://img.pickax.com/user-2846/pic.jpeg");
assert.equal(o.picks, "7");
assert.equal(o.axes, "3");
assert.equal(o.views, "42");
assert.equal(o.timestamp, "1 hour ago");

// Quote-post rules: no post images, quoted card carries its own author data.
assert.deepEqual(o.imageUrls, [], "quote posts carry no post images");
assert.ok(o.q, "quoted post extracted");
assert.equal(o.q.postId, "708186");
assert.equal(o.q.displayName, "hannah partridge");
assert.equal(o.q.username, "Utopicfox");
assert.equal(o.q.verified, "blue", "blue badge for verified non-creator");
assert.equal(o.q.avatarUrl, "https://img.pickax.com/user-78430/pic.png");
assert.equal(o.q.text, "Quoted body text\n\nSecond para.");
assert.equal(o.q.timestamp, "2 hours ago");

// The payload must survive the app's hash round-trip (field names matter).
const appSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "importHtml.ts"),
  "utf8"
);
assert.ok(
  appSrc.includes('str(o.avatarUrl) || str(o.avatar)'),
  "app accepts the extension's avatarUrl field"
);
console.log("ok  content.js extraction (quote post, badges, no-image rule)");
console.log("\nALL EXTENSION TESTS PASSED");
