// Pure parser for Pickax's __NUXT_DATA__ payload (devalue format).
//
// No DOM, no Node APIs: this module is shared by the app (importHtml),
// the Cloudflare Worker (server-side import), and the Node smoke tests.
//
// Devalue shape, verified against real post pages (2026-09-19):
// - The block is a JSON array. The root value lives at index 0.
// - At any VALUE position inside an object/array, an integer in
//   [0, array.length) is a REFERENCE to that slot. (In JS, booleans are
//   not numbers, so `true` is never mistaken for index 1.)
// - A slot's own content is literal: e.g. slot 6 holding 709927 IS the
//   number 709927, not a reference. So references are only followed from
//   value positions, never re-interpreted from slot contents.
// - Negative numbers encode devalue specials (undefined/NaN/...); they
//   fail the range check and pass through as literals, which we ignore.
//
// The post object carries: id, content (HTML with <br> breaks), createdAt
// (ISO), user { fullname, username, avatar (relative img.pickax.com path),
// is_verified, creator }, attachments [{ url, type: "image", ... }] (the
// post's OWN attached images), link { url, title, image, description }
// (the shared-website link card, when the post shares one), and repostOf ->
// the quoted post object (same shape) when this is a quote post.
//
// Verified badge rule, verified against the live site: creator non-null
// means the gold "Verified Creator" seal; is_verified true with a null
// creator means the blue seal; otherwise the account has no badge.

export type VerifiedBadge = "gold" | "blue" | null;

export interface NuxtPostAuthor {
  displayName: string;
  username: string;
  /** Absolute https://img.pickax.com/... URL, or "" when absent. */
  avatarUrl: string;
  verified: VerifiedBadge;
}

export interface NuxtQuotedPost extends NuxtPostAuthor {
  postId: string;
  /** Cleaned plain text of the quoted post. */
  text: string;
  /** ISO datetime of the quoted post. */
  createdAt: string;
  /** Relative time as the site shows it, e.g. "2 hours ago". */
  timeAgo: string;
}

export interface NuxtLinkCard {
  /** The full shared URL. */
  url: string;
  /** The link's title, as Pickax shows it under the preview image. */
  title: string;
  /** Bare domain, e.g. "trendingpoliticsnews.com". */
  domain: string;
  /** Absolute https://img.pickax.com/metadata/... preview image URL. */
  imageUrl: string;
  /** The link's description, when the payload carries one. */
  description: string;
}

export interface NuxtPostData {
  postId: string;
  /** Cleaned plain text of the outer post. */
  text: string;
  author: NuxtPostAuthor;
  /** ISO datetime of the outer post. */
  createdAt: string;
  /** The quoted post, or null when this is not a quote post. */
  quoted: NuxtQuotedPost | null;
  /**
   * The post's OWN attached images, from the payload's attachments list
   * (type "image") — the authoritative source. A link card's preview image
   * (img.pickax.com/metadata/...) is never in here; it belongs to linkCard.
   */
  images: string[];
  /**
   * The shared-website link card (post.link in the payload), or null when
   * the post shares no link. Generic: works for any website a person shares.
   */
  linkCard: NuxtLinkCard | null;
}

const IMG_CDN = "https://img.pickax.com/";

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&shy;/gi, "") // soft hyphen entity: invisible, drop it
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    // Common named entities beyond the basics (payloads use a few).
    .replace(/&([a-z]+);/gi, (_m, name) => {
      const map: Record<string, string> = {
        euml: "ë",
        Euml: "Ë",
        auml: "ä",
        Auml: "Ä",
        ouml: "ö",
        Ouml: "Ö",
        uuml: "ü",
        Uuml: "Ü",
        iuml: "ï",
        eacute: "é",
        egrave: "è",
        ecirc: "ê",
        aacute: "á",
        agrave: "à",
        acirc: "â",
        oacute: "ó",
        ocirc: "ô",
        uacute: "ú",
        iacute: "í",
        ntilde: "ñ",
        ccedil: "ç",
        szlig: "ß",
        copy: "©",
        reg: "®",
        trade: "™",
        hellip: "…",
        mdash: "—",
        ndash: "–",
        laquo: "«",
        raquo: "»",
        rsquo: "’",
        lsquo: "‘",
        rdquo: "”",
        ldquo: "“",
      };
      return map[name] ?? map[name.toLowerCase()] ?? _m;
    });
}

/**
 * Clean raw post content from the payload into plain text. The payload
 * stores <br> line breaks, literal "\xad" soft-hyphen escapes (backslash +
 * "xad" as text) plus real U+00AD chars, and occasional literal "\n"
 * two-character sequences. Paragraphs are <br><br>.
 */
