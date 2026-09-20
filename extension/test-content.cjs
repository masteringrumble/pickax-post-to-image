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
assert.equal(o.v, 6);
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

// Logged-in DOM, non-quote post: the viewer's avatar (nav + comment box)
// must not become the author avatar or leak into the post images.
{
  const nuxt2 = JSON.stringify([
    { post: 1 },
    { id: 710273, content: 2, user: 3 },
    "Just a post<br>with two lines.",
    { fullname: "Diamond and Silk", username: "DiamondandSilk", avatar: "user-35295/ds.jpeg", creator: 4 },
    { id: 5 },
    99,
  ]);
  const viewerAv = "https://img.pickax.com/viewer-9/mr-logo.png";
  const html2 = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Diamond and Silk posted">
<meta property="og:url" content="https://pickax.com/post/710273">
</head><body>
<header><nav><a href="/ViewerPerson"><img src="${viewerAv}" class="rounded-full"></a></nav></header>
<div>
<a href="/DiamondandSilk"><img src="https://img.pickax.com/user-35295/ds.jpeg" class="rounded-full"></a>
<a href="/DiamondandSilk">Diamond and Silk</a>
</div>
<div><a href="/DiamondandSilk">@DiamondandSilk</a></div>
<img src="https://img.pickax.com/post-710273/photo1.jpeg" alt="post image">
<img src="https://img.pickax.com/post-710273/photo2.jpeg" alt="post image">
<div class="actions">
<button><svg><stop stop-color="#0083f5"/></svg><span>42</span></button>
<button><svg><path fill="#dc1919"/></svg><span>7</span></button>
</div>
<div class="comment-box"><img src="${viewerAv}" class="rounded-full"></div>
<script id="__NUXT_DATA__" type="application/json">${nuxt2}</script>
</body></html>`;
  const dom2 = new JSDOM(html2, { url: "https://pickax.com/post/710273" });
  delete globalThis.__pickaxPostToImageInjected; // allow re-eval in the test harness
  const factory2 = new dom2.window.Function(
    "document",
    "location",
    src + "\nreturn globalThis.__pickaxExtractPost;"
  );
  const extract2 = factory2(dom2.window.document, dom2.window.location);
  const o2 = extract2();
  assert.equal(o2.postId, "710273");
  assert.equal(
    o2.avatarUrl,
    "https://img.pickax.com/user-35295/ds.jpeg",
    "author avatar, not the viewer's"
  );
  assert.deepEqual(
    o2.imageUrls,
    [
      "https://img.pickax.com/post-710273/photo1.jpeg",
      "https://img.pickax.com/post-710273/photo2.jpeg",
    ],
    "viewer avatars excluded from post images"
  );
  assert.equal(o2.picks, "42", "post-page blue pick icon detected");
  assert.equal(o2.axes, "7", "post-page red axe icon detected");
  console.log("ok  content.js on logged-in page (avatar + images)");
}

// Post with attachments + a shared link: attachments are the authoritative
// post images (the link card's metadata/ preview image must NOT leak into
// them), and the link card is extracted with its domain + title.
{
  const nuxt3 = JSON.stringify([
    { post: 1 },
    {
      id: 710274,
      content: 2,
      user: 3,
      attachments: 4,
      link: 6,
    },
    "Residents push back.<br>Second line.",
    {
      fullname: "Diamond and Silk",
      username: "DiamondandSilk",
      avatar: "user-35295/ds.jpeg",
    },
    [{ url: "user-35295/graphic.jpeg", type: "image" }], // 4
    null, // 5 (unused)
    {
      // 6: link card
      url: "https://trendingpoliticsnews.com/rural-alaskans/?utm_source=DS21",
      image: "https://img.pickax.com/metadata/abc123.jpeg",
      title: "Rural Alaskans Push Back On Murkowski\u2019s Warning",
      inputUrl: "https://trendingpoliticsnews.com/rural-alaskans/?utm_source=DS21",
      description: "Some description.",
    },
  ]);
  const html3 = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Diamond and Silk posted">
<meta property="og:url" content="https://pickax.com/post/710274">
</head><body>
<div><a href="/DiamondandSilk"><img src="https://img.pickax.com/user-35295/ds.jpeg" class="rounded-full"></a></div>
<div><a href="/DiamondandSilk">@DiamondandSilk</a></div>
<img src="https://img.pickax.com/user-35295/graphic.jpeg" alt="post image">
<div class="font-light text-sm bg-dark3/70 rounded-lg relative p-3 mt-4" title="Rural Alaskans Push Back On Murkowski\u2019s Warning">
<a href="https://trendingpoliticsnews.com/rural-alaskans/?utm_source=DS21" target="_blank" class="mb-1 flex">
<img src="https://img.pickax.com/metadata/abc123.jpeg" alt="link preview" class="rounded-t-lg w-full aspect-video object-cover">
</a>
<div class="p-2 flex flex-col gap-1">
<a href="https://trendingpoliticsnews.com/rural-alaskans/?utm_source=DS21" target="_blank" class="flex text-[12px] text-light2 hover:underline">trendingpoliticsnews.com</a>
<a href="https://trendingpoliticsnews.com/rural-alaskans/?utm_source=DS21" target="_blank" class="flex text-[15px] hover:underline">Rural Alaskans Push Back On Murkowski\u2019s Warning</a>
</div>
</div>
<script id="__NUXT_DATA__" type="application/json">${nuxt3}</script>
</body></html>`;
  const dom3 = new JSDOM(html3, { url: "https://pickax.com/post/710274" });
  delete globalThis.__pickaxPostToImageInjected; // allow re-eval in the test harness
  const factory3 = new dom3.window.Function(
    "document",
    "location",
    src + "\nreturn globalThis.__pickaxExtractPost;"
  );
  const extract3 = factory3(dom3.window.document, dom3.window.location);
  const o3 = extract3();
  assert.equal(o3.postId, "710274");
  assert.deepEqual(
    o3.imageUrls,
    ["https://img.pickax.com/user-35295/graphic.jpeg"],
    "attachments only: the metadata/ link preview is not a post image"
  );
  assert.ok(o3.linkCard, "link card extracted");
  assert.equal(
    o3.linkCard.url,
    "https://trendingpoliticsnews.com/rural-alaskans/?utm_source=DS21"
  );
  assert.equal(o3.linkCard.domain, "trendingpoliticsnews.com");
  assert.equal(
    o3.linkCard.title,
    "Rural Alaskans Push Back On Murkowski\u2019s Warning"
  );
  assert.equal(
    o3.linkCard.imageUrl,
    "https://img.pickax.com/metadata/abc123.jpeg"
  );
  // The payload must survive the app's hash round-trip (field names matter).
  assert.ok(
    appSrc.includes("linkCard"),
    "app accepts the extension's linkCard field"
  );
  console.log("ok  content.js extracts the link card (attachments vs link image)");
}

