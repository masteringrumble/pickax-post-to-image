// Fast post importing without typing: parse a pasted Pickax page source,
// or accept data handed over by the one-click bookmarklet via URL hash.
//
// Everything extracted here comes from the public post page the user loaded
// in their own browser. Nothing is fetched by the app, nothing is invented:
// fields the page doesn't provide stay empty and are omitted from the image.

import {
  extractNuxtBlock,
  parseNuxtPostData,
  type NuxtPostData,
} from "./lib/nuxtPost";

export interface ParsedQuotedPost {
  postId: string;
  displayName: string;
  username: string;
  /** The quoted account's verified badge (gold/blue), or null when none. */
  verified: "gold" | "blue" | null;
  avatarUrl: string;
  text: string;
  /** Relative timestamp as the site shows it, e.g. "2 hours ago". */
  timestamp: string;
}

export interface ParsedImport {
  postId: string;
  displayName: string;
  username: string;
  /** The account's verified badge (gold/blue), or null when it has none. */
  verified: "gold" | "blue" | null;
  avatarUrl: string;
  text: string;
  timestamp: string;
  imageUrls: string[];
  videoSrc: string;
  videoTitle: string;
  /** Poster thumbnail for the video embed (what the player shows pre-play). */
  videoThumbnailUrl: string;
  /** Pickax "pick" (like) count. */
  picks: string;
  /** Pickax "axe" (dislike) count. */
  axes: string;
  views: string;
  /** The quoted post, or null when this is not a quote post. */
  quoted: ParsedQuotedPost | null;
}

const APP_URL = "https://masteringrumble.github.io/pickax-post-to-image/";

// Pickax appends an SEO suffix to og:description that is not part of the
// post itself, e.g. "user=misfit_electronic_gaming 1311 Followers".
// Strip it so the image shows only what the author wrote.
export function cleanDescription(text: string): string {
  return text.replace(/\s*user=\S+\s+[\d,]+\s+Followers\s*$/i, "").trim();
}

function cleanTitle(title: string): string {
  return title.replace(/\s+posted\s*$/i, "").trim();
}

/**
 * Full post body from the __NUXT_DATA__ payload. og:description is truncated
 * (~120 chars); the payload carries the complete text with <br> line breaks.
 * The body sits just after the post id in document order.
 */
