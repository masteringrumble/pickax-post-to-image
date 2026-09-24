/* Pickax Post to Image — content script.
 *
 * Runs on https://pickax.com/* pages. Two jobs:
 *
 * 1. Element picker (uBlock Origin style): clicking the toolbar button puts
 *    the page in picker mode — hovering a post card highlights it, clicking
 *    it pops up an options panel right on the page with a live preview and
 *    the same "Show in image" toggles as the website, then Download renders
 *    the PNG. No buttons are injected into posts. Esc cancels.
 * 2. Post extraction: the payload + DOM extraction the picker (and the
 *    toolbar fallback) uses to build the image.
 *
 * Privacy: nothing leaves the browser except the post data you explicitly
 * turn into an image. No accounts, no analytics, no background transmission.
 */
(function () {
  "use strict";

  var api = globalThis.browser || globalThis.chrome || null;
  // Guard against double-injection (e.g. the background script's fallback
  // re-injects this file into a tab that already has it).
  if (globalThis.__pickaxPostToImageInjected) return;
  globalThis.__pickaxPostToImageInjected = true;

  var RENDER_MSG = "pickax-post-to-image:render";
  var PREVIEW_MSG = "pickax-post-to-image:preview";
  var PREVIEW_TAB_RESULT = "pickax-post-to-image:preview-tab-result";
  var RENDER_TAB_DONE = "pickax-post-to-image:render-tab-done";

  // Pending results from hidden-tab renders (browsers without the
  // offscreen API, e.g. Firefox): the background spawns a hidden render
  // tab that replies directly to this tab. reqId -> { resolve, timer }.
  var pendingTabResults = {};
  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener(function (msg) {
      if (!msg) return;
      if (msg.type === PREVIEW_TAB_RESULT || msg.type === RENDER_TAB_DONE) {
        var pending = pendingTabResults[msg.reqId];
        if (pending) {
          delete pendingTabResults[msg.reqId];
          if (pending.timer) clearTimeout(pending.timer);
          pending.resolve(msg);
        }
      }
    });
  }
  function waitForTabResult(reqId, timeoutMs) {
    return new Promise(function (resolve) {
      var timer = setTimeout(function () {
        delete pendingTabResults[reqId];
        resolve({ ok: false, error: "render-timeout" });
      }, timeoutMs || 90000);
      pendingTabResults[reqId] = { resolve: resolve, timer: timer };
    });
  }
  var ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABvUlEQVR4nMVXy07DMBCcrTgln8alQghFfVBViH+Az+BQceLNASoOiCMH+Krm6OUQO3H8TJzQWlpFdbI74/V4uya4xs+OwUCyCc98kZMJ1Z74HQgcAtdt3hCZ7B2cAbzsuE1gn+DKnioSFYF9gysDQP8muI42OSQ4GDjq8hEfZ0gd9FoOy8AQcADgRRaMT/j2a0CB05e2ip5p56WM8ejORDgD9TJksGkGPgmvKBYjmQBPm63g0x4kQgREVwIC9hhKQPTMAH2U9U96Dys7SkDTUfgYGs607QHsI2CI2J8B4XBOMT2G4wS5CQiHszQuKgHyzBYir+S7dWYT8Bxfm4D+oUGAi+ok8Ew+tSLDKzm3ls+LLCxCJwGTpeaswAFZXtWr86wGBwC6K1t+MQKET1kJHSniM7sMm7XdAlfzl21f2oQqoa+8RsDBAD2UFrjL178FodoeAa9JmOACoNuyHaCTBjwEYn+pPh3RxtBDKoEU8K4xCNtwS8aLYf0AANCNP4PRhoSeS3fUEcCrDLwduiktcjoUOK5ySr8XjNARA+piMu+ZhTHAr6v7YXM3XHYkMSI4YN6O1bj3CHOEPTeh/gAImmYY9b2WXQAAAABJRU5ErkJggg=="; // inlined icon-32.png (no web_accessible_resources needed)

  // An engagement button (pick / axe / comment): a real page button holding
  // an icon SVG plus a numeric count. Color-agnostic — Pickax restyles these
  // icons (feed vs post page), so hex sniffing breaks across surfaces.
  function isEngagementButton(b) {
    if (!b || !b.innerHTML) return false;
    if (b.innerHTML.indexOf("<svg") === -1) return false;
    return /(\d[\d,]*)/.test(b.textContent || "");
  }

  function engagementCount(b) {
    var m = (b.textContent || "").match(/(\d[\d,]*)/);
    return m ? m[1] : "";
  }

  // Comment buttons carry a speech-bubble icon; their counts must never be
  // mistaken for axe counts.
  function isCommentButton(b) {
    return (b.innerHTML || "").indexOf("M12 16L7 21") > -1;
  }

  function cleanText(s) {
    return String(s || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#(\d+);/g, function (m, n) {
        return String.fromCharCode(parseInt(n, 10));
      })
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\\xad/gi, "")
      .replace(/\u00ad/g, "")
      .replace(/\\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function timeAgo(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return "";
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "just now";
    var m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    var h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    var dd = Math.floor(h / 24);
    if (dd < 7) return dd + (dd === 1 ? " day ago" : " days ago");
    return new Date(t).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Compact devalue resolver: the __NUXT_DATA__ payload is a flat array and
  // integers in value positions are indexes into it. The post is matched by
  // id, so on quote posts the outer fields can never be mixed up with the
  // quoted post's (which arrives via repostOf with its own author/avatar).
  function dvD(A, i, M, S) {
    if (M[i] !== undefined) return M[i];
    if (S[i]) return undefined;
    S[i] = 1;
    var v = A[i],
      o,
      k;
    if (v && typeof v === "object") {
      o = Array.isArray(v) ? [] : {};
      M[i] = o;
      for (k in v) o[k] = dvV(A, v[k], M, S);
    } else {
      o = v;
    }
    S[i] = 0;
    M[i] = o;
    return o;
  }

  function dvV(A, v, M, S) {
    if (
      typeof v === "number" &&
      v >= 0 &&
      v < A.length &&
      Math.floor(v) === v
    )
      return dvD(A, v, M, S);
    if (v && typeof v === "object") {
      var o = Array.isArray(v) ? [] : {},
        k;
      for (k in v) o[k] = dvV(A, v[k], M, S);
      return o;
    }
    return v;
  }

  // Extract the visible post into the payload shape the renderer accepts.
  // root: scope DOM queries to one post card (feed) or the whole document
  //   (post page). The __NUXT_DATA__ payload walk stays global — posts are
  //   matched by id, so it works for any card on the page.
  // postIdOverride: the card's post id (feed cards); on post pages it comes
  //   from the URL.
  function extractPost(root, postIdOverride) {
    var d = root || document;
    var isPage = !root || root === document || root === document.documentElement;
    function q(s) {
      return d.querySelector(s);
    }
    function qa(s) {
      return d.querySelectorAll(s);
    }
    function meta(p) {
      var e = document.querySelector('meta[property="' + p + '"]');
      return e ? e.getAttribute("content") || "" : "";
    }

    var o = {
      v: 6,
      postId: postIdOverride || "",
      displayName: "",
      text: "",
      username: "",
      verified: "",
      avatarUrl: "",
      timestamp: "",
      picks: "",
      axes: "",
      views: "",
      videoSrc: "",
      videoTitle: "",
      videoThumb: "",
      imageUrls: [],
      linkCard: null,
      q: null,
    };

    // Page-level defaults (post pages only): og tags describe the post.
    // On feed pages the og tags describe the site, so card posts skip them
    // and rely on the payload walk + card-scoped DOM below.
    if (isPage) {
      o.displayName = (meta("og:title") || "").replace(/\s+posted\s*$/i, "");
      o.text = (meta("og:description") || "").replace(
        /\s*user=\S+\s+[\d,]+\s+Followers\s*$/i,
        ""
      );
      var pm0 = location.pathname.match(/\/post\/(\d+)/);
      if (pm0 && !o.postId) o.postId = pm0[1];
    }

    // Author row: the @username link; the display-name link (same href,
    // non-@ text) sits beside the verification seal in the header container.
    Array.prototype.forEach.call(qa('a[href^="/"]'), function (a) {
      var t = (a.textContent || "").trim();
      if (t.charAt(0) === "@" && t.length > 1) {
        if (!o.username) o.username = t.slice(1).trim();
        var dn = null;
        Array.prototype.forEach.call(
          qa('a[href="' + a.getAttribute("href") + '"]'),
          function (x) {
            var xt = (x.textContent || "").trim();
            if (xt && xt.charAt(0) !== "@" && !dn) dn = x;
          }
        );
        // Display-name fallback for card-scoped extraction (feed cards and
        // the per-post button), where the og:title default doesn't apply.
        // The payload walk overwrites this with the authoritative fullname
        // when it succeeds.
        if (dn && !o.displayName) {
          var dnt = (dn.textContent || "").trim();
          if (dnt && dnt.length < 80) o.displayName = dnt;
        }
        if (!o.verified) {
          var pe = dn ? dn.parentElement : null;
          if (pe && pe.innerHTML.indexOf("12.7893 4.26666") > -1) {
            var ph = pe.innerHTML.toLowerCase();
            o.verified =
              ph.indexOf("3eb1f9") > -1 || /fill-(blue|sky)-\d{3}/.test(ph)
                ? "blue"
                : "gold";
          }
        }
        var s = a.nextElementSibling;
        if (s && s.tagName === "SPAN" && s.getAttribute("title") && !o.timestamp)
          o.timestamp = (s.textContent || "").trim();
      }
    });

    // The author's avatar: the rounded-full image inside a link to the
    // author's own profile — not the first rounded-full on the page, which
    // is the LOGGED-IN viewer's avatar in the nav.
    var av = null;
    if (o.username) {
      var authorHref = "/" + o.username.toLowerCase();
      Array.prototype.forEach.call(qa('a[href^="/"]'), function (a) {
        if (av) return;
        if ((a.getAttribute("href") || "").toLowerCase() !== authorHref)
          return;
        var im = a.querySelector('img.rounded-full[src*="img.pickax.com"]');
        if (im) av = im;
      });
    }
    if (!av) av = q('img.rounded-full[src*="img.pickax.com"]');
    if (av) o.avatarUrl = av.src;

    var vs = q('span[title="Post views"]');
    if (vs) {
      var vm = (vs.getAttribute("aria-label") || "").match(/(\d[\d,]*)/);
      if (vm) o.views = vm[1];
    }

    // Engagement buttons: pick / axe / comment render as icon-SVG + numeric
    // count (the feed's axe button is icon-only with no public count).
    // Identify pick vs axe by icon colors when present (feed: red-yellow
    // gradient; post pages: blue/red scheme); fall back to row order —
    // Pickax renders pick first, axe second. Comment buttons are excluded
    // via their speech-bubble icon so comment counts never leak into axes.
    var engBtns = [];
    Array.prototype.forEach.call(qa("button"), function (b) {
      if (isEngagementButton(b) && !isCommentButton(b)) engBtns.push(b);
    });
    Array.prototype.forEach.call(engBtns, function (b) {
      var h = b.innerHTML || "";
      if (
        !o.picks &&
        (h.indexOf("0083f5") > -1 ||
          h.indexOf("FD5E5E") > -1 ||
          h.indexOf("FDCF5E") > -1)
      )
        o.picks = engagementCount(b);
      else if (!o.axes && h.indexOf("dc1919") > -1) o.axes = engagementCount(b);
    });
    if (!o.picks && engBtns.length > 0) o.picks = engagementCount(engBtns[0]);
    if (!o.axes && engBtns.length > 1) o.axes = engagementCount(engBtns[1]);

    var fr = q('iframe[src*="rumble.com/embed"]');
    if (fr) {
      o.videoSrc = fr.src || "";
      o.videoTitle = fr.getAttribute("title") || "";
    }
    var htmlForThumb = isPage
      ? document.documentElement.innerHTML
      : d.innerHTML || "";
    var thm = htmlForThumb.match(
      /https:\/\/[a-z0-9.-]+\.cdn\.rumble\.cloud\/[^"\\\s'<>]+\.(?:jpg|jpeg|png|webp)/i
    );
    if (thm) o.videoThumb = thm[0];

    // Every rounded-full image is an avatar (author, viewer, commenters) —
    // never a post image — so all are excluded, not just the author's.
    // Link card preview images (img.pickax.com/metadata/...) are excluded
    // too: they belong to the link card, not the post's own attached images.
    o.imageUrls = Array.prototype.filter.call(
      qa('img[src*="img.pickax.com"]'),
      function (img) {
        var s = img.src || "";
        return (
          img !== av &&
          !(img.classList && img.classList.contains("rounded-full")) &&
          s.indexOf("/metadata/") === -1
        );
      }
    )
      .map(function (img) {
        return img.src;
      });

    // Link card DOM fallback (only when the payload didn't provide one):
    // div[title] wrapping an http anchor around a metadata/ preview image.
    function extractLinkCardDOM() {
      var divs = qa("div[title]"),
        found = null;
      Array.prototype.forEach.call(divs, function (cd) {
        if (found) return;
        var mi = cd.querySelector('img[src*="img.pickax.com/metadata/"]');
        if (!mi || !mi.src) return;
        var as = cd.querySelectorAll('a[href^="http"]');
        if (!as.length) return;
        var u2 = (as[0].getAttribute("href") || "").trim();
        if (!u2) return;
        var ti = (cd.getAttribute("title") || "").trim(),
          dm = "",
          lg = "";
        Array.prototype.forEach.call(as, function (a) {
          var t = (a.textContent || "").trim();
          if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t) && t.indexOf(" ") === -1 && !dm)
            dm = t;
          if (t.length > lg.length) lg = t;
        });
        if (!ti) ti = lg;
        if (!dm) {
          try {
            dm = new URL(u2).hostname.replace(/^www\./i, "");
          } catch (e) {
            /* keep empty */
          }
        }
        found = {
          url: u2,
          title: ti,
          domain: dm,
          imageUrl: mi.src,
          description: "",
        };
      });
      return found;
    }

    // Full post body from the page payload (og:description is truncated).
    var nd = document.getElementById("__NUXT_DATA__");
    var textFromPayload = false;
    if (nd && o.postId) {
      try {
        var A = JSON.parse(nd.textContent || "");
        if (A && A.length) {
          var RT = dvD(A, 0, {}, {}),
            seen = [],
            tgt = null;
          (function walk(x) {
            if (tgt || !x || typeof x !== "object") return;
            if (seen.indexOf(x) > -1) return;
            seen.push(x);
            if (
              typeof x.content === "string" &&
              String(x.id) === String(o.postId) &&
              x.user
            ) {
              tgt = x;
              return;
            }
            for (var k in x) walk(x[k]);
          })(RT);
          if (tgt) {
            var u = tgt.user || {},
              ct = cleanText(tgt.content);
            if (ct) {
              o.text = ct;
              textFromPayload = true;
            }
            if (u.fullname) o.displayName = u.fullname;
            if (u.username)
              o.username = String(u.username).replace(/^@+/, "");
            if (u.avatar) o.avatarUrl = "https://img.pickax.com/" + u.avatar;
            o.verified = u.creator
              ? "gold"
              : u.is_verified
                ? "blue"
                : o.verified;
            // The payload's attachments are the authoritative post images:
            // they never include the link card's preview image (metadata/...).
            var at2 = tgt.attachments;
            if (at2 && at2.length) {
              var im2 = [];
              for (var ai2 = 0; ai2 < at2.length && im2.length < 4; ai2++) {
                var w2 = at2[ai2];
                if (w2 && w2.type === "image" && w2.url)
                  im2.push("https://img.pickax.com/" + w2.url);
              }
              if (im2.length) o.imageUrls = im2;
            }
            // The shared-website link card (post.link): preview image,
            // domain, title. Generic — works for any website the post shares.
            var lk2 = tgt.link;
            if (lk2 && (lk2.url || lk2.title)) {
              var lcu = lk2.url || lk2.inputUrl || "",
                lch = "";
              try {
                lch = new URL(lcu).hostname.replace(/^www\./i, "");
              } catch (e) {
                /* keep empty */
              }
              o.linkCard = {
                url: lcu,
                title: lk2.title || "",
                domain: lch,
                imageUrl: lk2.image || "",
                description: lk2.description || "",
              };
            }
            var rp = tgt.repostOf;
            if (rp && typeof rp.content === "string") {
              var qu = rp.user || {};
              o.q = {
                postId: String(rp.id || ""),
                displayName: qu.fullname || "",
                username: String(qu.username || "").replace(/^@+/, ""),
                avatarUrl: qu.avatar
                  ? "https://img.pickax.com/" + qu.avatar
                  : "",
                verified: qu.creator
                  ? "gold"
                  : qu.is_verified
                    ? "blue"
                    : "",
                text: cleanText(rp.content),
                timestamp: timeAgo(rp.createdAt || ""),
              };
            }
          }
        }
      } catch (e) {
        /* fall back to the meta-tag fields above */
      }
    }

    // DOM fallback for the post body. The payload walk can miss — feed
    // payload shape, logged-in page differences, or a stale SPA payload —
    // but the card always renders the full post text visibly in
    // .text-content (Pickax's real post-body container). Scoped to the
    // card so feed cards never steal a neighbor's text. This also beats
    // the truncated og:description stub on post pages when the payload
    // didn't deliver.
    if (!textFromPayload) {
      var tc = q(".text-content");
      if (tc) {
        var dt = cleanText(tc.innerHTML);
        if (dt) o.text = dt;
      }
    }

    // On quote posts there are no post images: the quoted card shows only
    // the quoted author's avatar + text, and the DOM's other images belong
    // to the quoted post. Same rule as the worker and paste-source paths.
    if (o.q) o.imageUrls = [];

    // Link card DOM fallback when the payload didn't carry post.link.
    if (!o.linkCard) o.linkCard = extractLinkCardDOM();

    return o;
  }

  // Exposed for the Node smoke test (harmless in production).
  globalThis.__pickaxExtractPost = extractPost;

  // Small transient status message, Pickax-styled. Used by the picker for
  // feedback ("Rendering…", "Image downloaded ✓").
  function toast(msg) {
    try {
      var old = document.getElementById("pickax-post-to-image-toast");
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var d = document.createElement("div");
      d.id = "pickax-post-to-image-toast";
      d.textContent = msg;
      d.style.cssText =
        "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);" +
        "z-index:2147483647;pointer-events:none;white-space:nowrap;" +
        "background:rgba(20,26,40,.96);color:#fff;font-size:14px;" +
        "font-family:system-ui,sans-serif;padding:10px 18px;" +
        "border-radius:9999px;border:1px solid #3EB1F9;" +
        "box-shadow:0 8px 28px rgba(0,0,0,.55);";
      document.body.appendChild(d);
      setTimeout(function () {
        if (d.parentNode) d.parentNode.removeChild(d);
      }, 2600);
    } catch (e) {
      /* never break the page */
    }
  }  // -------------------------------------------------------------------------
  // Element picker (uBlock Origin style)
  // -------------------------------------------------------------------------
  // Toolbar click -> PICK_MSG -> the page enters picker mode: hovering a
  // post card highlights it, clicking it renders + downloads the image,
  // Esc cancels. No buttons are injected into posts anymore.

  var PICK_MSG = "pickax-post-to-image:pick";

  var picking = false;
  var hoverCard = null;
  var pickHL = null; // highlight overlay
  var pickPill = null; // hint pill
  var pickRaf = 0;
  var lastOverEvent = null;
  var savedCursor = "";

  // requestAnimationFrame doesn't exist in the Node test harness — fall
  // back to running the hover update synchronously there.
  var raf =
    typeof requestAnimationFrame !== "undefined"
      ? requestAnimationFrame
      : function (fn) {
          fn();
          return 0;
        };

  function postIdFromAnchor(a) {
    var m = (a.getAttribute("href") || "").match(/\/post\/(\d+)/);
    return m ? m[1] : "";
  }

  // The post card is the smallest ancestor of any element inside it that
  // holds both a /post/ link and the engagement buttons (pick / axe /
  // comment). The link must be a DIRECT child (the card's full-bleed
  // overlay anchor) — otherwise a feed-level container whose subtree merely
  // contains cards would match too. Requiring the link also keeps us out of
  // the action row itself (buttons but no link) and out of the header
  // (link but no buttons).
  function directPostLink(node) {
    var kids = node.children;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (
        k.tagName === "A" &&
        /\/post\/\d+/.test(k.getAttribute("href") || "")
      )
        return k;
    }
    return null;
  }

  function cardFromElement(el) {
    var node = el && el.nodeType === 1 ? el : null;
    for (var i = 0; i < 14 && node && node !== document.body; i++) {
      var link = directPostLink(node);
      var hasEng = false;
      if (link) {
        var btns = node.querySelectorAll("button");
        for (var b = 0; b < btns.length; b++) {
          if (isEngagementButton(btns[b])) {
            hasEng = true;
            break;
          }
        }
      }
      if (link && hasEng) return node;
      node = node.parentElement;
    }
    return null;
  }

  function postIdFromCard(card) {
    var a = card.querySelector('a[href*="/post/"]');
    return a ? postIdFromAnchor(a) : "";
  }

  function ensurePickerDom() {
    if (pickHL) return;
    pickHL = document.createElement("div");
    pickHL.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;" +
      "z-index:2147483646;display:none;" +
      "outline:3px solid #3EB1F9;outline-offset:3px;border-radius:14px;" +
      "box-shadow:0 0 0 6px rgba(62,177,249,.22),0 12px 40px rgba(0,0,0,.5);" +
      "transition:left .12s ease,top .12s ease,width .12s ease,height .12s ease;";
    document.body.appendChild(pickHL);

    pickPill = document.createElement("div");
    var iconUrl = ICON_DATA_URL;
    pickPill.innerHTML =
      (iconUrl
        ? '<img src="' +
          iconUrl +
          '" alt="" style="width:18px;height:18px;border-radius:4px;' +
          'vertical-align:-4px;margin-right:8px;pointer-events:none;">'
        : "") +
      "<span>Click a post to turn it into an image</span>" +
      '<span style="opacity:.65;margin-left:10px;">Esc to cancel</span>';
    pickPill.style.cssText =
      "position:fixed;left:50%;top:18px;transform:translateX(-50%);" +
      "z-index:2147483647;pointer-events:none;white-space:nowrap;" +
      "background:rgba(20,26,40,.96);color:#fff;font-size:14px;" +
      "font-family:system-ui,sans-serif;padding:10px 18px;" +
      "border-radius:9999px;border:1px solid #3EB1F9;" +
      "box-shadow:0 8px 28px rgba(0,0,0,.55);";
    document.body.appendChild(pickPill);
  }

  function setHover(card) {
    hoverCard = card;
    if (!pickHL) return;
    if (!card) {
      pickHL.style.display = "none";
      return;
    }
    var r = card.getBoundingClientRect();
    pickHL.style.display = "block";
    pickHL.style.left = r.left + "px";
    pickHL.style.top = r.top + "px";
    pickHL.style.width = r.width + "px";
    pickHL.style.height = r.height + "px";
  }

  function applyPickOver() {
    pickRaf = 0;
    if (!picking || !lastOverEvent) return;
    var t = lastOverEvent.target;
    lastOverEvent = null;
    setHover(cardFromElement(t));
  }

  function onPickOver(e) {
    lastOverEvent = e;
    if (!pickRaf) pickRaf = raf(applyPickOver);
  }

  function onPickScroll() {
    if (picking && hoverCard) setHover(hoverCard);
  }

  function onPickClick(e) {
    if (!picking || !hoverCard) return; // empty clicks pass through
    // Capture phase: stop the click before the card's overlay link can
    // navigate away.
    e.preventDefault();
    e.stopPropagation();
    var card = hoverCard;
    var postId = postIdFromCard(card);
    stopPicker();
    if (!postId) {
      toast("Couldn't read that post.");
      return;
    }
    openPanelForCard(card, postId);
  }

  function onPickKey(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      stopPicker();
    }
  }

  // -------------------------------------------------------------------------
  // In-extension options panel
  // -------------------------------------------------------------------------
  // After picking a post, a panel pops up right on the page with the same
  // "Show in image" options as the website. Download renders via the
  // offscreen document and saves the PNG — the site never opens.

  var PANEL_BACKDROP_ID = "pickax-post-to-image-panel-backdrop";

  function paintSwitch(sw, on) {
    sw.setAttribute("aria-checked", on ? "true" : "false");
    sw.style.cssText =
      "width:44px;height:26px;border-radius:9999px;border:none;cursor:pointer;" +
      "position:relative;flex:none;transition:background .15s;padding:0;" +
      (on ? "background:#3EB1F9;" : "background:#3a4358;");
    var k = sw.firstChild;
    if (!k || k.tagName !== "SPAN") {
      sw.textContent = "";
      k = document.createElement("span");
      sw.appendChild(k);
    }
    k.style.cssText =
      "position:absolute;top:3px;left:" +
      (on ? "21px" : "3px") +
      ";width:20px;height:20px;border-radius:50%;background:#fff;" +
      "transition:left .15s;box-shadow:0 1px 3px rgba(0,0,0,.4);display:block;";
  }

  function makeSwitch(on, onFlip) {
    var sw = document.createElement("button");
    sw.type = "button";
    sw.setAttribute("role", "switch");
    paintSwitch(sw, on);
    sw.addEventListener("click", function (e) {
      e.stopPropagation();
      var v = sw.getAttribute("aria-checked") !== "true";
      paintSwitch(sw, v);
      onFlip(v);
    });
    return sw;
  }

  function closePanel() {
    var b = document.getElementById(PANEL_BACKDROP_ID);
    if (b && b.parentNode) b.parentNode.removeChild(b);
    document.removeEventListener("keydown", onPanelKey, true);
  }

  function onPanelKey(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    }
  }

  function showPanel(payload) {
    closePanel();
    // Same options + same visibility rules as the website's "Show in image"
    // toggles (App.tsx): Logo / Views / Picks & axes always; Post images
    // only when the post has images or a video; Site embed only when the
    // post has a link card and no video.
    var opts = {
      showLogo: true,
      showViews: true,
      showMedia: true,
      showLinkCard: true,
      showEngagement: true,
    };
    var hasMedia =
      (payload.imageUrls && payload.imageUrls.length > 0) ||
      !!payload.videoSrc;
    var toggles = [
      { key: "showLogo", label: "Logo", show: true },
      { key: "showViews", label: "Views", show: true },
      { key: "showMedia", label: "Post images", show: hasMedia },
      {
        key: "showLinkCard",
        label: "Site embed",
        show: !!payload.linkCard && !payload.videoSrc,
      },
      { key: "showEngagement", label: "Picks & axes", show: true },
    ];

    var backdrop = document.createElement("div");
    backdrop.id = PANEL_BACKDROP_ID;
    backdrop.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;" +
      "align-items:center;justify-content:center;background:rgba(0,0,0,.65);" +
      "font-family:system-ui,-apple-system,sans-serif;";
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closePanel();
    });

    var panel = document.createElement("div");
    panel.style.cssText =
      "width:560px;max-width:94vw;max-height:90vh;overflow:auto;" +
      "background:#141a28;color:#eef2f9;border-radius:16px;" +
      "border:1px solid rgba(62,177,249,.45);" +
      "box-shadow:0 24px 70px rgba(0,0,0,.6);padding:20px;";

    // Header
    var head = document.createElement("div");
    head.style.cssText =
      "display:flex;align-items:center;gap:10px;margin-bottom:14px;";
    var iconUrl = ICON_DATA_URL;
    if (iconUrl) {
      var icon = document.createElement("img");
      icon.src = iconUrl;
      icon.alt = "";
      icon.style.cssText = "width:26px;height:26px;border-radius:6px;";
      head.appendChild(icon);
    }
    var title = document.createElement("div");
    title.textContent = "Pickax Post to Image";
    title.style.cssText = "font-size:16px;font-weight:700;flex:1;";
    head.appendChild(title);
    var x = document.createElement("button");
    x.type = "button";
    x.textContent = "✕";
    x.setAttribute("aria-label", "Close");
    x.style.cssText =
      "background:none;border:none;color:#8b94a9;font-size:16px;cursor:pointer;padding:4px 8px;";
    x.addEventListener("click", closePanel);
    head.appendChild(x);
    panel.appendChild(head);

    // Live preview: renders the real image and updates as toggles flip,
    // exactly like the website.
    var previewWrap = document.createElement("div");
    previewWrap.style.cssText =
      "background:#0e1420;border-radius:12px;margin-bottom:16px;" +
      "min-height:220px;display:flex;align-items:center;justify-content:center;" +
      "overflow:hidden;";
    var previewImg = document.createElement("img");
    previewImg.alt = "Post image preview";
    previewImg.style.cssText =
      "width:100%;height:auto;display:block;border-radius:12px;";
    var previewNote = document.createElement("div");
    previewNote.textContent = "Rendering preview…";
    previewNote.style.cssText = "font-size:13px;color:#8b94a9;padding:40px 0;";
    previewWrap.appendChild(previewNote);
    panel.appendChild(previewWrap);

    var previewSeq = 0;
    var previewTimer = 0;
    var previewShown = false;
    function runPreview() {
      previewTimer = 0;
      if (!api || !api.runtime || !api.runtime.sendMessage) return;
      var seq = ++previewSeq;
      previewImg.style.opacity = ".45";
      api.runtime
        .sendMessage({ type: PREVIEW_MSG, payload: payload, options: opts })
        .then(function (res) {
          if (seq !== previewSeq) return; // a newer render won
          if (res && res.viaTab) {
            // No offscreen API (e.g. Firefox): a hidden render tab replies
            // directly to this tab.
            waitForTabResult(res.reqId).then(function (result) {
              if (seq !== previewSeq) return; // a newer render won
              applyPreviewResult(result);
            });
            return;
          }
          applyPreviewResult(res);
        })
        .catch(function () {
          previewImg.style.opacity = "1";
        });
    }
    function applyPreviewResult(res) {
      if (res && res.ok && res.dataUrl) {
        if (!previewShown) {
          previewWrap.textContent = "";
          previewWrap.appendChild(previewImg);
          previewShown = true;
        }
        previewImg.src = res.dataUrl;
      }
      previewImg.style.opacity = "1";
    }
    function schedulePreview(immediate) {
      if (previewTimer) clearTimeout(previewTimer);
      if (immediate) runPreview();
      else previewTimer = setTimeout(runPreview, 220);
    }

    // Toggles
    var legend = document.createElement("div");
    legend.textContent = "Show in image";
    legend.style.cssText =
      "font-size:12px;font-weight:700;letter-spacing:.08em;" +
      "text-transform:uppercase;color:#8b94a9;margin-bottom:8px;";
    panel.appendChild(legend);
    toggles.forEach(function (tg) {
      if (!tg.show) return;
      var row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;" +
        "padding:9px 2px;border-top:1px solid #232c42;";
      row.setAttribute("data-ppi-toggle", tg.key);
      var lab = document.createElement("span");
      lab.textContent = tg.label;
      lab.style.cssText = "font-size:14px;";
      row.appendChild(lab);
      row.appendChild(
        makeSwitch(opts[tg.key], function (v) {
          opts[tg.key] = v;
          schedulePreview(false);
        })
      );
      panel.appendChild(row);
    });

    // Footer buttons
    var foot = document.createElement("div");
    foot.style.cssText = "display:flex;gap:10px;margin-top:18px;";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText =
      "flex:1;padding:11px;border-radius:10px;border:1px solid #2c3650;" +
      "background:transparent;color:#cfd6e6;font-size:14px;font-weight:600;cursor:pointer;";
    cancel.addEventListener("click", closePanel);
    foot.appendChild(cancel);
    var dl = document.createElement("button");
    dl.type = "button";
    dl.textContent = "Download PNG";
    dl.setAttribute("data-ppi-download", "1");
    dl.style.cssText =
      "flex:2;padding:11px;border-radius:10px;border:none;background:#3EB1F9;" +
      "color:#fff;font-size:14px;font-weight:700;cursor:pointer;";
    dl.addEventListener("click", function () {
      if (!api || !api.runtime || !api.runtime.sendMessage) {
        closePanel();
        toast("Extension context lost — reload the page.");
        return;
      }
      dl.disabled = true;
      dl.textContent = "Rendering…";
      dl.style.opacity = ".7";
      api.runtime
        .sendMessage({ type: RENDER_MSG, payload: payload, options: opts })
        .then(function (res) {
          if (res && res.viaTab) {
            // No offscreen API (e.g. Firefox): a hidden render tab
            // downloads the PNG and replies directly to this tab.
            waitForTabResult(res.reqId).then(function (result) {
              closePanel();
              toast(
                result && result.ok
                  ? "Image downloaded ✓"
                  : "Couldn't generate the image."
              );
            });
            return;
          }
          closePanel();
          toast(
            res && res.ok ? "Image downloaded ✓" : "Couldn't generate the image."
          );
        })
        .catch(function () {
          closePanel();
          toast("Couldn't generate the image.");
        });
    });
    foot.appendChild(dl);
    panel.appendChild(foot);


    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onPanelKey, true);

    schedulePreview(true); // first paint of the live preview
  }

  function openPanelForCard(cardRoot, postId) {
    var payload = null;
    try {
      payload = extractPost(cardRoot, postId);
    } catch (e) {
      payload = null;
    }
    if (!payload || !payload.postId) {
      toast("Couldn't read that post.");
      return;
    }
    showPanel(payload);
  }

  function startPicker() {
    if (picking) return;
    ensurePickerDom();
    if (pickPill && !pickPill.parentNode)
      document.body.appendChild(pickPill);
    picking = true;
    hoverCard = null;
    savedCursor = document.documentElement.style.cursor || "";
    document.documentElement.style.cursor = "crosshair";
    document.addEventListener("mouseover", onPickOver);
    document.addEventListener("click", onPickClick, true);
    document.addEventListener("keydown", onPickKey, true);
    document.addEventListener("scroll", onPickScroll, true);
  }

  function stopPicker() {
    if (!picking) return;
    picking = false;
    hoverCard = null;
    pickRaf = 0;
    document.removeEventListener("mouseover", onPickOver);
    document.removeEventListener("click", onPickClick, true);
    document.removeEventListener("keydown", onPickKey, true);
    document.removeEventListener("scroll", onPickScroll, true);
    document.documentElement.style.cursor = savedCursor;
    if (pickHL) pickHL.style.display = "none";
    if (pickPill && pickPill.parentNode)
      pickPill.parentNode.removeChild(pickPill);
  }

  // Exposed for the Node smoke test (harmless in production).
  globalThis.__pickaxPicker = {
    start: startPicker,
    stop: stopPicker,
    cardFromElement: cardFromElement,
  };

  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.type === PICK_MSG) {
        try {
          startPicker();
        } catch (e) {
          /* never break the page */
        }
        return Promise.resolve({ ok: true });
      }
      return undefined;
    });
  }
})();
