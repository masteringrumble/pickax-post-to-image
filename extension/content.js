/* Pickax Post to Image — content script.
 *
 * Runs on https://pickax.com/post/* pages. Extracts the visible post into the
 * same payload shape the web app's #import= hash accepts, so the toolbar
 * button can open the app with everything pre-filled (author, avatar, full
 * text, timestamp, picks, axes, views, images, and quoted posts).
 *
 * Privacy: nothing leaves the browser except when you click the toolbar
 * button, which opens the tool with the extracted post in the URL hash.
 * No accounts, no analytics, no background transmission.
 */
(function () {
  "use strict";

  var api = globalThis.browser || globalThis.chrome || null;
  // Guard against double-injection (e.g. the background script's fallback
  // re-injects this file into a tab that already has it).
  if (globalThis.__pickaxPostToImageInjected) return;
  globalThis.__pickaxPostToImageInjected = true;

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

  function extractPost() {
    var d = document;
    function q(s) {
      return d.querySelector(s);
    }
    function meta(p) {
      var e = q('meta[property="' + p + '"]');
      return e ? e.getAttribute("content") || "" : "";
    }

    var o = {
      v: 5,
      postId: "",
      displayName: (meta("og:title") || "").replace(/\s+posted\s*$/i, ""),
      text: (meta("og:description") || "").replace(
        /\s*user=\S+\s+[\d,]+\s+Followers\s*$/i,
        ""
      ),
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
      q: null,
    };

    // Author row: the @username link; the verification seal sits beside the
    // display-name link (same href, non-@ text) in the header container.
    Array.prototype.forEach.call(d.querySelectorAll('a[href^="/"]'), function (a) {
      var t = (a.textContent || "").trim();
      if (t.charAt(0) === "@" && t.length > 1) {
        if (!o.username) o.username = t.slice(1).trim();
        if (!o.verified) {
          var dn = null;
          Array.prototype.forEach.call(
            d.querySelectorAll('a[href="' + a.getAttribute("href") + '"]'),
            function (x) {
              var xt = (x.textContent || "").trim();
              if (xt && xt.charAt(0) !== "@" && !dn) dn = x;
            }
          );
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

    var av = q('img.rounded-full[src*="img.pickax.com"]');
    if (av) o.avatarUrl = av.src;

    var vs = q('span[title="Post views"]');
    if (vs) {
      var vm = (vs.getAttribute("aria-label") || "").match(/(\d[\d,]*)/);
      if (vm) o.views = vm[1];
    }

    Array.prototype.forEach.call(d.querySelectorAll("button"), function (b) {
      var h = b.innerHTML || "",
        t = (b.textContent || "").trim(),
        m = t.match(/(\d[\d,]*)/);
      if (h.indexOf("0083f5") > -1 && !o.picks) o.picks = m ? m[1] : "0";
      if (h.indexOf("dc1919") > -1 && !o.axes) o.axes = m ? m[1] : "0";
    });

    var fr = q('iframe[src*="rumble.com/embed"]');
    if (fr) {
      o.videoSrc = fr.src || "";
      o.videoTitle = fr.getAttribute("title") || "";
    }
    var thm = d.documentElement.innerHTML.match(
      /https:\/\/[a-z0-9.-]+\.cdn\.rumble\.cloud\/[^"\\\s'<>]+\.(?:jpg|jpeg|png|webp)/i
    );
    if (thm) o.videoThumb = thm[0];

    o.imageUrls = Array.prototype.filter.call(
      d.querySelectorAll('img[src*="img.pickax.com"]'),
      function (img) {
        return img !== av;
      }
    )
      .map(function (img) {
        return img.src;
      })
      .slice(0, 4);

    var pm = location.pathname.match(/\/post\/(\d+)/);
    if (pm) o.postId = pm[1];

    // Full post body from the page payload (og:description is truncated).
    var nd = d.getElementById("__NUXT_DATA__");
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
            if (ct) o.text = ct;
            if (u.fullname) o.displayName = u.fullname;
            if (u.username)
              o.username = String(u.username).replace(/^@+/, "");
            if (u.avatar) o.avatarUrl = "https://img.pickax.com/" + u.avatar;
            o.verified = u.creator
              ? "gold"
              : u.is_verified
                ? "blue"
                : o.verified;
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

    // On quote posts there are no post images: the quoted card shows only
    // the quoted author's avatar + text, and the DOM's other images belong
    // to the quoted post. Same rule as the worker and paste-source paths.
    if (o.q) o.imageUrls = [];

    return o;
  }

  // Exposed for the Node smoke test (harmless in production).
  globalThis.__pickaxExtractPost = extractPost;

  if (api && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.type === "pickax-post-to-image:extract") {
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