export function cleanPostText(raw: string): string {
  let s = String(raw ?? "");
  s = s.replace(/<br\s*\/?>/gi, "\n"); // breaks first, before stripping tags
  s = s.replace(/<[^>]*>/g, ""); // strip any remaining tags
  s = decodeEntities(s);
  s = s.replace(/\\xad/gi, ""); // literal "\xad" text
  s = s.replace(/\u00ad/g, ""); // real soft hyphen U+00AD
  s = s.replace(/\\n/g, "\n"); // literal "\n" two chars -> newline
  s = s.replace(/\r/g, "");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/** Relative time the way pickax.com shows it: "5 minutes ago". */
export function timeAgoFromIso(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const diffSec = Math.max(0, Math.round((nowMs - t) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} hour${diffH === 1 ? "" : "s"} ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} day${diffD === 1 ? "" : "s"} ago`;
  const d = new Date(t);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Devalue reference resolver with memoization and cycle protection. */
function makeResolver(slots: unknown[]) {
  const memo = new Map<number, unknown>();
  const inProgress = new Set<number>();

  // A value found inside an object/array: integers in range are references.
  function valueOf(v: unknown): unknown {
    if (
      typeof v === "number" &&
      Number.isInteger(v) &&
      v >= 0 &&
      v < slots.length
    ) {
      return deref(v);
    }
    if (Array.isArray(v)) return v.map(valueOf);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v))
        o[k] = valueOf((v as Record<string, unknown>)[k]);
      return o;
    }
    return v;
  }

  // The content of a slot: containers resolve recursively, primitives are
  // literal (a number sitting IN a slot is the value itself).
  function deref(idx: number): unknown {
    if (memo.has(idx)) return memo.get(idx);
    if (inProgress.has(idx)) return undefined; // cyclic ref
    inProgress.add(idx);
    const v = slots[idx];
    let out: unknown;
    if (Array.isArray(v)) {
      const a: unknown[] = [];
      memo.set(idx, a);
      for (const item of v) a.push(valueOf(item));
      out = a;
    } else if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      memo.set(idx, o);
      for (const k of Object.keys(v))
        o[k] = valueOf((v as Record<string, unknown>)[k]);
      out = o;
    } else {
      out = v;
    }
    inProgress.delete(idx);
    memo.set(idx, out);
    return out;
  }

  return { deref };
}

type PostNode = Record<string, unknown>;

function isPostNode(o: unknown): o is PostNode {
  return (
    !!o &&
    typeof o === "object" &&
    !Array.isArray(o) &&
    typeof (o as PostNode).content === "string" &&
    "id" in (o as PostNode)
  );
}

/** Find the post object whose id matches, walking the resolved tree. */
function findPost(root: unknown, postId: string): PostNode | null {
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur as object)) continue;
    seen.add(cur as object);
    if (isPostNode(cur) && String(cur.id) === String(postId)) return cur;
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
    } else {
      for (const k of Object.keys(cur))
        stack.push((cur as Record<string, unknown>)[k]);
    }
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Bare domain from a URL ("www." stripped); "" when unparseable. */
export function hostOf(rawUrl: string): string {
  const u = str(rawUrl).trim();
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./i, "");
  } catch {
    const m = u.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i);
    return m ? m[1].replace(/^www\./i, "") : "";
  }
}

/**
 * The post's own attached images: payload attachments with type "image",
 * made absolute. Link-card preview images live under img.pickax.com/metadata/
 * and belong to linkCard, never here.
 */
function imagesFromPost(post: PostNode): string[] {
  const atts = post.attachments;
  if (!Array.isArray(atts)) return [];
  const urls: string[] = [];
  for (const a of atts) {
    if (!a || typeof a !== "object") continue;
    const att = a as PostNode;
    if (str(att.type).toLowerCase() !== "image") continue;
    const p = str(att.url);
    if (!p || urls.length >= 4) continue;
    const abs = /^https?:\/\//i.test(p) ? p : IMG_CDN + p;
    if (!urls.includes(abs)) urls.push(abs);
  }
  return urls;
}

/** The shared-website link card from post.link, or null when none. */
function linkCardFromPost(post: PostNode): NuxtLinkCard | null {
  const l = post.link;
  if (!l || typeof l !== "object") return null;
  const link = l as PostNode;
  const url = str(link.url) || str(link.inputUrl);
  if (!url) return null;
  return {
    url,
    title: str(link.title),
    domain: hostOf(url),
    imageUrl: str(link.image),
    description: str(link.description),
  };
}

function badgeFromUser(user: PostNode | null | undefined): VerifiedBadge {
  if (!user || typeof user !== "object") return null;
  // Gold "Verified Creator" when the creator record exists; blue when the
  // account is verified but has no creator record.
  if (user.creator !== null && user.creator !== undefined) return "gold";
  if ((user as PostNode).is_verified === true) return "blue";
  return null;
}

function authorFromUser(user: unknown): NuxtPostAuthor {
  const u = (user && typeof user === "object" ? user : {}) as PostNode;
  const avatarPath = str(u.avatar);
  return {
    displayName: str(u.fullname),
    username: str(u.username),
    avatarUrl: avatarPath ? IMG_CDN + avatarPath : "",
    verified: badgeFromUser(u),
  };
}

/**
 * Parse a __NUXT_DATA__ block and extract the outer post plus, when this
 * is a quote post, the quoted post (postId, author with badge, avatar,
 * text, timestamp). Returns null when the block isn't a usable payload.
 */
export function parseNuxtPostData(
  raw: string,
  postId: string
): NuxtPostData | null {
  let slots: unknown;
  try {
    slots = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(slots) || slots.length === 0) return null;
  let root: unknown;
  try {
    root = makeResolver(slots).deref(0);
  } catch {
    return null;
  }
  const post = findPost(root, postId);
  if (!post) return null;

  const author = authorFromUser(post.user);
  const text = cleanPostText(str(post.content));
  const createdAt = str(post.createdAt);

  let quoted: NuxtQuotedPost | null = null;
  const repostOf = post.repostOf;
  if (isPostNode(repostOf)) {
    const qAuthor = authorFromUser(repostOf.user);
    const qCreatedAt = str(repostOf.createdAt);
    quoted = {
      ...qAuthor,
      postId: String(repostOf.id ?? ""),
      text: cleanPostText(str(repostOf.content)),
      createdAt: qCreatedAt,
      timeAgo: timeAgoFromIso(qCreatedAt),
    };
  }

  return {
    postId: String(post.id ?? postId),
    text,
    author,
    createdAt,
    quoted,
    images: imagesFromPost(post),
    linkCard: linkCardFromPost(post),
  };
}

/** Pull the raw __NUXT_DATA__ block out of a page source string. */
export function extractNuxtBlock(html: string): string | null {
  const m = html.match(
    /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  return m ? m[1] : null;
}
