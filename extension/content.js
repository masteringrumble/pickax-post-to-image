/* Pickax Post to Image — content script.
 *
 * Runs on https://pickax.com/* pages. Two jobs:
 *
 * 1. Per-post "Make image" buttons: while scrolling the feed (or viewing a
 *    post page), every post card gets a small "Image" button in its action
 *    row. Clicking it extracts that post and generates the PNG right there —
 *    no need to open the website. The PNG downloads automatically.
 * 2. Toolbar-button support: answers the "extract" message the toolbar
 *    button sends on post pages, so it can open the web app pre-filled.
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

  var EXTRACT_MSG = "pickax-post-to-image:extract";
  var RENDER_MSG = "pickax-post-to-image:render";
  var SEEN_ANCHOR = "data-ppi-seen";
  var SCANNED_ROOT = "data-ppi-scanned";
  var BTN_ATTR = "data-ppi-btn";

  // An engagement button (pick / axe / comment): a real page button holding
  // an icon SVG plus a numeric count. Color-agnostic — Pickax restyles these
  // icons (feed vs post page), so hex sniffing breaks across surfaces.
  function isEngagementButton(b) {
    if (!b || !b.innerHTML) return false;
    if (b.hasAttribute && b.hasAttribute(BTN_ATTR)) return false; // ours
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
      })
      .slice(0, 4);

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

  // -------------------------------------------------------------------------
  // Per-post "Make image" buttons
  // -------------------------------------------------------------------------

  function postIdFromAnchor(a) {
    var m = (a.getAttribute("href") || "").match(/\/post\/(\d+)/);
    return m ? m[1] : "";
  }

  // The post card is the smallest ancestor of the post link that holds the
  // engagement buttons (pick "0083f5" / axe "dc1919" path colors). Walking up
  // from the link, the first such ancestor is the card — never the feed.
  function findCardRoot(anchor) {
    var el = anchor.parentElement;
    for (var i = 0; i < 12 && el && el !== document.body; i++) {
      var btns = el.querySelectorAll("button");
      for (var b = 0; b < btns.length; b++) {
        if (isEngagementButton(btns[b])) return el;
      }
      el = el.parentElement;
    }
    return document.documentElement;
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);" +
      "background:#1B2334;color:#fff;font-size:14px;padding:10px 18px;" +
      "border-radius:9999px;border:1px solid #3A4358;z-index:2147483647;" +
      "font-family:system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5);";
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .4s";
      t.style.opacity = "0";
      setTimeout(function () {
        t.remove();
      }, 450);
    }, 2600);
  }

  function onMakeImage(postId, cardRoot, btn) {
    var old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "Rendering…";
    var payload = null;
    try {
      payload = extractPost(cardRoot, postId);
    } catch (e) {
      payload = null;
    }
    function done(msg) {
      btn.disabled = false;
      btn.innerHTML = old;
      if (msg) toast(msg);
    }
    if (!payload || !payload.postId) {
      done("Couldn't read that post.");
      return;
    }
    if (!api || !api.runtime || !api.runtime.sendMessage) {
      done("Extension context lost — reload the page.");
      return;
    }
    api.runtime
      .sendMessage({ type: RENDER_MSG, payload: payload })
      .then(function (res) {
        done(res && res.ok ? "Image downloaded ✓" : "Couldn't generate the image.");
      })
      .catch(function () {
        done("Couldn't generate the image.");
      });
  }

  function injectButton(cardRoot, postId) {
    if (cardRoot.querySelector("[" + BTN_ATTR + "]")) return;
    var btn = document.createElement("button");
    btn.setAttribute(BTN_ATTR, postId);
    btn.type = "button";
    btn.title = "Turn this post into a PNG image";
    // The site's light-blue icon, same as the website's branding.
    var iconUrl =
      api && api.runtime && api.runtime.getURL
        ? api.runtime.getURL("icons/icon-32.png")
        : "";
    btn.innerHTML = iconUrl
      ? '<img src="' +
        iconUrl +
        '" alt="" style="width:14px;height:14px;vertical-align:-2px;' +
        'margin-right:4px;border-radius:3px;pointer-events:none;">Image'
      : "Image";
    btn.style.cssText =
      "margin-left:8px;padding:3px 10px;border-radius:9999px;flex:none;" +
      "border:1px solid #3A4358;background:#333D52;color:#fff;" +
      "font-size:12px;line-height:1.6;cursor:pointer;font-family:inherit;" +
      // The card's full-bleed /post/ overlay link sits at z-index 0 — stay
      // positioned above it so the button actually receives clicks.
      "position:relative;z-index:1;";
    btn.addEventListener("mouseenter", function () {
      btn.style.background = "#3EB1F9";
      btn.style.borderColor = "#3EB1F9";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.background = "#333D52";
      btn.style.borderColor = "#3A4358";
    });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      onMakeImage(postId, cardRoot, btn);
    });

    // Park it at the end of the action row: locate the row via the last
    // counted engagement button, then insert after the row's final button
    // (covers trailing icon-only buttons like the feed's axe/share).
    var target = null;
    var btns = cardRoot.querySelectorAll("button");
    var i, b;
    for (i = btns.length - 1; i >= 0; i--) {
      b = btns[i];
      if (b.hasAttribute(BTN_ATTR)) continue;
      if (isEngagementButton(b)) {
        target = b.parentElement;
        break;
      }
    }
    if (target) {
      var rowBtns = target.querySelectorAll("button");
      var last = null;
      for (i = rowBtns.length - 1; i >= 0; i--) {
        if (!rowBtns[i].hasAttribute(BTN_ATTR)) {
          last = rowBtns[i];
          break;
        }
      }
      target.insertBefore(btn, last ? last.nextSibling : null);
    } else {
      cardRoot.appendChild(btn);
    }
  }

  // Group post links by card; the first link (document order) that maps to a
  // new card defines that card's post id — the outer post's timestamp link
  // always precedes any quoted-post links inside the card.
  function scan() {
    var anchors = document.querySelectorAll(
      'a[href*="/post/"]:not([' + SEEN_ANCHOR + "])"
    );
    Array.prototype.forEach.call(anchors, function (a) {
      a.setAttribute(SEEN_ANCHOR, "1");
      var postId = postIdFromAnchor(a);
      if (!postId) return;
      var root = findCardRoot(a);
      // Couldn't scope to a card — don't spray buttons on the page.
      if (!root || root === document.documentElement) return;
      if (root.hasAttribute && root.hasAttribute(SCANNED_ROOT)) return;
      if (root.setAttribute) root.setAttribute(SCANNED_ROOT, "1");
      try {
        injectButton(root, postId);
      } catch (e) {
        /* never break the page */
      }
    });
  }

  var scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () {
      scanTimer = null;
      try {
        scan();
      } catch (e) {
        /* never break the page */
      }
    }, 400);
  }

  if (document.body) {
    try {
      scan();
    } catch (e) {
      /* never break the page */
    }
    // MutationObserver covers infinite scroll + SPA navigation. Guarded for
    // non-browser runtimes (e.g. the jsdom smoke test).
    if (typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) {
            scheduleScan();
            break;
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      try {
        scan();
      } catch (e) {
        /* never break the page */
      }
    });
  }

  // -------------------------------------------------------------------------
  // Toolbar-button support (existing behavior)
  // -------------------------------------------------------------------------

  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.type === EXTRACT_MSG) {
        try {
          return Promise.resolve(extractPost());
        } catch (e) {
          return Promise.resolve(null);
        }
      }
      return undefined;
    });
  }
})();
