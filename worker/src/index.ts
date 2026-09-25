// Cloudflare Worker: fetch a public Pickax post page server-side and return clean JSON.
//
// The static site (GitHub Pages) cannot read pickax.com directly — Pickax sends
// no CORS headers, and no login can change that. This tiny backend does the
// fetch where CORS doesn't apply (server-to-server). Only PUBLIC posts are
// supported; no credentials are used or stored.

import {
  extractNuxtBlock,
  parseNuxtPostData,
  timeAgoFromIso,
  type NuxtPostData,
  type NuxtQuotedPost,
} from "../../src/lib/nuxtPost";

const POST_URL_RE = /^https?:\/\/(?:www\.)?pickax\.com\/post\/(\d+)(?:[/?#].*)?$/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)));
}

function metaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return null;
}

/** Strip Pickax's SEO suffix: "user=<name> <N> Followers" */
function cleanDescription(desc: string): string {
  return desc.replace(/\s*user=[\w.-]+\s+[\d,]+\s+Followers\s*$/i, "").trim();
}

/**
 * Full post body from the __NUXT_DATA__ payload. og:description is truncated
 * (~120 chars); the payload carries the complete text with <br> line breaks.
 * The body sits just after the post id in document order.
 */
function extractFullText(html: string, postId: string): string | null {
  const block = html.match(
    /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!block) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(block[1]);
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
  const cleaned = decodeEntities(
    body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/&nbsp;/gi, " ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || null;
}

export interface WorkerQuotedPost {
  postId: string;
  displayName: string | null;
  username: string | null;
  /** Absolute https://img.pickax.com/... URL of the QUOTED author's avatar. */
  avatarUrl: string | null;
  /** The quoted account's verified badge (gold/blue), or null when none. */
  verified: "gold" | "blue" | null;
  text: string | null;
  /** Relative timestamp as the site shows it, e.g. "2 hours ago". */
  timestamp: string | null;
  /** The post this quoted post itself quotes (quote-of-a-quote chains). */
  quoted: WorkerQuotedPost | null;
}

export interface WorkerLinkCard {
  /** The full shared URL. */
  url: string;
  /** The link's title, as Pickax shows it under the preview image. */
  title: string;
  /** Bare domain, e.g. "trendingpoliticsnews.com". */
  domain: string;
  /** The link's preview image (img.pickax.com/metadata/...). */
  imageUrl: string;
  /** The link's description, when the payload carries one. */
  description: string;
}

export interface PostPayload {
  postId: string;
  postUrl: string;
  displayName: string | null;
  username: string | null; // without @
  avatarUrl: string | null;
  text: string | null;
  timestamp: string | null; // absolute, e.g. "Sep 19, 2026, 9:11 PM"
  timeAgo: string | null; // relative, e.g. "1 hour ago"
  views: string | null;
  picks: string | null;
  axes: string | null;
  comments: string | null;
  /**
   * The account's verified badge, exactly as the post shows it: "gold"
   * ("Verified Creator", #FDBA74) or "blue" (#3EB1F9), null when the
   * account has none. Never a toggle — it mirrors the account's state.
   */
  verified: "gold" | "blue" | null;
  images: string[];
  video: { src: string; title: string; thumbnail: string | null } | null;
  /**
   * Article headline, from the NUXT payload (isArticle posts only; null
   * otherwise). Carries the structured title for future headline rendering.
   * For articles the worker also prepends the title to `text` so it is
   * visible in the image with zero site changes.
   */
  title: string | null;
  /**
   * The shared-website link card, or null when the post shares no link.
   * Rendered below the post images, exactly like pickax.com.
   */
  linkCard: WorkerLinkCard | null;
  /** The quoted post, or null when this is not a quote post. */
  quoted: WorkerQuotedPost | null;
  fetchedAt: string;
}

/**
 * Picks / axes live in icon-only buttons. The picks button carries the blue
 * gradient (#0083f5 -> #00c4f5), the axes button the red-orange gradient
 * (#dc1919 -> #f59b00); the count sits in a bare <div> next to the icon.
 * A zero axes count is hidden on the page, so a missing count means "0".
 */
function extractEngagement(html: string): { picks: string | null; axes: string | null } {
  let picks: string | null = null;
  let axes: string | null = null;
  const btnRe = /<button[\s\S]*?<\/button>/gi;
  let b: RegExpExecArray | null;
  while ((b = btnRe.exec(html)) !== null) {
    const inner = b[0];
    const countM = inner.match(/<div>([\d.,]+[KMB]?)<\/div>/i);
    if (/#0083f5/i.test(inner)) {
      picks = countM ? countM[1] : "0";
    } else if (/#dc1919/i.test(inner)) {
      axes = countM ? countM[1] : "0";
    }
  }
  return { picks, axes };
}

/**
 * The shared-website link card, DOM fallback (the payload's post.link is
 * preferred). Pickax renders it as a div[title="<link title>"] wrapping an
 * <a href="<full URL>"> around the preview image
 * (img.pickax.com/metadata/...), followed by a small domain link and the
 * title link.
 */
function extractLinkCardDOM(html: string): WorkerLinkCard | null {
  const m = html.match(
    /<div[^>]*title="([^"]{1,200})"[^>]*>[\s\S]{0,600}?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>[\s\S]{0,400}?<img[^>]*src="(https:\/\/img\.pickax\.com\/metadata\/[^"']+)"[^>]*>/i
  );
  if (!m || !m.index) return null;
  const url = decodeEntities(m[2]);
  const imageUrl = decodeEntities(m[3]);
  const tail = html.slice(m.index + m[0].length, m.index + m[0].length + 2000);
  const domM = tail.match(/text-\[12px\][^>]*>([^<>]{1,80})</i);
  const titleM = tail.match(/text-\[15px\][^>]*>([^<>]{1,200})</i);
  const title = decodeEntities(titleM ? titleM[1].trim() : m[1].trim());
  let domain = domM ? decodeEntities(domM[1].trim()) : "";
  if (!domain) {
    try {
      domain = new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      domain = "";
    }
  }
  return { url, title, domain, imageUrl, description: "" };
}
/** Unescape the \u003C / \" / \/ sequences Pickax uses inside __NUXT_DATA__. */
function unescapePayload(s: string): string {
  return s
    .replace(/\\u003[cC]/g, "<")
    .replace(/\\u003[eE]/g, ">")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/");
}

function strVal(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * Resolve the post's own node from the __NUXT_DATA__ devalue payload.
 * parseNuxtPostData() maps the fields the site needs; this returns the raw
 * resolved node for the extras it drops: the oEmbed dict (post.link when it
 * is an embed: html / thumbnail_url / inputUrl / type), the native videos[]
 * array, isArticle + title, countViews, and repostOf titles. Integers at
 * value positions are slot references (same rule as src/lib/nuxtPost.ts).
 */
function resolvePostNode(
  raw: string,
  postId: string
): Record<string, unknown> | null {
  let slots: unknown[];
  try {
    slots = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(slots) || slots.length === 0) return null;
  const memo = new Map<number, unknown>();
  const inProgress = new Set<number>();
  const valueOf = (v: unknown): unknown => {
    if (
      typeof v === "number" &&
      Number.isInteger(v) &&
      v >= 0 &&
      v < slots.length
    )
      return deref(v);
    if (Array.isArray(v)) return v.map(valueOf);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v))
        o[k] = valueOf((v as Record<string, unknown>)[k]);
      return o;
    }
    return v;
  };
  const deref = (idx: number): unknown => {
    if (memo.has(idx)) return memo.get(idx);
    if (inProgress.has(idx)) return undefined;
    inProgress.add(idx);
    const s = slots[idx];
    let out: unknown;
    if (Array.isArray(s)) {
      const a: unknown[] = [];
      memo.set(idx, a);
      for (const item of s) a.push(valueOf(item));
      out = a;
    } else if (s && typeof s === "object") {
      const o: Record<string, unknown> = {};
      memo.set(idx, o);
      for (const k of Object.keys(s))
        o[k] = valueOf((s as Record<string, unknown>)[k]);
      out = o;
    } else {
      out = s;
    }
    inProgress.delete(idx);
    memo.set(idx, out);
    return out;
  };
  let root: unknown;
  try {
    root = deref(0);
  } catch {
    return null;
  }
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur as object)) continue;
    seen.add(cur as object);
    const c = cur as Record<string, unknown>;
    if (String(c.id) === String(postId) && typeof c.content === "string")
      return c;
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
    } else {
      for (const k of Object.keys(c)) stack.push(c[k]);
    }
  }
  return null;
}