function extractFullText(doc: Document, postId: string): string | null {
  const el = doc.getElementById("__NUXT_DATA__");
  const raw = el?.textContent;
  if (!raw) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  const strings: string[] = [];
  const walk = (o: unknown): void => {
    if (typeof o === "string" || typeof o === "number") strings.push(String(o));
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(payload);
  const at = strings.findIndex((s) => s === postId);
  const pool = at === -1 ? strings : strings.slice(at);
  let best: string | null = null;
  const consider = (s: string) => {
    if (s.includes("<br") && s.length > 80 && (!best || s.length > best.length))
      best = s;
  };
  pool.forEach(consider);
  if (!best && at !== -1) strings.forEach(consider);
  if (!best) return null;
  const body: string = best;
  // <br> -> newline first, then let the DOM decode entities/strip tags.
  const div = doc.createElement("div");
  div.innerHTML = body.replace(/<br\s*\/?>/gi, "\n").replace(/&nbsp;/gi, " ");
  const cleaned = (div.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || null;
}

function metaContent(doc: Document, property: string): string {
  const el = doc.querySelector(`meta[property="${property}"]`);
  return el?.getAttribute("content")?.trim() ?? "";
}

function firstNumber(s: string): string {
  const m = s.match(/(\d[\d,]*)/);
  return m ? m[1] : "";
}

// Extract the author's @username: the first link whose visible text starts
// with "@" (the author header renders before any mentions in the post body).
function extractUsername(doc: Document): string {
  const anchors = Array.from(doc.querySelectorAll('a[href^="/"]'));
  for (const a of anchors) {
    const t = (a.textContent ?? "").trim();
    if (t.startsWith("@") && t.length > 1) {
      return t.slice(1).trim();
    }
  }
  return "";
}

function extractAvatarUrl(doc: Document): string {
  const img = doc.querySelector('img.rounded-full[src*="img.pickax.com"]');
  return img?.getAttribute("src")?.trim() ?? "";
}

// Post images live on img.pickax.com too; the avatar is the rounded one.
function extractImageUrls(doc: Document, avatarUrl: string): string[] {
  const imgs = Array.from(
    doc.querySelectorAll('img[src*="img.pickax.com"]')
  );
  const urls: string[] = [];
  for (const img of imgs) {
    const src = img.getAttribute("src")?.trim() ?? "";
    if (!src || src === avatarUrl || src.includes("favicon")) continue;
    if (!urls.includes(src)) urls.push(src);
    if (urls.length >= 4) break;
  }
  return urls;
}

function extractViews(doc: Document): string {
  const el = doc.querySelector('span[title="Post views"]');
  return firstNumber(el?.getAttribute("aria-label") ?? "");
}

// Picks/axes are icon-only buttons carrying their brand gradients: the pick
// button uses #0083f5 -> #00c4f5, the axe button #dc1919 -> #f59b00. The
// count is a bare number next to the icon (hidden entirely at 0 for axes).
function buttonCount(doc: Document, gradientMarker: string): string {
  const buttons = Array.from(doc.querySelectorAll("button"));
  for (const b of buttons) {
    if (!b.innerHTML.includes(gradientMarker)) continue;
    const m = (b.textContent ?? "").trim().match(/(\d[\d,]*)/);
    return m ? m[1] : "0";
  }
  return "";
}

function extractPicks(doc: Document): string {
  return buttonCount(doc, "0083f5");
}

function extractAxes(doc: Document): string {
  return buttonCount(doc, "dc1919");
}

// Verified badge: the seal SVG (signature path "M12.7893 4.26666") renders in
// a div right after the author's DISPLAY-NAME link, inside the same header
// container as that link. The @username link lives in a separate sibling row,
// so the display-name link (same href as the @username link, but showing the
// display name) is the anchor — keyed off the author's own handle so nav
// links and verified commenters elsewhere on the page can't false-positive.
// Returns the account's real badge color — gold (fill-orange-300 / #FDBA74,
// "Verified Creator") or blue (fill-blue-*/fill-sky-* / #3EB1F9) — or null
// when the account has no badge. A seal with no recognizable color defaults
// to gold.
function extractVerified(doc: Document, username: string): "gold" | "blue" | null {
  const handle = username ? `/${username.toLowerCase()}` : "";
  const anchors = Array.from(doc.querySelectorAll('a[href^="/"]'));
  const displayNameAnchor = anchors.find((a) => {
    const t = (a.textContent ?? "").trim();
    if (!t || t.startsWith("@")) return false;
    if (handle && (a.getAttribute("href") ?? "").toLowerCase() !== handle)
      return false;
    return true;
  });
  const inner = displayNameAnchor?.parentElement?.innerHTML ?? "";
  if (!inner.includes("12.7893 4.26666")) return null;
  const s = inner.toLowerCase();
  return s.includes("3eb1f9") || /fill-(blue|sky)-\d{3}/.test(s)
    ? "blue"
    : "gold";
}

function extractTimestamp(doc: Document): string {
  // The relative timestamp sits in the <span title="Sep 19, 2026, 9:11 PM">
  // right after the author's @username link.
  const anchors = Array.from(doc.querySelectorAll('a[href^="/"]'));
  for (const a of anchors) {
    const t = (a.textContent ?? "").trim();
    if (t.startsWith("@") && t.length > 1) {
      const sib = a.nextElementSibling;
      if (sib && sib.tagName === "SPAN") return (sib.textContent ?? "").trim();
      break;
    }
  }
  const tm = doc.querySelector("time[datetime]");
  return tm?.getAttribute("datetime")?.trim() ?? "";
}

function extractVideo(doc: Document, html: string): { src: string; title: string; thumbnailUrl: string } {
  const f = doc.querySelector('iframe[src*="rumble.com/embed"]');
  return {
    src: f?.getAttribute("src")?.trim() ?? "",
    title: f?.getAttribute("title")?.trim() ?? "",
    thumbnailUrl: extractVideoThumbnailUrl(html),
  };
}

/**
 * The video poster's thumbnail — what the embedded player shows before play.
 * Rumble's oEmbed thumbnail (served from their CDN) is embedded in the page
 * state of a pasted page source.
 */
export function extractVideoThumbnailUrl(html: string): string {
  const rumbleM = html.match(
    /https:\/\/[a-z0-9.-]+\.cdn\.rumble\.cloud\/[^"\\\s'<>]+\.(?:jpg|jpeg|png|webp)/i
  );
  if (rumbleM) return rumbleM[0];
  const genericM = html.match(/"thumbnail_url"\s*:\s*"([^"]+)"/);
  if (genericM) return genericM[1].replace(/\\\//g, "/");
  return "";
}

export class ImportParseError extends Error {}

export function parsePostHtml(html: string): ParsedImport {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Primary source: the __NUXT_DATA__ devalue payload. The post object is
  // matched by id, so on quote posts the OUTER text/author/avatar can never
  // be mixed up with the quoted post's (the old longest-<br>-string
  // heuristic picked whichever text was longer). DOM scraping below is
  // only the fallback for fields the payload doesn't carry.
  let postId = "";
  const ogUrl = metaContent(doc, "og:url");
  const idMatch = ogUrl.match(/\/post\/(\d+)/);
  if (idMatch) postId = idMatch[1];

  const nuxtBlock = extractNuxtBlock(html);
  const nuxt: NuxtPostData | null = nuxtBlock
    ? parseNuxtPostData(nuxtBlock, postId)
    : null;

  const displayName =
    nuxt?.author.displayName || cleanTitle(metaContent(doc, "og:title"));
  const username = nuxt?.author.username || extractUsername(doc);
  // The payload avatar is the QUOTER's own profile picture — deterministic.
  // The old first-rounded-full-in-DOM heuristic could grab the quoted
  // author's avatar (or a post image) on quote posts.
  const avatarUrl = nuxt?.author.avatarUrl || extractAvatarUrl(doc);

  // Full body from the page payload when present; truncated og:description
  // is only the fallback.
  const text =
    nuxt?.text ||
    extractFullText(doc, postId) ||
    cleanDescription(metaContent(doc, "og:description"));

  if (!displayName && !text && !username) {
    throw new ImportParseError(
      "That doesn't look like a Pickax post page. Open the post in your " +
        "browser, press Ctrl+U (or Cmd+Option+U on Mac) to view the page " +
        "source, copy everything, and paste it here."
    );
  }

  const video = extractVideo(doc, html);

  const quoted: ParsedQuotedPost | null = nuxt?.quoted
    ? {
        postId: nuxt.quoted.postId,
        displayName: nuxt.quoted.displayName,
        username: nuxt.quoted.username,
        verified: nuxt.quoted.verified,
        avatarUrl: nuxt.quoted.avatarUrl,
        text: nuxt.quoted.text,
        timestamp: nuxt.quoted.timeAgo,
      }
    : null;

  return {
    postId,
    displayName,
    username,
    verified: nuxt?.author.verified ?? extractVerified(doc, username),
    avatarUrl,
    text,
    timestamp: extractTimestamp(doc),
    // On quote posts there are no post images: the quoted card shows only
    // the quoted author's avatar + text, and the DOM's other images belong
    // to the quoted post. This keeps all three import paths identical.
    imageUrls: nuxt?.quoted ? [] : extractImageUrls(doc, avatarUrl),
    videoSrc: video.src,
    videoTitle: video.title,
    videoThumbnailUrl: video.thumbnailUrl,
    picks: extractPicks(doc),
    axes: extractAxes(doc),
    views: extractViews(doc),
    quoted,
  };
}

// The bookmarklet may hand over an ISO datetime (from <time datetime>).
// Show it the way a person would read it; pass anything else through.
export function prettyTimestamp(ts: string): string {
  const t = ts.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  return t;
}

// --- bookmarklet handoff ----------------------------------------------------
// The bookmarklet runs on the Pickax post page itself (where the DOM is
// fully available) and opens the app with the extracted data in #import=.

function coerceImport(raw: unknown): ParsedImport | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown): string =>
    typeof v === "string" ? v : "";
  // Image/avatar field names: v5 bookmarklets and the browser extension send
  // `images` / `avatar`; older payloads used `imageUrls` / `avatarUrl`.
  const rawImages = Array.isArray(o.imageUrls)
    ? o.imageUrls
    : Array.isArray(o.images)
      ? o.images
      : [];
  const imageUrls = rawImages
    .filter((u): u is string => typeof u === "string")
    .slice(0, 4);
  // v5 bookmarklets send the quoted post as `q`; older ones send nothing.
  const q = o.q && typeof o.q === "object" ? (o.q as Record<string, unknown>) : null;
  const quoted: ParsedQuotedPost | null = q
    ? {
        postId: str(q.postId),
        displayName: str(q.displayName),
        username: str(q.username).replace(/^@+/, ""),
        verified:
          q.verified === "blue"
            ? "blue"
            : q.verified === "gold"
              ? "gold"
              : null,
        avatarUrl: str(q.avatarUrl),
        text: str(q.text),
        timestamp: str(q.timestamp),
      }
    : null;
  const parsed: ParsedImport = {
    postId: str(o.postId),
    displayName: str(o.displayName),
    username: str(o.username).replace(/^@+/, ""),
    // v2 bookmarklets send "gold"/"blue"/"" — v1 sent a boolean, where
    // true meant the (gold) badge was present.
    verified:
      o.verified === "blue"
        ? "blue"
        : o.verified === "gold" || o.verified === true
          ? "gold"
          : null,
    avatarUrl: str(o.avatarUrl) || str(o.avatar),
    text: cleanDescription(str(o.text)),
    timestamp: str(o.timestamp),
    imageUrls,
    videoSrc: str(o.videoSrc),
    videoTitle: str(o.videoTitle),
    videoThumbnailUrl: str(o.videoThumb),
    // v1 bookmarklets sent `likes`; treat it as the pick count.
    picks: str(o.picks) || str(o.likes),
    axes: str(o.axes),
    views: str(o.views),
    quoted,
  };
  if (!parsed.displayName && !parsed.text && !parsed.username) return null;
  return parsed;
}

export function parseImportHash(): ParsedImport | null {
  const hash = window.location.hash;
  const prefix = "#import=";
  if (!hash.startsWith(prefix)) return null;
  try {
    const raw = JSON.parse(
      decodeURIComponent(hash.slice(prefix.length))
    );
    return coerceImport(raw);
  } catch {
    return null;
  }
}

export function clearImportHash(): void {
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search
  );
}

