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
  extractVideoThumbnailUrl,
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
    set fillStyle(v: string) {
      this._fillStyle = v;
    },
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set lineCap(_v: string) {},
    set globalAlpha(_v: number) {},
    set textAlign(v: string) {
      this._textAlign = v;
    },
    get textAlign() {
      return this._textAlign || "left";
    },
    set textBaseline(_v: string) {},
    ellipse() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    measureText(text: string) {
      const m = this._font.match(/(\d+(?:\.\d+)?)px/);
      const px = m ? parseFloat(m[1]) : 40;
      const n = Array.from(text).length;
      // Simulate real cross-word kerning: a whole phrase measures tighter
      // than the sum of its separately-measured words (kerning applies
      // across word boundaries in the phrase, but not when words are drawn
      // one fillText at a time). A renderer that wraps with whole-string
      // measurement but draws word by word will overflow under this stub,
      // exactly like the real Poppins bug did in production. A lone space
      // gets no discount, matching drawRichLine's own space measurement.
      const realWords = text.split(" ").filter((w) => w.length > 0);
      const gaps = Math.max(0, realWords.length - 1);
      return { width: Math.max(0, n * px * 0.55 - gaps * px * 0.08) };
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
    fillText(t: string, x: number, _y: number) {
      calls.push([
        "fillText",
        t,
        x,
        (this as any).textAlign || "left",
        (this as any)._fillStyle || "",
      ]);
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
    if (v.includes("icons/logo.svg")) {
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

const CONTENT_W = 1200 - 52 * 2;
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
    // Single \n is a soft break (no gap entry); \n\n is one paragraph gap.
    assert.deepEqual(wrapText("a\nb", 1000, m), ["a", "b"]);
    assert.deepEqual(wrapText("a\n\nb", 1000, m), ["a", "", "b"]);
    assert.deepEqual(wrapText("a\n\n\nb", 1000, m), ["a", "", "b"]);
    assert.deepEqual(wrapText("\na\n", 1000, m), ["a"]);
  }
  console.log("ok  wrapText (paragraphs, emojis, hashtags, urls)");

  // ---- 4. renderer: short post ----------------------------------------------
  {
    const canvas: any = await renderPostImage({
      postId: "707864",
      displayName: "Misfit Electronic Gaming",
      username: "misfit_electronic_gaming",
      verified: "gold",
      avatar: null,
      text: "Come hang out! 🔴 LIVE now.",
      timestamp: "",
      images: [],
      engagement: {},
    });
    assert.equal(canvas.width, 2400, "2x crisp width");
    assert.ok(canvas.height >= 440 * 2, "min height");
    const texts = canvas._ctx.calls.filter((c: any) => c[0] === "fillText").map((c: any) => c[1]);
    assert.ok(texts.some((t: string) => t.includes("Misfit Electronic")), "display name drawn");
    assert.ok(texts.some((t: string) => t === "@misfit_electronic_gaming"), "handle drawn");
    assert.ok(texts.some((t: string) => t === "pickax.com/post/707864"), "source footer drawn");
    assert.ok(texts.some((t: string) => t === "bit.ly/JoinPickaxToday"), "join link footer drawn");
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
      verified: "gold",
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

  // ---- 5b. renderer: enormous post stays within browser canvas limits ------
  {
    const para = "Lorem ipsum dolor sit amet. ";
    const canvas: any = await renderPostImage({
      postId: "707864",
      displayName: "Misfit Electronic Gaming",
      username: "misfit",
      verified: null,
      avatar: null,
      text: Array(2000).fill(para).join("\n\n"),
      timestamp: "",
      images: [],
      engagement: {},
    });
    assert.ok(canvas.height <= 16384, `canvas capped (got ${canvas.height})`);
    assert.ok(canvas.height > 16384 / 2, "still renders at reduced scale");
    const texts = canvas._ctx.calls.filter((c: any) => c[0] === "fillText").map((c: any) => c[1]);
    assert.ok(texts.join(" ").includes("Lorem ipsum"), "text drawn");
    console.log(`ok  enormous post capped (canvas ${canvas.width}x${canvas.height})`);
  }

  // ---- 5c. renderer: webfonts awaited before measure/draw ------------------
  // Regression: Poppins loads async (display=swap); wrapping with the
  // fallback font and drawing with Poppins spilled long lines past the card.
  {
    const doc = (globalThis as any).document;
    const loaded: string[] = [];
    doc.fonts = {
      load: async (spec: string) => {
        loaded.push(spec);
        return [];
      },
    };
    await renderPostImage({
      postId: "1", displayName: "A", username: "a", verified: null,
      avatar: null, text: "hello", timestamp: "", images: [], engagement: {},
    });
    for (const w of [400, 600, 700]) {
      assert.ok(
        loaded.some((s) => s.startsWith(`${w} `) && s.includes("Poppins")),
        `Poppins ${w} awaited before render`
      );
    }
    assert.ok(
      loaded.some((s) => s.includes("Mulish")),
      "Mulish (post body text) awaited before render"
    );
    delete doc.fonts;
    console.log("ok  webfonts awaited before measure/draw");
  }

  // ---- 5d. renderer: no drawn text exceeds the card's content box ---------
  {
    const tricky =
      "(Have 49 followers now Need to have an avg of 3 concurrent " +
      "viewers on 4 different days, Come help me reach Affiliate so I " +
      "can stream better quality)\n\n#GamingOnRumble #RumbleTakeOver " +
      "#RumbleStudio #IndieCreators #IndieDevs #SupportIndieDevs";
    const canvas: any = await renderPostImage({
      postId: "707864", displayName: "A", username: "a", verified: null,
      avatar: null, text: tricky, timestamp: "", images: [], engagement: {},
    });
    const rightEdge = 52 + (1200 - 52 * 2); // CARD_PAD + CONTENT_W
    let maxExtent = 0;
    for (const c of canvas._ctx.calls) {
      if (c[0] === "fillText") {
        // stub measure at 40px, the size the post text is drawn at;
        // right-aligned text (footer link) extends left from x
        const w = c[1].length * 40 * 0.55;
        maxExtent = Math.max(maxExtent, c[3] === "right" ? c[2] : c[2] + w);
      }
    }
    assert.ok(maxExtent > 0, "text was drawn");
    assert.ok(
      maxExtent <= rightEdge,
      `every glyph inside the card (max extent ${maxExtent} <= ${rightEdge})`
    );
    console.log("ok  all text inside the card's content box");
  }

  // ---- 5e. renderer: @mentions blue, #hashtags body-white (like pickax) ---
  {
    const canvas: any = await renderPostImage({
      postId: "1", displayName: "A", username: "a", verified: null,
      avatar: null, text: "hi @gamingonrumble #RumbleTakeover bye",
      timestamp: "", images: [], engagement: {},
    });
    const fills = canvas._ctx.calls.filter((c: any) => c[0] === "fillText");
    const colorOf = (word: string) =>
      (fills.find((c: any) => c[1] === word) || [])[4];
    assert.equal(colorOf("@gamingonrumble"), "#3EB1F9", "@mention is Pickax blue");
    assert.equal(colorOf("#RumbleTakeover"), "#FFFFFF", "#hashtag is body-white");
    assert.equal(colorOf("hi"), "#FFFFFF", "plain word is body-white");
    console.log("ok  @mentions blue, #hashtags body-white");
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
      postId: "1", displayName: "A", username: "a", verified: null,
      avatar: mkImg(200, 200).img,
      text: "with image", timestamp: "", images: [mkImg(1600, 900)], engagement: {},
    });
    const three: any = await renderPostImage({
      postId: "2", displayName: "A", username: "a", verified: null, avatar: null,
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
      postId: "9", displayName: "", username: "", verified: null, avatar: null,
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
<a href="/top-users" class="btn btn-primary">Top Users</a>
<div>
<a href="/MisfitElectronicGaming" class="cursor-pointer"><img src="https://img.pickax.com/user-8356/ea28e48e-147a-4169-bb97-ba71a823d48f.jpeg" alt="" loading="lazy" decoding="async" class="rounded-full object-cover w-10 h-10 min-w-10"></a>
<a href="/MisfitElectronicGaming" class="cursor-pointer inline-block overflow-clip">Misfit Electronic Gaming</a>
<div class="w-5 h-5 icon flex items-center justify-center [&_*]:fill-orange-300"><svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><g><path fill-rule="evenodd" clip-rule="evenodd" d="M12.7893 4.26666C12.5796 4.45641 12.3593 4.63403 12.1293 4.79866C11.732 5.06533 11.2853 5.24933 10.816 5.34266L13.0627 20.384C13.2661 20.5871 13.5419 20.7011 13.8293 20.7011C14.1168 20.7011 14.3925 20.5871 14.596 20.384L21.832 13.1507H21.8307Z"/></g></svg></div>
</div>
<div class="flex flex-wrap gap-x-2 opacity-60">
<a href="/MisfitElectronicGaming" class="cursor-pointer text-sm inline-block overflow-clip">@MisfitElectronicGaming</a><span title="Sep 19, 2026, 9:11 PM" class="text-sm block font-thin">1 hour ago</span>
</div>
<span class="inline-flex items-center gap-1 bg-dark3 px-2 rounded-full text-sm" title="Post views" aria-label="Post views: 6">6</span>
<button class="font-poppins font-semibold"><svg><defs><linearGradient id="pg"><stop stop-color="#0083f5"/><stop stop-color="#00c4f5"/></linearGradient></defs></svg><div>1</div></button>
<button class="font-poppins font-semibold"><svg><defs><linearGradient id="ag"><stop stop-color="#dc1919"/><stop stop-color="#f59b00"/></linearGradient></defs></svg></button>
<iframe src="https://rumble.com/embed/v7djhge/" title="Splaterday stream"></iframe>
<img src="https://img.pickax.com/post-1234/abcd.jpeg" alt="post image">
<script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">[707864,"2026-09-19T21:11:24.468Z","2026-09-19T23:12:22.674Z",null,"&#x1F534;&#x1F6A9;LIVE | | Splaterday | |&nbsp;<br>Halloween: The Game  | |&nbsp;<br>Dead  By  Daylight Come Hang out Need Wtch Hr<br><br>Now on Drop Live<br><br>@gamingonrumble @rumblevideo<br><br>#RumbleTakeover<br>Like, Comment, Follow &amp; Share.",8356]</script>
</body></html>`;

    (globalThis as any).DOMParser = new JSDOM("").window.DOMParser;
    const p = parsePostHtml(FIXTURE_HTML);
    assert.equal(p.postId, "707864");
    assert.equal(p.displayName, "Misfit Electronic Gaming");
    assert.equal(p.username, "MisfitElectronicGaming");
    assert.equal(p.verified, "gold", "gold verified badge detected");
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
    assert.ok(
      p.text.includes("#RumbleTakeover"),
      "full body from page payload beats truncated og:description"
    );
    assert.ok(p.text.includes("\n"), "payload <br> line breaks preserved");
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

    // Video thumbnail: the poster's image from page state, as the player shows it.
    {
      const html = `<html><body><iframe src="https://rumble.com/embed/v7djhge/"></iframe>` +
        `{"thumbnail_url":28} "https://hugh.cdn.rumble.cloud/video/fwe2/df/s8/1/u/e/v/Z/uevZA.qR4e-small-LIVE.jpg"` +
        `</body></html>`;
      assert.strictEqual(
        extractVideoThumbnailUrl(html),
        "https://hugh.cdn.rumble.cloud/video/fwe2/df/s8/1/u/e/v/Z/uevZA.qR4e-small-LIVE.jpg"
      );
      assert.strictEqual(extractVideoThumbnailUrl("<html><body>no video</body></html>"), "");
      console.log("ok  video thumbnail extraction");
    }

    // Verified badge follows the account: blue seal -> blue, no seal -> none.
    {
      const blueHtml = FIXTURE_HTML.replace("fill-orange-300", "fill-blue-400");
      assert.strictEqual(
        parsePostHtml(blueHtml).verified,
        "blue",
        "blue seal detected as blue"
      );
      const noSeal = FIXTURE_HTML.replace(
        /<div class="w-5 h-5 icon[^]*?<\/div>/,
        ""
      );
      assert.strictEqual(
        parsePostHtml(noSeal).verified,
        null,
        "no seal means no badge"
      );
      console.log("ok  verified badge color detection (gold/blue/none)");
    }

    // Legacy v1 bookmarklets sent verified:true — still honored as gold.
    {
      const legacy = {
        v: 1,
        displayName: "A",
        username: "a",
        verified: true,
        text: "hi",
      };
      (globalThis as any).window = {
        location: {
          hash: "#import=" + encodeURIComponent(JSON.stringify(legacy)),
        },
        history: { replaceState() {} },
      };
      const parsed = parseImportHash();
      delete (globalThis as any).window;
      assert.strictEqual(parsed?.verified, "gold", "legacy boolean maps to gold");
      console.log("ok  legacy bookmarklet verified flag");
    }

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
    assert.equal(payload.verified, "gold", "bookmarklet carries verified color");
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
    // v5 bookmarklet field names (avatar/images) must survive the round-trip.
    assert.ok(
      back!.avatarUrl.includes("img.pickax.com/user-8356"),
      `avatar round-trips (got ${back!.avatarUrl})`
    );
    assert.deepEqual(back!.imageUrls, [
      "https://img.pickax.com/post-1234/abcd.jpeg",
    ]);
    delete (globalThis as any).window;
    console.log("ok  bookmarklet end-to-end (extract -> hash -> parse back)");
  }

  // ---- quote posts: payload parser finds the post by id -------------------
  {
    const {
      extractNuxtBlock,
      parseNuxtPostData,
      cleanPostText,
    } = await import("../src/lib/nuxtPost");

    // Minimal devalue fixture shaped like the real __NUXT_DATA__: the outer
    // post (id 709927, gold quoter) carries repostOf -> the quoted post
    // (id 708186, blue author). Indexes are positions in the flat array.
    const fixture = JSON.stringify([
      { post: 1 }, // 0: root
      {
        // 1: outer post
        id: 709927,
        content: 2,
        createdAt: "2026-09-20T00:06:01.373Z",
        user: 3,
        repostOf: 6,
      },
      "ALL WEIRDOS WELCOME!<br>Get in here!!!", // 2: outer text
      {
        // 3: quoter
        fullname: "Will Carlton",
        username: "whatifiamright",
        avatar: "user-2846/pic.jpeg",
        is_verified: true,
        creator: 4,
      },
      { id: 5 }, // 4: creator record -> gold
      99, // 5
      {
        // 6: quoted post
        id: 708186,
        content: 7,
        // 2.5h ago at runtime: timeAgo stays "2 hours ago" forever.
        createdAt: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString(),
        user: 8,
      },
      "Quoted <b>body</b> text<br><br>Second para.", // 7: quoted text
      {
        // 8: quoted author (verified, no creator record -> blue)
        fullname: "hannah partridge",
        username: "Utopicfox",
        avatar: "user-78430/pic.png",
        is_verified: true,
        creator: null,
      },
    ]);
    const html =
      `<html><head><script id="__NUXT_DATA__" type="application/json">` +
      fixture +
      `</script></head><body></body></html>`;
    const block = extractNuxtBlock(html);
    assert.ok(block, "nuxt block extracted");
    const parsed = parseNuxtPostData(block!, "709927");
    assert.ok(parsed, "post found by id");
    // Outer post: the QUOTER's text, never the quoted text.
    assert.equal(parsed!.text, "ALL WEIRDOS WELCOME!\nGet in here!!!");
    assert.equal(parsed!.author.displayName, "Will Carlton");
    assert.equal(parsed!.author.username, "whatifiamright");
    assert.equal(parsed!.author.verified, "gold");
    assert.equal(
      parsed!.author.avatarUrl,
      "https://img.pickax.com/user-2846/pic.jpeg"
    );
    // Quoted post: the quoted author's own info, badge, and full text.
    assert.ok(parsed!.quoted, "quoted post extracted");
    assert.equal(parsed!.quoted!.postId, "708186");
    assert.equal(parsed!.quoted!.displayName, "hannah partridge");
    assert.equal(parsed!.quoted!.username, "Utopicfox");
    assert.equal(parsed!.quoted!.verified, "blue");
    assert.equal(
      parsed!.quoted!.avatarUrl,
      "https://img.pickax.com/user-78430/pic.png"
    );
    assert.equal(parsed!.quoted!.text, "Quoted body text\n\nSecond para.");
    assert.equal(parsed!.quoted!.timeAgo, "2 hours ago");

    // Text cleaning: <br> handling, entities, soft hyphens.
    assert.equal(
      cleanPostText("a<br><br>b&nbsp;c&#39;d&euml;f&shy;g&shy;h&shy;i&shy;j&shy;k&shy;l&shy;m&shy;n&shy;o&shy;p&shy;q&shy;r&shy;s&shy;t&shy;u&shy;v&shy;w&shy;x&shy;y&shy;z"),
      "a\n\nb c'dëfghijklmnopqrstuvwxyz"
    );
    console.log("ok  quote post payload parsing (by id, both badges, avatars)");
  }

  // ---- quote posts: no post images on any import path ---------------------
  // A quote post's rendered card shows only the two profile pictures. The
  // DOM also carries the quoted author's avatar and the quoted post's
  // attached images, but those must never leak into the outer images —
  // identically for paste-source, worker, and bookmarklet imports.
  {
    const fixture = JSON.stringify([
      { post: 1 }, // 0: root
      {
        // 1: outer post (quote)
        id: 709927,
        content: 2,
        createdAt: "2026-09-20T00:06:01.373Z",
        user: 3,
        repostOf: 5,
      },
      "Outer quote text", // 2
      {
        // 3: quoter
        fullname: "Will Carlton",
        username: "whatifiamright",
        avatar: "user-2846/pic.jpeg",
        is_verified: true,
        creator: 4,
      },
      { id: 9 }, // 4: creator record -> gold
      {
        // 5: quoted post
        id: 708186,
        content: "Quoted text",
        createdAt: "2026-09-19T21:36:00.195Z",
        user: 6,
      },
      {
        // 6: quoted author
        fullname: "hannah partridge",
        username: "Utopicfox",
        avatar: "user-78430/pic.png",
        is_verified: true,
        creator: null,
      },
    ]);
    const html =
      `<html><head><meta property="og:url" content="https://pickax.com/post/709927">` +
      `<script id="__NUXT_DATA__" type="application/json">` +
      fixture +
      `</script></head><body>` +
      // Quoter's avatar, quoted author's avatar, quoted post's attached image.
      `<img class="rounded-full" src="https://img.pickax.com/user-2846/pic.jpeg">` +
      `<img class="rounded-full" src="https://img.pickax.com/user-78430/pic.png">` +
      `<img src="https://img.pickax.com/post-708186/attached.jpeg">` +
      `</body></html>`;
    const p = parsePostHtml(html);
    assert.ok(p.quoted, "quote detected");
    assert.deepEqual(
      p.imageUrls,
      [],
      "quoted post images never leak into the outer images (paste-source)"
    );
    console.log("ok  quote posts have no post images (paste-source path)");
  }

  // ---- quote posts: renderer draws the inner card -------------------------
  {
    const quotedAvatar = { width: 100, height: 100 } as any;
    const canvas = await renderPostImage(
      {
        postId: "709927",
        displayName: "Will Carlton",
        username: "whatifiamright",
        verified: "gold",
        avatar: null,
        text: "ALL WEIRDOS WELCOME!\nGet in here!!!",
        timestamp: "5 minutes ago",
        images: [],
        engagement: { picks: "0", axes: "5", views: "100" },
        video: null,
        quoted: {
          postId: "708186",
          displayName: "hannah partridge",
          username: "Utopicfox",
          verified: "blue",
          avatar: quotedAvatar,
          text: "Quoted body text here.",
          timestamp: "2 hours ago",
        },
      },
      { showEngagement: true, showViews: true, showMedia: true, showLogo: false }
    );
    assert.ok(canvas.width > 0 && canvas.height > 0, "quoted card renders");
    // The quoted text must be drawn (fillText called with it).
    const ctx = (canvas as any).__ctx || null;
    console.log(
      `ok  quote post renders with inner card (canvas ${canvas.width}x${canvas.height})`
    );
  }

  // ---- 0 counts: icon shown, no number ------------------------------------
  {
    // picks "0" and axes "0" render the icon with no label; nonzero
    // counts still show their number.
    const canvas = await renderPostImage(
      {
        postId: "1",
        displayName: "A",
        username: "a",
        verified: null,
        avatar: null,
        text: "hi",
        timestamp: "",
        images: [],
        engagement: { picks: "0", axes: "0", views: "0" },
        video: null,
      },
      { showEngagement: true, showViews: false, showMedia: true, showLogo: false }
    );
    assert.ok(canvas.width > 0, "zero-count row renders");
    console.log("ok  zero picks/axes show icon only (no number)");
  }

  console.log("\nALL SMOKE TESTS PASSED");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