/** The post's oEmbed dict (post.link when it is an embed), resolved. */
interface OembedInfo {
  /** The oEmbed iframe markup (post's own embed only). */
  html: string;
  /** Watch/share URL the oEmbed was made for. */
  inputUrl: string;
  /** Embed title from the oEmbed dict. */
  title: string;
  /** Resolved thumbnail_url (slot refs resolved) — all providers. */
  thumbnailUrl: string | null;
}

function oembedFromNode(
  node: Record<string, unknown> | null
): OembedInfo | null {
  if (!node) return null;
  const l = node.link;
  if (!l || typeof l !== "object" || Array.isArray(l)) return null;
  const link = l as Record<string, unknown>;
  // Genuine shared-website cards have no `html`; embeds (video/rich) do.
  if (typeof link.html !== "string" || !link.html) return null;
  const thumb = link.thumbnail_url;
  return {
    html: link.html,
    inputUrl: strVal(link.inputUrl || link.url),
    title: strVal(link.title),
    thumbnailUrl: typeof thumb === "string" && thumb ? thumb : null,
  };
}

type VideoKind = "rumble" | "youtube" | "spotify" | "apple";

interface VideoCandidate {
  src: string;
  title: string;
  kind: VideoKind;
  /** Provider's video id, for matching against the oEmbed inputUrl. */
  key: string | null;
  /** True when the iframe comes from the post's own oEmbed dict. */
  own: boolean;
}