// One-click import bookmarklet. Runs on the Pickax post page, extracts the
// post with the same selectors as parsePostHtml (but against the live DOM),
// and opens the app with the data in the URL hash. Drag to the bookmarks bar.
export const BOOKMARKLET: string =
  "javascript:(function(){" +
  "var d=document," +
  "q=function(s){return d.querySelector(s)}," +
  "meta=function(p){var e=q('meta[property=\"'+p+'\"]');return e?e.getAttribute('content')||'':''}," +
  "o={v:5,postId:'',displayName:(meta('og:title')||'').replace(/\\s+posted\\s*$/i,'')," +
  "text:(meta('og:description')||'').replace(/\\s*user=\\S+\\s+[\\d,]+\\s+Followers\\s*$/i,'')," +
  "username:'',verified:'',avatar:'',timestamp:'',picks:'',axes:'',views:'',videoSrc:'',videoTitle:'',videoThumb:'',images:[],q:null};" +
  "Array.prototype.forEach.call(d.querySelectorAll('a[href^=\"/\"]'),function(a){" +
  "var t=(a.textContent||'').trim();" +
  "if(t.charAt(0)==='@'&&t.length>1){" +
  "if(!o.username)o.username=t.slice(1).trim();" +
  // The seal sits beside the DISPLAY-NAME link (same href, non-@ text) in the
  // header container; the @username link is in a separate row.
  "if(!o.verified){var dn=null;" +
  "Array.prototype.forEach.call(d.querySelectorAll('a[href=\"'+a.getAttribute('href')+'\"]'),function(x){" +
  "var xt=(x.textContent||'').trim();if(xt&&xt.charAt(0)!=='@'&&!dn)dn=x;});" +
  "var pe=dn?dn.parentElement:null;" +
  "if(pe&&pe.innerHTML.indexOf('12.7893 4.26666')>-1){" +
  "var ph=pe.innerHTML.toLowerCase();" +
  "o.verified=(ph.indexOf('3eb1f9')>-1||/fill-(blue|sky)-\\\\d{3}/.test(ph))?'blue':'gold';}}" +
  "var s=a.nextElementSibling;" +
  "if(s&&s.tagName==='SPAN'&&s.getAttribute('title')&&!o.timestamp)o.timestamp=(s.textContent||'').trim();}});" +
  "var av=q('img.rounded-full[src*=\"img.pickax.com\"]');" +
  "if(av)o.avatar=av.src;" +
  "var vs=q('span[title=\"Post views\"]');" +
  "if(vs){var vm=(vs.getAttribute('aria-label')||'').match(/(\\d[\\d,]*)/);if(vm)o.views=vm[1];}" +
  "Array.prototype.forEach.call(d.querySelectorAll('button'),function(b){" +
  "var h=b.innerHTML||'',t=(b.textContent||'').trim(),m=t.match(/(\\d[\\d,]*)/);" +
  "if(h.indexOf('0083f5')>-1&&!o.picks)o.picks=m?m[1]:'0';" +
  "if(h.indexOf('dc1919')>-1&&!o.axes)o.axes=m?m[1]:'0';});" +
  "var fr=q('iframe[src*=\"rumble.com/embed\"]');" +
  "if(fr){o.videoSrc=fr.src||'';o.videoTitle=fr.getAttribute('title')||'';}" +
  "var thm=d.documentElement.innerHTML.match(/https:\\/\\/[a-z0-9.-]+\\.cdn\\.rumble\\.cloud\\/[^\"\\\\\\s'<>]+\\.(?:jpg|jpeg|png|webp)/i);" +
  "if(thm)o.videoThumb=thm[0];" +
  "o.images=Array.prototype.filter.call(d.querySelectorAll('img[src*=\"img.pickax.com\"]')," +
  "function(i){return i!==av;}).map(function(i){return i.src;}).slice(0,4);" +
  "var pm=location.pathname.match(/\\/post\\/(\\d+)/);if(pm)o.postId=pm[1];" +
  // Full post body from the page payload (og:description is truncated).
  // Compact devalue resolver: the payload is a flat array, and integers in
  // value positions are indexes into it. The post object is matched by id,
  // so on quote posts the OUTER fields can never be mixed up with the
  // quoted post's — and the quoted post (repostOf) comes along with the
  // quoted author's own avatar, badge, and timestamp.
  "function dvD(A,i,M,S){if(M[i]!==undefined)return M[i];if(S[i])return;S[i]=1;var v=A[i],o,k;" +
  "if(v&&typeof v==='object'){o=Array.isArray(v)?[]:{};M[i]=o;for(k in v)o[k]=dvV(A,v[k],M,S);}else o=v;" +
  "S[i]=0;M[i]=o;return o;};" +
  "function dvV(A,v,M,S){if(typeof v==='number'&&v>=0&&v<A.length&&Math.floor(v)===v)return dvD(A,v,M,S);" +
  "if(v&&typeof v==='object'){var o=Array.isArray(v)?[]:{},k;for(k in v)o[k]=dvV(A,v[k],M,S);return o;}return v;};" +
  "function dvC(s){return String(s||'').replace(/<br\\s*\\/?>/gi,'\\n').replace(/<[^>]*>/g,'')" +
  ".replace(/&nbsp;/gi,' ').replace(/&#(\\d+);/g,function(m,n){return String.fromCharCode(parseInt(n,10));})" +
  ".replace(/&quot;/g,'\"').replace(/&#39;|&apos;/g,\"'\").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')" +
  ".replace(/\\\\xad/gi,'').replace(/\\u00ad/g,'').replace(/\\\\n/g,'\\n').replace(/\\n{3,}/g,'\\n\\n').trim();};" +
  "function dvT(iso){var t=Date.parse(iso);if(isNaN(t))return '';var s=Math.max(0,Math.round((Date.now()-t)/1000));" +
  "if(s<60)return 'just now';var m=Math.floor(s/60);if(m<60)return m+(m===1?' minute ago':' minutes ago');" +
  "var h=Math.floor(m/60);if(h<24)return h+(h===1?' hour ago':' hours ago');" +
  "var dd=Math.floor(h/24);if(dd<7)return dd+(dd===1?' day ago':' days ago');" +
  "return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});};" +
  "var nd=d.getElementById('__NUXT_DATA__');" +
  "if(nd&&o.postId){try{var A=JSON.parse(nd.textContent||'');" +
  "if(A&&A.length){var RT=dvD(A,0,{},{}),seen=[],tgt=null;" +
  "(function wk(x){if(tgt||!x||typeof x!=='object')return;if(seen.indexOf(x)>-1)return;seen.push(x);" +
  "if(typeof x.content==='string'&&String(x.id)===String(o.postId)&&x.user){tgt=x;return;}" +
  "for(var k in x)wk(x[k]);})(RT);" +
  "if(tgt){var u=tgt.user||{},ct=dvC(tgt.content);" +
  "if(ct)o.text=ct;" +
  "if(u.fullname)o.displayName=u.fullname;" +
  "if(u.username)o.username=String(u.username).replace(/^@+/,'');" +
  "if(u.avatar)o.avatar='https://img.pickax.com/'+u.avatar;" +
  "o.verified=u.creator?'gold':(u.is_verified?'blue':o.verified);" +
  "var rp=tgt.repostOf;" +
  "if(rp&&typeof rp.content==='string'){var qu=rp.user||{};" +
  "o.q={postId:String(rp.id||''),displayName:qu.fullname||''," +
  "username:String(qu.username||'').replace(/^@+/,'')" +
  ",avatarUrl:qu.avatar?('https://img.pickax.com/'+qu.avatar):''," +
  "verified:qu.creator?'gold':(qu.is_verified?'blue':'')," +
  "text:dvC(rp.content),timestamp:dvT(rp.createdAt||'')};}}}" +
  "}catch(e){}}" +
  // On quote posts there are no post images: the quoted card shows only
  // the quoted author's avatar + text, and the DOM's other images belong
  // to the quoted post. Same rule as the worker and paste-source paths.
  "if(o.q)o.images=[];" +
  "location.href='" + APP_URL + "#import='+encodeURIComponent(JSON.stringify(o));" +
  "})()";