// Feed page: two post cards. Each card gets exactly one "Image" button with
// its own post id, and card-scoped extraction must not bleed data between
// cards (author, picks, images stay with their own post).
{
  const nuxtFeed = JSON.stringify([
    { feed: [1, 4] }, // 0
    { id: 111111, content: 2, user: 3 }, // 1
    "Alice post text", // 2
    { fullname: "Alice A", username: "alice", avatar: "u-alice/a.jpeg" }, // 3
    { id: 222222, content: 5, user: 6 }, // 4
    "Bob post text", // 5
    { fullname: "Bob B", username: "bob", avatar: "u-bob/b.jpeg" }, // 6
  ]);
  // Mirrors the real logged-out feed card: an empty full-bleed /post/ overlay
  // anchor first, then header, body, media, and the engagement row:
  // pick (count) | axe (icon-only, NO count on the feed) | comment (count) |
  // two trailing icon-only buttons. The pick icon uses a red-yellow
  // gradient, NOT the post page's blue scheme.
  // Card 1 uses color hints; card 2's buttons carry no color hints at all so
  // the order fallback (pick first, axe second) is exercised — and its
  // comment count must NOT leak into axes.
  var GRADIENT_PICK_SVG =
    '<svg viewBox="0 0 24 24"><defs><linearGradient><stop stop-color="#FD5E5E"/><stop stop-color="#FDCF5E"/></linearGradient></defs><path d="M0 0h24v24H0z"/></svg>';
  var PLAIN_PICK_SVG =
    '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
  var AXE_ICON_SVG =
    '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="gray"/></svg>';
  function commentBtn(n) {
    return `<button class="relative flex"><div class="flex gap-2 opacity-50"><div class="w-5 h-5"><svg viewBox="0 0 24 24"><path d="M12 16L7 21V16H5C3.9 16 3 15.1 3 14V5C3 3.9 3.9 3 5 3H19C20.1 3 21 3.9 21 5V14C21 15.1 20.1 16 19 16H12Z" fill="white"/></svg></div><div>${n}</div></div></button>`;
  }
  function feedCard(id, user, name, av, text, img, o) {
    var pickSvg = o.plain ? PLAIN_PICK_SVG : GRADIENT_PICK_SVG;
    var axeBtn =
      o.axe === "counted"
        ? `<button class="relative flex">${PLAIN_PICK_SVG}<div class="flex gap-1"><div>${o.axeN}</div></div></button>`
        : `<button class="relative flex">${AXE_ICON_SVG}</button>`;
    return `<div class="card relative" id="card-${id}">
<a href="/post/${id}" class="absolute top-0 left-0 w-full h-full cursor-pointer z-0"></a>
<div><a href="/${user}">${name}</a><button>Follow</button></div>
<div><a href="/${user}">@${user}</a><span title="Sep 20, 2026">${text}</span></div>
<a href="/${user}"><img src="https://img.pickax.com/${av}" class="rounded-full object-cover w-10 h-10 min-w-10"></a>
<img src="https://img.pickax.com/${img}" alt="post image">
<div class="actions">
<button class="relative flex">${pickSvg}<div class="flex gap-1"><div>${o.picks}</div></div></button>
${axeBtn}
${commentBtn(o.commentN)}
<button class="relative flex">${AXE_ICON_SVG}</button>
<button class="relative flex">${AXE_ICON_SVG}</button>
</div>
</div>`;
  }
  const htmlFeed = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Pickax">
</head><body>
<div id="feed">
${feedCard("111111", "alice", "Alice A", "u-alice/a.jpeg", "2 hours ago", "p-111/photo.jpeg", { picks: "5", commentN: "12", axe: "icon" })}
${feedCard("222222", "bob", "Bob B", "u-bob/b.jpeg", "3 hours ago", "p-222/photo.jpeg", { picks: "9", commentN: "3", axe: "counted", axeN: "2", plain: true })}
</div>
<script id="__NUXT_DATA__" type="application/json">${nuxtFeed}</script>
</body></html>`;
  const domF = new JSDOM(htmlFeed, { url: "https://pickax.com/" });
  delete globalThis.__pickaxPostToImageInjected; // allow re-eval in the test harness
  // Stub the extension API so the button renders its icon image. (The test
  // harness evals content.js with Node as globalThis, so stub it there.)
  globalThis.chrome = {
    runtime: {
      getURL: function (p) {
        return "chrome-extension://fakeid/" + p;
      },
    },
  };
  const factoryF = new domF.window.Function(
    "document",
    "location",
    src + "\nreturn globalThis.__pickaxExtractPost;"
  );
  const extractF = factoryF(domF.window.document, domF.window.location);
  delete globalThis.chrome; // don't leak the stub into other sections

  // The content script auto-scans on load: one button per card.
  const btns = domF.window.document.querySelectorAll("[data-ppi-btn]");
  assert.equal(btns.length, 2, "one Image button per feed card");
  const btnIds = Array.prototype.map
    .call(btns, function (b) {
      return b.getAttribute("data-ppi-btn");
    })
    .sort();
  assert.deepEqual(btnIds, ["111111", "222222"], "buttons carry their card's post id");

  // The button uses the site's light-blue icon image, not an emoji.
  const btnImg = btns[0].querySelector("img");
  assert.ok(btnImg, "button contains the brand icon image");
  assert.ok(
    btnImg.getAttribute("src").indexOf("icons/icon-32.png") !== -1,
    "button icon is the extension's blue icon"
  );
  assert.ok(
    btns[0].textContent.indexOf("📷") === -1,
    "no camera emoji in the button"
  );
  assert.equal(
    btns[0].parentElement.className,
    "actions",
    "button parks in the card's action row"
  );
  assert.equal(
    btns[0].parentElement.lastElementChild,
    btns[0],
    "button sits after the row's trailing icon-only buttons"
  );
  assert.ok(
    btns[0].style.position === "relative" && btns[0].style.zIndex === "1",
    "button sits above the card's full-bleed overlay link"
  );

  // Scoped extraction: no cross-card bleed.
  const card1 = domF.window.document.getElementById("card-111111");
  const card2 = domF.window.document.getElementById("card-222222");
  const f1 = extractF(card1, "111111");
  const f2 = extractF(card2, "222222");
  assert.equal(f1.postId, "111111");
  assert.equal(f1.username, "alice");
  assert.equal(f1.displayName, "Alice A");
  assert.equal(f1.text, "Alice post text");
  assert.equal(f1.picks, "5", "gradient pick icon detected");
  assert.equal(
    f1.axes,
    "",
    "feed axe button is icon-only: no public count, so no number"
  );
  assert.equal(
    f1.avatarUrl,
    "https://img.pickax.com/u-alice/a.jpeg",
    "card 1 avatar is Alice's"
  );
  assert.deepEqual(f1.imageUrls, ["https://img.pickax.com/p-111/photo.jpeg"]);
  assert.equal(f2.postId, "222222");
  assert.equal(f2.username, "bob");
  assert.equal(f2.text, "Bob post text");
  assert.equal(f2.picks, "9", "order fallback finds picks without color hints");
  assert.equal(
    f2.axes,
    "2",
    "order fallback finds axes without color hints, comment count excluded"
  );
  assert.equal(
    f2.avatarUrl,
    "https://img.pickax.com/u-bob/b.jpeg",
    "card 2 avatar is Bob's, not Alice's"
  );
  assert.deepEqual(f2.imageUrls, ["https://img.pickax.com/p-222/photo.jpeg"]);
  console.log("ok  content.js feed cards: per-post buttons + scoped extraction");
}

// Payload miss: the per-post button's card-scoped extraction must fall back
// to the rendered DOM (.text-content + display-name link) instead of
// producing an empty card. Regression test for post 715229, whose download
// came out with no post text and no display name at all.
{
  const nuxtMiss = JSON.stringify([{ feed: [] }]); // payload lacks the post
  const domText =
    "There\u2019s always going to be bad actors.\n\nSecond paragraph here.";
  const htmlMiss = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Pickax">
</head><body>
<div class="card" id="card-715229">
<a href="/post/715229" class="absolute top-0 left-0 w-full h-full cursor-pointer z-0"></a>
<div><a href="/JeffDornik">Jeff Dornik</a></div>
<div><a href="/JeffDornik">@JeffDornik</a><span title="Sep 20, 2026">5 minutes ago</span></div>
<a href="/JeffDornik"><img src="https://img.pickax.com/user-3/avatar.jpeg" class="rounded-full"></a>
<div class="relative z-10 text-light2 font-light my-5 block w-full cursor-pointer"><div class="text-content overflow-clip">${domText}</div></div>
<div class="actions">
<button class="relative flex"><svg><defs><linearGradient><stop stop-color="#FD5E5E"/><stop stop-color="#FDCF5E"/></linearGradient></defs></svg><div class="flex gap-1"><div>6</div></div></button>
<button class="relative flex"><svg><path d="M0 0h24v24H0z"/></svg></button>
</div>
<span title="Post views" aria-label="Post views: 11">11</span>
</div>
<script id="__NUXT_DATA__" type="application/json">${nuxtMiss}</script>
</body></html>`;
  const domM = new JSDOM(htmlMiss, { url: "https://pickax.com/" });
  delete globalThis.__pickaxPostToImageInjected; // allow re-eval in the test harness
  const factoryM = new domM.window.Function(
    "document",
    "location",
    src + "\nreturn globalThis.__pickaxExtractPost;"
  );
  const extractM = factoryM(domM.window.document, domM.window.location);
  const cardM = domM.window.document.getElementById("card-715229");
  const m1 = extractM(cardM, "715229");
  assert.equal(m1.postId, "715229");
  assert.equal(m1.username, "JeffDornik");
  assert.equal(
    m1.displayName,
    "Jeff Dornik",
    "display name falls back to the DOM name link"
  );
  assert.equal(
    m1.text,
    domText,
    "post text falls back to the rendered .text-content"
  );
  assert.equal(m1.picks, "6");
  assert.equal(m1.views, "11");
  assert.equal(
    m1.avatarUrl,
    "https://img.pickax.com/user-3/avatar.jpeg",
    "author avatar still resolved"
  );
  console.log("ok  content.js DOM fallback when the payload walk misses");

  // Precedence: when the payload delivers, it wins over the DOM text/name.
  const nuxtP = JSON.stringify([
    { post: 1 },
    { id: 715230, content: 2, user: 3 },
    "Payload <b>full</b> text",
    {
      fullname: "Payload Name",
      username: "jeffdornik",
      avatar: "user-3/a.jpeg",
    },
  ]);
  const htmlP = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Pickax">
</head><body>
<div class="card" id="card-715230">
<a href="/post/715230" class="absolute top-0 left-0 w-full h-full cursor-pointer z-0"></a>
<div><a href="/jeffdornik">DOM Name</a></div>
<div><a href="/jeffdornik">@jeffdornik</a></div>
<a href="/jeffdornik"><img src="https://img.pickax.com/user-3/a.jpeg" class="rounded-full"></a>
<div class="relative z-10 text-light2 font-light my-5 block w-full cursor-pointer"><div class="text-content overflow-clip">DOM stub text</div></div>
</div>
<script id="__NUXT_DATA__" type="application/json">${nuxtP}</script>
</body></html>`;
  const domP = new JSDOM(htmlP, { url: "https://pickax.com/" });
  delete globalThis.__pickaxPostToImageInjected; // allow re-eval in the test harness
  const factoryP = new domP.window.Function(
    "document",
    "location",
    src + "\nreturn globalThis.__pickaxExtractPost;"
  );
  const extractP = factoryP(domP.window.document, domP.window.location);
  const cardP = domP.window.document.getElementById("card-715230");
  const m2 = extractP(cardP, "715230");
  assert.equal(m2.text, "Payload full text", "payload text wins over DOM");
  assert.equal(
    m2.displayName,
    "Payload Name",
    "payload fullname wins over DOM name"
  );
  console.log("ok  content.js payload takes precedence over the DOM fallback");
}
console.log("\nALL EXTENSION TESTS PASSED");
