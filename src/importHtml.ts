// Fast post importing without typing: parse a pasted Pickax page source,
// or accept data handed over by the one-click bookmarklet via URL hash.
//
// Everything extracted here comes from the public post page the user loaded
// in their own browser. Nothing is fetched by the app, nothing is invented:
// fields the page doesn't provide stay empty and are omitted from the image.

export interface ParsedImport {
  postId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  text: string;
  timestamp: string;
  imageUrls: string[];
  videoSrc: string;
  videoTitle: string;
  /** Pickax "pick" (like) count. */
  picks: string;
  /** Pickax "axe" (dislike) count. */
  axes: string;
  views: string;
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

function extractVideo(doc: Document): { src: string; title: string } {
  const f = doc.querySelector('iframe[src*="rumble.com/embed"]');
  return {
    src: f?.getAttribute("src")?.trim() ?? "",
    title: f?.getAttribute("title")?.trim() ?? "",
  };
}

export class ImportParseError extends Error {}

export function parsePostHtml(html: string): ParsedImport {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const displayName = cleanTitle(metaContent(doc, "og:title"));
  const text = cleanDescription(metaContent(doc, "og:description"));
  const username = extractUsername(doc);
  const avatarUrl = extractAvatarUrl(doc);

  if (!displayName && !text && !username) {
    throw new ImportParseError(
      "That doesn't look like a Pickax post page. Open the post in your " +
        "browser, press Ctrl+U (or Cmd+Option+U on Mac) to view the page " +
        "source, copy everything, and paste it here."
    );
  }

  let postId = "";
  const ogUrl = metaContent(doc, "og:url");
  const idMatch = ogUrl.match(/\/post\/(\d+)/);
  if (idMatch) postId = idMatch[1];

  const video = extractVideo(doc);

  return {
    postId,
    displayName,
    username,
    avatarUrl,
    text,
    timestamp: extractTimestamp(doc),
    imageUrls: extractImageUrls(doc, avatarUrl),
    videoSrc: video.src,
    videoTitle: video.title,
    picks: extractPicks(doc),
    axes: extractAxes(doc),
    views: extractViews(doc),
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
  const imageUrls = Array.isArray(o.imageUrls)
    ? o.imageUrls.filter((u): u is string => typeof u === "string").slice(0, 4)
    : [];
  const parsed: ParsedImport = {
    postId: str(o.postId),
    displayName: str(o.displayName),
    username: str(o.username).replace(/^@+/, ""),
    avatarUrl: str(o.avatarUrl),
    text: cleanDescription(str(o.text)),
    timestamp: str(o.timestamp),
    imageUrls,
    videoSrc: str(o.videoSrc),
    videoTitle: str(o.videoTitle),
    // v1 bookmarklets sent `likes`; treat it as the pick count.
    picks: str(o.picks) || str(o.likes),
    axes: str(o.axes),
    views: str(o.views),
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
  "o={v:2,postId:'',displayName:(meta('og:title')||'').replace(/\\s+posted\\s*$/i,'')," +
  "text:(meta('og:description')||'').replace(/\\s*user=\\S+\\s+[\\d,]+\\s+Followers\\s*$/i,'')," +
  "username:'',avatar:'',timestamp:'',picks:'',axes:'',views:'',videoSrc:'',videoTitle:'',images:[]};" +
  "Array.prototype.forEach.call(d.querySelectorAll('a[href^=\"/\"]'),function(a){" +
  "var t=(a.textContent||'').trim();" +
  "if(t.charAt(0)==='@'&&t.length>1){" +
  "if(!o.username)o.username=t.slice(1).trim();" +
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
  "o.images=Array.prototype.filter.call(d.querySelectorAll('img[src*=\"img.pickax.com\"]')," +
  "function(i){return i!==av;}).map(function(i){return i.src;}).slice(0,4);" +
  "var pm=location.pathname.match(/\\/post\\/(\\d+)/);if(pm)o.postId=pm[1];" +
  "location.href='" + APP_URL + "#import='+encodeURIComponent(JSON.stringify(o));" +
  "})()";