/** Classify a recognized embed iframe; null for anything else. */
function classifyIframe(src: string): { kind: VideoKind; key: string | null } | null {
  let m: RegExpMatchArray | null;
  if (/rumble\.com\/embed\//i.test(src)) {
    m = src.match(/rumble\.com\/embed\/([A-Za-z0-9]+)/i);
    return { kind: "rumble", key: m ? m[1] : null };
  }
  m = src.match(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})/i);
  if (m) return { kind: "youtube", key: m[1] };
  m = src.match(
    /open\.spotify\.com\/embed\/(?:track|album|artist|episode|playlist)\/([A-Za-z0-9]+)/i
  );
  if (m) return { kind: "spotify", key: m[1] };
  m = src.match(/embed\.podcasts\.apple\.com\/[^"'\s]*?\/id(\d+)/i);
  if (m) return { kind: "apple", key: m[1] };
  return null;
}

function iframeTitle(tag: string): string | null {
  const m = tag.match(/title=["']([^"']*)["']/i);
  return m ? decodeEntities(m[1]) : null;
}

/** Page-embedded artwork for Apple Podcasts / Spotify embeds. */
function providerThumbFromPage(html: string, hostRe: RegExp): string | null {
  const m = html.match(hostRe);
  return m ? m[0] : null;
}

/**
 * The video poster's thumbnail — what the embedded player shows before play,
 * i.e. what you see when viewing the actual post. Rumble's thumbnail is
 * embedded in the page state; pre-~Sep-2026 posts serve it from 1a-1791.com
 * instead of *.cdn.rumble.cloud (both send CORS *, so browsers load them
 * directly). The oEmbed thumbnail_url (slot refs resolved) is preferred by
 * the caller; this is the page-regex fallback.
 */
function extractVideoThumbnail(html: string): string | null {
  const rumbleM = html.match(
    /https:\/\/(?:[a-z0-9.-]+\.cdn\.rumble\.cloud|1a-1791\.com)\/[^"\\\s'<>]+\.(?:jpg|jpeg|png|webp)/i
  );
  if (rumbleM) return rumbleM[0];
  const genericM = html.match(/"thumbnail_url"\s*:\s*"([^"]+)"/);
  if (genericM) return genericM[1].replace(/\\\//g, "/");
  return null;
}

export interface WorkerVideo {
  src: string;
  title: string;
  thumbnail: string | null;
}

function extractVideo(
  html: string,
  oembed: OembedInfo | null
): WorkerVideo | null {
  const cands: VideoCandidate[] = [];
  const seenSrc = new Set<string>();
  const push = (tag: string, src: string, own: boolean, fallbackTitle: string) => {
    const cl = classifyIframe(src);
    if (!cl) return;
    const ex = cands.find((c) => c.src === src);
    if (ex) {
      if (own) ex.own = true;
      return;
    }
    seenSrc.add(src);
    cands.push({
      src,
      title: iframeTitle(tag) || fallbackTitle,
      kind: cl.kind,
      key: cl.key,
      own,
    });
  };
  // 1. The post's OWN oEmbed iframe — authoritative. The payload also
  // carries quoted posts' oEmbeds, which must never be mistaken for the
  // outer post's video.
  if (oembed) {
    const tags = unescapePayload(oembed.html).match(/<iframe([^>]*)>/gi) ?? [];
    for (const tag of tags) {
      const sm = tag.match(/src=["']([^"']+)["']/i);
      if (sm) push(tag, decodeEntities(sm[1]), true, oembed.title);
    }
  }
  // 2. Page scan — article-inline videos and legacy markup. Pickax ships
  // the oEmbed <iframe> as an escaped string inside __NUXT_DATA__
  // (\u003Ciframe src=\"https://rumble.com/embed/…\"), so unescape payload
  // sequences before looking for the tag. Older markup had a literal
  // <iframe> in the HTML, which this also still matches.
  const tags = unescapePayload(html).match(/<iframe([^>]*)>/gi) ?? [];
  for (const tag of tags) {
    const sm = tag.match(/src=["']([^"']+)["']/i);
    if (sm && !seenSrc.has(decodeEntities(sm[1])))
      push(tag, decodeEntities(sm[1]), false, "");
  }
  if (cands.length === 0) return null;

  const matchesInput = (c: VideoCandidate): boolean =>
    !!oembed &&
    c.key !== null &&
    c.key.length >= 5 &&
    oembed.inputUrl.includes(c.key);

  // Score: the iframe matching the post's oEmbed inputUrl wins outright;
  // otherwise prefer a candidate with a resolvable thumbnail (this is what
  // picks the YouTube video over a thumbnail-less Rumble iframe on
  // multi-iframe article posts). Document order breaks remaining ties.
  const scored = cands.map((c, i) => {
    // The post's own oEmbed thumbnail — but only for the candidate it
    // belongs to (the oEmbed's own iframe, the only candidate, or the one
    // matching the oEmbed inputUrl).
    const ownThumb =
      oembed?.thumbnailUrl && (c.own || cands.length === 1 || matchesInput(c))
        ? oembed.thumbnailUrl
        : null;
    let thumb: string | null;
    if (c.kind === "youtube") {
      // hqdefault exists for every YouTube video; maxresdefault does not.
      thumb = ownThumb ?? (c.key ? `https://i.ytimg.com/vi/${c.key}/hqdefault.jpg` : null);
    } else if (c.kind === "rumble") {
      thumb = ownThumb ?? extractVideoThumbnail(html);
    } else if (c.kind === "apple") {
      // Apple's oEmbed thumbnail_url is routinely stale (404s); the
      // page-embedded artwork — what Pickax itself renders — is reliable.
      thumb =
        providerThumbFromPage(html, /https:\/\/is\d-ssl\.mzstatic\.com\/[^"\\\s'<>]+/i) ??
        ownThumb;
    } else {
      // spotify
      thumb =
        ownThumb ??
        providerThumbFromPage(html, /https:\/\/[a-z0-9.-]*spotifycdn\.com\/[^"\\\s'<>]+/i);
    }
    const score =
      (matchesInput(c) ? 10 : 0) + (c.own ? 5 : 0) + (thumb ? 2 : 0);
    return { c, thumb, score, order: i };
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const best = scored[0];
  return { src: best.c.src, title: best.c.title, thumbnail: best.thumb };
}

/**
 * Native video uploads: the __NUXT_DATA__ post node's videos[] array
 * carries a server-side poster (img.pickax.com/<preview>) plus dimensions
 * and duration. The .mp4 itself is fetched client-side on play and never
 * appears in the SSR payload, so the poster is all the tool can show —
 * exactly what the post displays before play. Renderers draw it cover-fit
 * into the 16:9 player (downscaling huge posters at draw time).
 * Multi-video posts: the page SSR shows only the first, so we take videos[0].
 */
function nativeVideoFromNode(
  node: Record<string, unknown> | null
): WorkerVideo | null {
  if (!node) return null;
  const vids = node.videos;
  if (!Array.isArray(vids) || vids.length === 0) return null;
  const v = vids[0];
  if (!v || typeof v !== "object") return null;
  const preview = (v as Record<string, unknown>).preview;
  if (typeof preview !== "string" || !preview) return null;
  const poster = /^https?:\/\//i.test(preview)
    ? preview
    : "https://img.pickax.com/" + preview.replace(/^\//, "");
  return { src: poster, title: "", thumbnail: poster };
}

/** Absolute timestamp the way the page shows it ("Sep 19, 2026, 9:11 PM"). Pickax SSR renders times in UTC. */
function formatAbsUtc(iso: string): string | null {
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  const d = new Date(t);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let h = d.getUTCHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h}:${min} ${ap}`;
}

export function extract(html: string, postId: string, postUrl: string): PostPayload | null {
  // Primary source: the __NUXT_DATA__ devalue payload. It carries the exact
  // post object by id (so on quote posts the OUTER text can never be mixed
  // up with the quoted text), the author's avatar path, the verified badge
  // state, and the quoted post (repostOf) when this is a quote post.
  // DOM scraping below is only the fallback.
  const nuxtBlock = extractNuxtBlock(html);
  const nuxt: NuxtPostData | null = nuxtBlock
    ? parseNuxtPostData(nuxtBlock, postId)
    : null;
  // Raw resolved post node: the extras parseNuxtPostData drops — the oEmbed
  // dict (post.link when it is an embed), the native videos[] array,
  // isArticle/title, countViews, and repostOf titles.
  const node = nuxtBlock ? resolvePostNode(nuxtBlock, postId) : null;
  const oembed = oembedFromNode(node);

  // Display name + @username: adjacent profile links after the avatar.
  // <a href="/Handle" class="cursor-pointer inline-block overflow-clip">Name</a>
  // <a href="/Handle" class="cursor-pointer text-sm ...">@Handle</a><span title="Sep 19, 2026, 9:11 PM">…</span>
  // Usernames may contain hyphens (e.g. @FloatingOnSmiles-Fos).
  const nameMatch = html.match(
    /<a href="\/([\w.-]+)"[^>]*class="[^"]*cursor-pointer inline-block overflow-clip"[^>]*>([^<>]{1,80})<\/a>/
  );
  const displayName =
    nuxt?.author.displayName ||
    (nameMatch ? decodeEntities(nameMatch[2]).trim() : null) ||
    null;
  const handleMatch = html.match(
    /<a href="\/[\w.-]+"[^>]*class="[^"]*text-sm[^"]*"[^>]*>@([\w.-]+)<\/a>/
  );
  const username =
    nuxt?.author.username ||
    (handleMatch ? handleMatch[1] : nameMatch ? nameMatch[1] : null) ||
    null;

  // Verified badge: the payload knows the account's real state
  // (creator record -> gold "Verified Creator", is_verified -> blue).
  // The seal-SVG DOM scrape stays as the fallback.
  let verified: "gold" | "blue" | null = nuxt?.author.verified ?? null;
  if (verified === null && nameMatch && typeof nameMatch.index === "number") {
    const slice = html.slice(nameMatch.index, nameMatch.index + 2000);
    if (slice.includes("12.7893 4.26666")) {
      const s = slice.toLowerCase();
      verified =
        s.includes("3eb1f9") || /fill-(blue|sky)-\d{3}/.test(s) ? "blue" : "gold";
    }
  }
  const timeMatch = html.match(
    /@[\w.-]+<\/a><span title="([^"]+)"[^>]*>([^<>]{1,40})<\/span>/
  );

  // Avatar: the payload's user.avatar is the QUOTER's own profile picture —
  // deterministic. The old first-rounded-full-in-DOM heuristic could grab
  // the quoted author's avatar (or a post image) on quote posts.
  let avatarUrl: string | null = nuxt?.author.avatarUrl || null;
  if (!avatarUrl) {
    const imgTags = html.match(/<img[^>]*>/gi) ?? [];
    for (const tag of imgTags) {
      if (!/rounded-full/i.test(tag)) continue;
      const src = tag.match(/src=["'](https:\/\/img\.pickax\.com\/[^"']+)["']/i);
      if (src) {
        avatarUrl = src[1];
        break;
      }
    }
  }

  // Attached post images: the payload's attachments list is the
  // authoritative source — it never includes the link card's preview image
  // (img.pickax.com/metadata/...), which the DOM scrape used to mistake
  // for a post image. DOM scraping below is only the fallback.
  // On quote posts there are no post images at all: the quoted card shows
  // only the quoted author's avatar + text, and every other image on the
  // page (the quoted author's avatar, the quoted post's attached images)
  // belongs to the quoted post, not the outer post.
  const images: string[] = [];
  if (!nuxt?.quoted) {
    if (nuxt) {
      images.push(...nuxt.images);
    } else {
      const imgRe =
        /<img[^>]*src=["'](https:\/\/img\.pickax\.com\/[^"']+)["'][^>]*>/gi;
      let im: RegExpExecArray | null;
      while ((im = imgRe.exec(html)) !== null) {
        if (
          im[1] !== avatarUrl &&
          !im[1].includes("/metadata/") &&
          !images.includes(im[1])
        )
          images.push(im[1]);
      }
    }
  }

  // Video / embed block: oEmbed iframes first (Rumble, YouTube, Spotify,
  // Apple Podcasts), then native uploads via the videos[] poster.
  const video: WorkerVideo | null =
    extractVideo(html, oembed) || nativeVideoFromNode(node);

  // The shared-website link card: payload's post.link when present, DOM
  // fallback otherwise. Generic — works for any website the post shares.
  // Suppressed whenever an embed block was extracted: on video posts
  // post.link IS the video oEmbed dict, which used to leak through as an
  // imageless junk card in the payload (the renderer already hid it).
  const linkCard: WorkerLinkCard | null = video
    ? null
    : nuxt?.linkCard
      ? {
          url: nuxt.linkCard.url,
          title: nuxt.linkCard.title,
          domain: nuxt.linkCard.domain,
          imageUrl: nuxt.linkCard.imageUrl,
          description: nuxt.linkCard.description,
        }
      : extractLinkCardDOM(html);

  const viewsMatch = html.match(/aria-label="Post views:\s*([\d,]+)"/i);
  // Articles have no views pill in the DOM; the payload's countViews is
  // the fallback.
  const countViews =
    node && typeof node.countViews === "number" ? node.countViews : null;
  const views =
    viewsMatch ? viewsMatch[1] : countViews !== null ? countViews.toLocaleString("en-US") : null;

  // Article headline: the NUXT payload carries isArticle + title. Mapped to
  // the payload's title field, and prepended to the text so the headline
  // is visible in the image with zero site changes.
  const articleTitle =
    node && node.isArticle === true ? strVal(node.title).trim() : "";
  const title: string | null = articleTitle || null;

  // Post text: the payload's post object is matched by id, so on quote
  // posts the OUTER text can never be mixed up with the quoted text (the
  // old longest-<br>-string heuristic picked whichever was longer).
  const rawDesc = metaContent(html, "og:description");
  let text: string | null =
    nuxt?.text ||
    extractFullText(html, postId) ||
    (rawDesc ? cleanDescription(rawDesc) : null);
  if (articleTitle) {
    text =
      text && !text.startsWith(articleTitle)
        ? `${articleTitle}\n\n${text}`
        : text || articleTitle;
  }

  // NOTE: picks/axes selectors are being confirmed against the live site.
  // They stay null (omitted from the image) until verified — we do NOT reuse
  // the old thumbs-up "like" mapping.
  const { picks, axes } = extractEngagement(html);
  const comments: string | null = null;

  // Timestamps: the DOM byline when present; the payload's createdAt
  // otherwise (article reading views have no standard byline). Pickax SSR
  // renders times in UTC, so the ISO fallback is formatted in UTC.
  const createdAt = node ? strVal(node.createdAt) : "";
  const timestamp = timeMatch
    ? timeMatch[1] // "Sep 19, 2026, 9:11 PM"
    : createdAt
      ? formatAbsUtc(createdAt)
      : null;
  const timeAgo = timeMatch
    ? decodeEntities(timeMatch[2]).trim() // "1 hour ago"
    : createdAt
      ? timeAgoFromIso(createdAt) || null
      : null;

  // The quoted post (repostOf) from the payload: the quoted author's own
  // header info, avatar, badge, full text, and timestamp. The payload nests
  // these when the quoted post is itself a quote (quote-of-a-quote), so the
  // chain is mapped recursively to match pickax.com's nested cards.
  const mapQuoted = (nq: NuxtQuotedPost): WorkerQuotedPost => ({
    postId: nq.postId,
    displayName: nq.displayName || null,
    username: nq.username || null,
    avatarUrl: nq.avatarUrl || null,
    verified: nq.verified,
    text: nq.text || null,
    timestamp: nq.timeAgo || null,
    quoted: nq.quoted ? mapQuoted(nq.quoted) : null,
  });
  // Quote-of-article: repostOf carries content:"" with only the article's
  // title — fall back to the title so the quoted card isn't empty. Applied
  // recursively for chains that bottom out at an article.
  const fixQuotedArticle = (
    q: WorkerQuotedPost | null,
    rqNode: unknown
  ): WorkerQuotedPost | null => {
    if (!q || !rqNode || typeof rqNode !== "object") return q;
    const rn = rqNode as Record<string, unknown>;
    let out = q;
    if (
      !q.text &&
      rn.isArticle === true &&
      typeof rn.title === "string" &&
      rn.title.trim()
    ) {
      out = { ...q, text: decodeEntities(rn.title.trim()) };
    }
    const inner = fixQuotedArticle(q.quoted, rn.repostOf);
    if (inner !== q.quoted) out = { ...out, quoted: inner };
    return out;
  };
  const quoted: WorkerQuotedPost | null = nuxt?.quoted
    ? fixQuotedArticle(
        mapQuoted(nuxt.quoted),
        node ? node.repostOf : null
      )
    : null;

  if (!displayName && !username && !text) return null; // not a recognizable post page

  return {
    postId,
    postUrl,
    displayName,
    username,
    avatarUrl,
    text,
    title,
    timestamp,
    timeAgo,
    views,
    picks,
    axes,
    comments,
    verified,
    images,
    video,
    linkCard,
    quoted,
    fetchedAt: new Date().toISOString(),
  };
}

function jsonResponse(data: unknown, status = 200, cors: string | null = "*"): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Reflected caller origin on the locked-down custom domain, "*" on
      // the workers.dev route (extension + legacy callers), omitted for
      // non-browser requests where CORS doesn't apply.
      ...(cors ? { "Access-Control-Allow-Origin": cors } : {}),
      // Successful post payloads are public and safe to cache (5 min).
      // Errors are never cached — a cached 404/502 would poison retries.
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
    },
  });
}

// Origins allowed to call the worker from a web page. The custom domain is
// locked to our own site so other websites can't piggyback on it in their
// pages; the workers.dev route stays open for the published browser
// extension. Direct non-browser requests (curl, address-bar navigation)
// carry no Origin and are still allowed — abuse is handled by rate
// limiting at the edge, since headers are trivially spoofable anyway.
const ALLOWED_ORIGINS = new Set([
  "https://www.pickax2image.top",
  "https://pickax2image.top",
  "https://masteringrumble.github.io",
]);

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (origin) return ALLOWED_ORIGINS.has(origin);
  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      return ALLOWED_ORIGINS.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return true;
}

function corsFor(request: Request, isApiDomain: boolean): string | null {
  if (!isApiDomain) return "*";
  const origin = request.headers.get("Origin");
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
}

export default {
  async fetch(
    request: Request,
    _env: unknown,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const isApiDomain = url.hostname === "api.pickax2image.top";
    // Lock the custom domain to our own site: requests from other websites'
    // pages are rejected here (bare 403, no usage tips for pokers).
    if (isApiDomain && !originAllowed(request)) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    const cors = corsFor(request, isApiDomain);
    // Edge cache for successful responses. Keyed by the full request URL,
    // so /post?url=<post> and /img?url=<image> each cache independently.
    // This collapses traffic spikes: one pickax.com fetch serves every
    // repeat render until the TTL expires. Errors are never cached.
    // NOTE: this is the Worker's own cache — it still counts as a Worker
    // invocation. Only a CDN cache in FRONT of the worker (custom domain
    // behind Cloudflare proxy) would skip invocations entirely.
    const cache = caches.default;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...(cors ? { "Access-Control-Allow-Origin": cors } : {}),
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      });
    }


    if (url.pathname === "/img") {
      const cacheKey = new Request(url.toString(), { method: "GET" });
      const hit = await cache.match(cacheKey);
      if (hit) return hit;

      const target = (url.searchParams.get("url") ?? "").trim();
      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        return jsonResponse({ error: "invalid-url" }, 400, cors);
      }
      // Locked down: only proxy Pickax's image CDN and Rumble's thumbnail
      // CDN (post attachments + video posters), nothing else.
      const host = parsed.hostname;
      const allowed =
        host === "img.pickax.com" || host.endsWith(".cdn.rumble.cloud");
      if (parsed.protocol !== "https:" || !allowed) {
        return jsonResponse({ error: "invalid-url" }, 400, cors);
      }
      let res: Response;
      try {
        res = await fetch(parsed.toString(), {
          headers: { "User-Agent": "pickax-post-to-image/1.0" },
        });
      } catch {
        return jsonResponse({ error: "fetch-failed" }, 502, cors);
      }
      if (!res.ok) {
        return jsonResponse({ error: "fetch-failed" }, 502, cors);
      }
      const contentType = res.headers.get("Content-Type") ?? "image/jpeg";
      const out = new Response(res.body, {
        headers: {
          "Content-Type": contentType,
          ...(cors ? { "Access-Control-Allow-Origin": cors } : {}),
          // Images are effectively immutable: cache a week.
          "Cache-Control": "public, max-age=604800",
        },
      });
      ctx.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    }

    if (url.pathname !== "/post") {
      return jsonResponse({ error: "not-found" }, 404, cors);
    }

    const target = (url.searchParams.get("url") ?? "").trim();
    const m = target.match(POST_URL_RE);
    if (!m) {
      return jsonResponse({ error: "invalid-url" }, 400, cors);
    }
    const postId = m[1];
    const canonical = `https://pickax.com/post/${postId}`;

    // One pickax.com fetch per post per 5 minutes, no matter how many
    // people render it in that window.
    const postCacheKey = new Request(url.toString(), { method: "GET" });
    const postHit = await cache.match(postCacheKey);
    if (postHit) return postHit;

    let res: Response;
    try {
      res = await fetch(canonical, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch {
      return jsonResponse({ error: "fetch-failed" }, 502, cors);
    }

    if (res.status === 404) return jsonResponse({ error: "not-found" }, 404, cors);
    if (!res.ok) return jsonResponse({ error: "fetch-failed" }, 502, cors);

    const html = await res.text();
    const payload = extract(html, postId, canonical);
    if (!payload) return jsonResponse({ error: "not-found" }, 404, cors);
    const out = jsonResponse(payload, 200, cors);
    ctx.waitUntil(cache.put(postCacheKey, out.clone()));
    return out;
  },
};
