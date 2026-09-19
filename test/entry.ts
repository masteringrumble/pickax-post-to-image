// Headless smoke test for the post-to-image pipeline.
// Bundled with esbuild (see package.json "test" script) and run in Node.
// Stubs the DOM canvas 2d context + Image so renderPostImage() runs without
// a browser; exercises every layout branch and asserts the invariants:
// valid URLs accepted, text wrapped verbatim, nothing cut off, logo drawn,
// missing data omitted (never invented).
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { wrapText, wrapParagraph } from "../src/lib/text";
import { extractPostId } from "../src/pickax";
import {
  BOOKMARKLET,
  cleanDescription,
  parseImportHash,
  parsePostHtml,
  prettyTimestamp,
} from "../src/importHtml";
import { renderPostImage } from "../src/renderer";

// ---- minimal canvas 2d context stub ---------------------------------------
function makeCtx(): any {
  const calls: any[] = [];
  const ctx: any = {
    calls,
    _font: "400 40px sans-serif",
    canvas: null,
    set font(v: string) {
      this._font = v;
    },
    get font() {
      return this._font;
    },
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set lineCap(_v: string) {},
    set globalAlpha(_v: number) {},
    set textAlign(_v: string) {},
    set textBaseline(_v: string) {},
    ellipse() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    measureText(text: string) {
      const m = this._font.match(/(\d+(?:\.\d+)?)px/);
      const px = m ? parseFloat(m[1]) : 40;
      return { width: Array.from(text).length * px * 0.55 };
    },
    scale() {},
    translate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    clip() {},
    save() {},
    restore() {},
    fillRect() {
      calls.push(["fillRect"]);
    },
    fillText(t: string) {
      calls.push(["fillText", t]);
    },
    drawImage(img: any, ...rest: any[]) {
      calls.push(["drawImage", img === (globalThis as any).__logo ? "logo" : "img", ...rest]);
    },
  };
  return ctx;
}

class StubImage {
  naturalWidth = 800;
  naturalHeight = 600;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  _src = "";
  set src(v: string) {
    this._src = v;
    if (v.includes("pickax-logo")) {
      this.naturalWidth = 208;
      this.naturalHeight = 64;
      (globalThis as any).__logo = this;
    }
    setTimeout(() => this.onload && this.onload(), 0);
  }
  get src() {
    return this._src;
  }
}

function makeCanvas(w = 10, h = 10): any {
  const ctx = makeCtx();
  const canvas: any = {
    width: w,
    height: h,
    _ctx: ctx,
    getContext: () => ctx,
    toDataURL: () => "data:image/png;base64,stub",
    toBlob: (cb: (b: Blob) => void) => cb(new Blob(["stub"])),
  };
  ctx.canvas = canvas;
  return canvas;
}

(globalThis as any).Image = StubImage;
(globalThis as any).Path2D = class {
  constructor(_d?: string) {}
};
(globalThis as any).document = { createElement: (_tag: string) => makeCanvas() };

const CONTENT_W = 1200 - 64 * 2;
const measure = (px: number) => (t: string) => Array.from(t).length * px * 0.55;

async function main() {
  // ---- 1. URL validation ----------------------------------------------------
  assert.equal(extractPostId("https://pickax.com/post/707864"), "707864");
  assert.equal(extractPostId("http://www.pickax.com/post/123?x=1"), "123");
  assert.equal(extractPostId("https://pickax.com/post/707864/"), "707864");
  assert.equal(extractPostId("  https://pickax.com/post/42#frag  "), "42");
  assert.equal(extractPostId("https://pickax.com/post/abc"), null);
  assert.equal(extractPostId("https://pickax.com/post/"), null);
  assert.equal(extractPostId("https://evil.com/post/707864"), null);
  assert.equal(extractPostId("https://pickax.com/posts/707864"), null);
  assert.equal(extractPostId("not a url"), null);
  assert.equal(extractPostId(""), null);
  console.log("ok  url validation (10 cases)");

  // ---- 2. wrapParagraph -----------------------------------------------------
  {
    const m = measure(40);
    assert.deepEqual(wrapParagraph("hello world foo bar", 1000, m), ["hello world foo bar"]);
    const long = "lorem ipsum ".repeat(50).trim();
    const wl = wrapParagraph(long, 500, m);
    assert.ok(wl.length > 5, "long text wraps to many lines");
    for (const l of wl) assert.ok(m(l) <= 500, `line fits: ${l.slice(0, 30)}`);
    const url = "https://example.com/" + "a".repeat(300);
    const bl = wrapParagraph(url, 500, m);
    assert.ok(bl.length > 1, "overlong word is broken");
    for (const l of bl) assert.ok(m(l) <= 500 + 40, "broken piece fits");
    assert.equal(bl.join(""), url, "hard break preserves every char");
    assert.equal(wl.join(" ").replace(/\s+/g, " "), long.replace(/\s+/g, " "));
  }
  console.log("ok  wrapParagraph (wrap, hard-break, verbatim)");

  // ---- 3. wrapText: paragraphs / emojis / hashtags / urls -------------------
  {
    const m = measure(40);
    const text =
      "🔴🚩LIVE | Splaterday\n\nHalloween: The Game 🎃\n#RumbleTakeover @someone https://twitch.tv/x";
    const lines = wrapText(text, 1000, m);
    assert.ok(lines.includes(""), "paragraph gap preserved");
    const words = text.split(/\s+/).filter(Boolean);
    const outWords = lines.join("\n").split(/\s+/).filter(Boolean);
    assert.deepEqual(outWords, words, "words incl. emoji/hashtag/mention/url preserved in order");
    for (const l of lines) assert.ok(m(l) <= 1000, "line fits");
    assert.deepEqual(
      wrapText("a\r\n\r\nb", 1000, m).filter((l) => l !== "").join("|"),
      "a|b"
    );
  }
  console.log("ok  wrapText (paragraphs, emojis, hashtags, urls)");

  // ---- 4. renderer: short post ----------------------------------------------
  {
    const canvas: any = await renderPostImage({
      postId: "707864",
      displayName: "Misfit Electronic Gaming",
      username: "misfit_electronic_gaming",
      avatar: null,
      text: "Come hang out! 🔴 LIVE now.",
      timestamp: "",
      images: [],
      engagement: {},
    });
    assert.equal(canvas.width, 2400, "2x crisp width");
    assert.ok(canvas.height >= 460 * 2, "min height");
    const texts = canvas._ctx.calls.filter((c: any) => c[0] === "fillText").map((c: any) => c[1]);
    assert.ok(texts.some((t: string) => t.includes("Misfit Electronic")), "display name drawn");
    assert.ok(texts.some((t: string) => t === "@misfit_electronic_gaming"), "handle drawn");
    assert.ok(texts.some((t: string) => t === "pickax.com/post/707864"), "source footer drawn");
    assert.ok(
      canvas._ctx.calls.some((c: any) => c[0] === "drawImage" && c[1] === "logo"),
      "supplied logo drawn"
    );
    console.log(`ok  short post renders (canvas ${canvas.width}x${canvas.height})`);
  }

  // ---- 5. renderer: long post grows, nothing cut off -------------------------
  {
    const para =
      "🔴🚩LIVE | | Splaterday | | Halloween: The Game 🎃 #RumbleTakeover @gamingonrumble https://twitch.tv/misfit_electronic_gaming ";
    const text =
      Array(12).fill(para).join("\n\n") + "\n\n" + "supercalifragilisticexpialidocious".repeat(20);
    const canvas: any = await renderPostImage({
      postId: "707864",
      displayName: "Misfit Electronic Gaming",
      username: "misfit",
      avatar: null,
      text,
      timestamp: "Sep 19, 2026",
      images: [],
      engagement: { picks: "1.2K", axes: "3", views: "45K" },
    });
    assert.ok(canvas.height > 2000, `tall post grows height (got ${canvas.height})`);
    const texts = canvas._ctx.calls.filter((c: any) => c[0] === "fillText").map((c: any) => c[1]);
    assert.ok(texts.some((t: string) => t === "Sep 19, 2026"), "timestamp drawn");
    assert.ok(texts.some((t: string) => t === "1.2K"), "picks drawn");
    assert.ok(texts.some((t: string) => t === "45K"), "views drawn");
    for (const t of texts) {
      if (t.startsWith("@") || t.includes("pickax.com") || t === "Sep 19, 2026") continue;
      if (/^[♡💬↻👁]/.test(t)) continue;
      assert.ok(
        Array.from(t).length * 22 <= CONTENT_W + 1,
        `text line fits: ${t.slice(0, 40)}`
      );
    }
    const drawn = texts.join(" ");
    for (const w of [
      "🔴🚩LIVE",
      "#RumbleTakeover",
      "@gamingonrumble",
      "https://twitch.tv/misfit_electronic_gaming",
    ]) {
      assert.ok(drawn.includes(w), `word preserved in output: ${w}`);
    }
    console.log(`ok  long post renders without overflow (canvas ${canvas.width}x${canvas.height})`);
  }

  // ---- 6. renderer: images (1 and 3) + avatar --------------------------------
  {
    const mkImg = (w: number, h: number) => {
      const im = new StubImage();
      im.naturalWidth = w;
      im.naturalHeight = h;
      return { img: im as unknown as HTMLImageElement, width: w, height: h };
    };
    const one: any = await renderPostImage({
      postId: "1", displayName: "A", username: "a",
      avatar: mkImg(200, 200).img,
      text: "with image", timestamp: "", images: [mkImg(1600, 900)], engagement: {},
    });
    const three: any = await renderPostImage({
      postId: "2", displayName: "A", username: "a", avatar: null,
      text: "three images", timestamp: "",
      images: [mkImg(800, 800), mkImg(1200, 600), mkImg(600, 1200)], engagement: {},
    });
    assert.ok(one.height > 0 && three.height > 0, "image layouts produce height");
    const oneDraws = one._ctx.calls.filter((c: any) => c[0] === "drawImage" && c[1] === "img");
    // drawImage(img, x, y, w, h): the post image is the widest draw (avatar is 112px)
    const widest = oneDraws.reduce((a: any, b: any) => (a[4] > b[4] ? a : b));
    const w1 = widest[4];
    const h1 = widest[5];
    assert.ok(Math.abs(w1 / h1 - 1600 / 900) < 0.01, "aspect ratio preserved, no crop");
    const threeDraws = three._ctx.calls.filter((c: any) => c[0] === "drawImage" && c[1] === "img");
    assert.equal(threeDraws.length, 3, "3 post images drawn (logo counted separately)");
    console.log("ok  image layouts (1 and 3 images, aspect preserved, no crop)");
  }

  // ---- 7. renderer: missing data omitted, never invented ---------------------
  {
    const canvas: any = await renderPostImage({
      postId: "9", displayName: "", username: "", avatar: null,
      text: "minimal", timestamp: "", images: [], engagement: {},
    });
    const texts = canvas._ctx.calls.filter((c: any) => c[0] === "fillText").map((c: any) => c[1]);
    assert.ok(!texts.some((t: string) => t.startsWith("@")), "no handle invented");
    assert.ok(!texts.some((t: string) => /♡|💬|↻|👁/.test(t)), "no engagement invented");
    assert.ok(texts.some((t: string) => t === "minimal"), "text drawn");
    console.log("ok  missing data omitted, nothing invented");
  }

  // ---- 8. cleanDescription: strip Pickax's SEO suffix, keep the post ------
  {
    assert.equal(
      cleanDescription(
        "Come hang out! user=misfit_electronic_gaming 1311 Followers"
      ),
      "Come hang out!"
    );
    assert.equal(
      cleanDescription("Hello world user=someone 1,234 Followers"),
      "Hello world"
    );
    assert.equal(
      cleanDescription("Just a normal post, no suffix here"),
      "Just a normal post, no suffix here"
    );
    assert.equal(
      cleanDescription("user=someone is my friend, 5 Followers rock"),
      "user=someone is my friend, 5 Followers rock",
      "mid-text occurrences are kept"
    );
    console.log("ok  cleanDescription (SEO suffix stripped, post kept)");
  }

  // ---- 9. prettyTimestamp ---------------------------------------------------
  {
    assert.equal(prettyTimestamp(""), "");
    const iso = prettyTimestamp("2026-09-19T17:11:00");
    assert.ok(iso.includes("2026"), `ISO formatted readably (got ${iso})`);
    assert.ok(!iso.includes("T17"), "no raw ISO time leak");
    assert.equal(
      prettyTimestamp("48 minutes ago"),
      "48 minutes ago",
      "non-ISO passes through"
    );
    console.log("ok  prettyTimestamp (ISO -> readable, passthrough)");
  }

  // ---- 10. parsePostHtml + bookmarklet, end to end --------------------------
  // Fixture mirrors the real inspected Pickax post page structure.
  {
    const FIXTURE_HTML = `<!DOCTYPE html><html><head>
<title>Misfit Electronic Gaming posted</title>
<meta name="description" content="post desc">
<meta property="og:title" content="Misfit Electronic Gaming posted">
<meta property="og:description" content="&#x1F534;&#x1F6A9;LIVE | | Splaterday Come Hang out Need Wtch Hr Now on Drop Live user=misfit_electronic_gaming 1311 Followers">
<meta property="og:image" content="https://pickax.com/favicon.png">
<meta property="og:url" content="https://pickax.com/post/707864">
</head><body>
<a aria-current="page" href="/post/707864" class="router-link-active router-link-exact-active absolute top-0 left-0 w-full h-full cursor-pointer z-0"></a>
<a href="/MisfitElectronicGaming" class="cursor-pointer"><img src="https://img.pickax.com/user-8356/ea28e48e-147a-4169-bb97-ba71a823d48f.jpeg" alt="" loading="lazy" decoding="async" class="rounded-full object-cover w-10 h-10 min-w-10"></a>
<a href="/MisfitElectronicGaming" class="cursor-pointer inline-block overflow-clip">Misfit Electronic Gaming</a>
<a href="/MisfitElectronicGaming" class="cursor-pointer text-sm inline-block overflow-clip">@MisfitElectronicGaming</a><span title="Sep 19, 2026, 9:11 PM" class="text-sm block font-thin">1 hour ago</span>
<span class="inline-flex items-center gap-1 bg-dark3 px-2 rounded-full text-sm" title="Post views" aria-label="Post views: 6">6</span>
<button class="font-poppins font-semibold"><svg><defs><linearGradient id="pg"><stop stop-color="#0083f5"/><stop stop-color="#00c4f5"/></linearGradient></defs></svg><div>1</div></button>
<button class="font-poppins font-semibold"><svg><defs><linearGradient id="ag"><stop stop-color="#dc1919"/><stop stop-color="#f59b00"/></linearGradient></defs></svg></button>
<iframe src="https://rumble.com/embed/v7djhge/" title="Splaterday stream"></iframe>
<img src="https://img.pickax.com/post-1234/abcd.jpeg" alt="post image">
</body></html>`;

    (globalThis as any).DOMParser = new JSDOM("").window.DOMParser;
    const p = parsePostHtml(FIXTURE_HTML);
    assert.equal(p.postId, "707864");
    assert.equal(p.displayName, "Misfit Electronic Gaming");
    assert.equal(p.username, "MisfitElectronicGaming");
    assert.equal(
      p.avatarUrl,
      "https://img.pickax.com/user-8356/ea28e48e-147a-4169-bb97-ba71a823d48f.jpeg"
    );
    assert.ok(
      p.text.startsWith("\u{1F534}\u{1F6A9}LIVE"),
      "post text extracted"
    );
    assert.ok(
      !p.text.includes("1311 Followers"),
      "SEO suffix stripped from text"
    );
    assert.equal(p.timestamp, "1 hour ago");
    assert.deepEqual(p.imageUrls, [
      "https://img.pickax.com/post-1234/abcd.jpeg",
    ]);
    assert.equal(p.picks, "1");
    assert.equal(p.axes, "0");
    assert.equal(p.views, "6");
    assert.equal(p.videoSrc, "https://rumble.com/embed/v7djhge/");
    assert.equal(p.videoTitle, "Splaterday stream");

    // Non-post HTML is rejected with a helpful error, not garbage data.
    let threw = false;
    try {
      parsePostHtml("<html><head><title>nope</title></head><body></body></html>");
    } catch {
      threw = true;
    }
    assert.ok(threw, "non-post HTML rejected");
    console.log("ok  parsePostHtml (all fields extracted, junk rejected)");

    // The real bookmarklet code, executed against the fixture DOM.
    const dom = new JSDOM(FIXTURE_HTML, {
      url: "https://pickax.com/post/707864",
    });
    let navigated = "";
    const fakeLocation = {
      pathname: "/post/707864",
      get href() {
        return "https://pickax.com/post/707864";
      },
      set href(v: string) {
        navigated = v;
      },
    };
    const body = BOOKMARKLET.replace(/^javascript:/, "");
    const fn = new (dom.window as any).Function(
      "document",
      "location",
      body
    );
    fn(dom.window.document, fakeLocation);
    assert.ok(
      navigated.startsWith(
        "https://masteringrumble.github.io/pickax-post-to-image/#import="
      ),
      `bookmarklet navigates to app (got ${navigated.slice(0, 60)}…)`
    );
    const payload = JSON.parse(
      decodeURIComponent(navigated.split("#import=")[1])
    );
    assert.equal(payload.postId, "707864");
    assert.equal(payload.displayName, "Misfit Electronic Gaming");
    assert.equal(payload.username, "MisfitElectronicGaming");
    assert.ok(payload.avatar.includes("img.pickax.com/user-8356"));
    assert.ok(!payload.text.includes("1311 Followers"));
    assert.equal(payload.picks, "1");
    assert.equal(payload.axes, "0");
    assert.equal(payload.views, "6");
    assert.equal(payload.videoSrc, "https://rumble.com/embed/v7djhge/");
    assert.deepEqual(payload.images, [
      "https://img.pickax.com/post-1234/abcd.jpeg",
    ]);

    // The app side: parseImportHash reads the same payload back.
    (globalThis as any).window = {
      location: { hash: "#import=" + encodeURIComponent(JSON.stringify(payload)) },
      history: { replaceState: () => {} },
    };
    const back = parseImportHash();
    assert.ok(back, "hash parsed");
    assert.equal(back!.username, "MisfitElectronicGaming");
    assert.equal(back!.postId, "707864");
    delete (globalThis as any).window;
    console.log("ok  bookmarklet end-to-end (extract -> hash -> parse back)");
  }

  console.log("\nALL SMOKE TESTS PASSED");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
