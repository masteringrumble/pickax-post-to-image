// Cloudflare Worker: fetch a public Pickax post page server-side and return clean JSON.
//
// The static site (GitHub Pages) cannot read pickax.com directly — Pickax sends
// no CORS headers, and no login can change that. This tiny backend does the
// fetch where CORS doesn't apply (server-to-server). Only PUBLIC posts are
// supported; no credentials are used or stored.

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
  return desc.replace(/\s*user=[\w.]+\s+[\d,]+\s+Followers\s*$/i, "").trim();
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

/** Video embeds (e.g. Rumble) render as iframes; capture src + title. */
function extractVideo(html: string): { src: string; title: string; thumbnail: string | null } | null {
  const tagM = html.match(/<iframe([^>]*)>/i);
  if (!tagM) return null;
  const attrs = tagM[1];
  const srcM = attrs.match(/src=["']([^"']+)["']/i);
  const titleM = attrs.match(/title=["']([^"']*)["']/i);
  if (!srcM || !/rumble\.com\/embed\//i.test(srcM[1])) return null;
  return {
    src: srcM[1],
    title: titleM ? decodeEntities(titleM[1]) : "",
    thumbnail: extractVideoThumbnail(html),
  };
}

/**
 * The video poster's thumbnail — what the embedded player shows before play,
 * i.e. what you see when viewing the actual post. Rumble's oEmbed thumbnail
 * (served from their CDN) is embedded in the page state.
 */
function extractVideoThumbnail(html: string): string | null {
  const rumbleM = html.match(
    /https:\/\/[a-z0-9.-]+\.cdn\.rumble\.cloud\/[^"\\\s'<>]+\.(?:jpg|jpeg|png|webp)/i
  );
  if (rumbleM) return rumbleM[0];
  const genericM = html.match(/"thumbnail_url"\s*:\s*"([^"]+)"/);
  if (genericM) return genericM[1].replace(/\\\//g, "/");
  return null;
}

export function extract(html: string, postId: string, postUrl: string): PostPayload | null {
  // Display name + @username: adjacent profile links after the avatar.
  // <a href="/Handle" class="cursor-pointer inline-block overflow-clip">Name</a>
  // <a href="/Handle" class="cursor-pointer text-sm ...">@Handle</a><span title="Sep 19, 2026, 9:11 PM">…</span>
  const nameMatch = html.match(
    /<a href="\/([\w.]+)"[^>]*class="[^"]*cursor-pointer inline-block overflow-clip"[^>]*>([^<>]{1,80})<\/a>/
  );
  const displayName = nameMatch ? decodeEntities(nameMatch[2]).trim() : null;
  const handleMatch = html.match(
    /<a href="\/[\w.]+"[^>]*class="[^"]*text-sm[^"]*"[^>]*>@([\w.]+)<\/a>/
  );
  const username = handleMatch ? handleMatch[1] : nameMatch ? nameMatch[1] : null;

  // Verified badge: the seal SVG (signature path "M12.7893 4.26666") renders
  // in a div immediately after the author's display-name link. Scoped to the
  // header so verified commenters elsewhere on the page can't false-positive.
  // The seal's color is the account's real badge: gold (fill-orange-300 /
  // #FDBA74, "Verified Creator") or blue (fill-blue-*/fill-sky-* / #3EB1F9).
  // A seal with no recognizable color defaults to gold — every public badge
  // observed is gold. No seal at all means the account has none.
  let verified: "gold" | "blue" | null = null;
  if (nameMatch && typeof nameMatch.index === "number") {
    const slice = html.slice(nameMatch.index, nameMatch.index + 2000);
    if (slice.includes("12.7893 4.26666")) {
      const s = slice.toLowerCase();
      verified =
        s.includes("3eb1f9") || /fill-(blue|sky)-\d{3}/.test(s) ? "blue" : "gold";
    }
  }
  const timeMatch = html.match(
    /@[\w.]+<\/a><span title="([^"]+)"[^>]*>([^<>]{1,40})<\/span>/
  );

  // Avatar: the rounded-full img served from img.pickax.com
  let avatarUrl: string | null = null;
  const imgTags = html.match(/<img[^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    if (!/rounded-full/i.test(tag)) continue;
    const src = tag.match(/src=["'](https:\/\/img\.pickax\.com\/[^"']+)["']/i);
    if (src) {
      avatarUrl = src[1];
      break;
    }
  }

  // Attached post images: every img.pickax.com image except the avatar
  const images: string[] = [];
  const imgRe = /<img[^>]*src=["'](https:\/\/img\.pickax\.com\/[^"']+)["'][^>]*>/gi;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(html)) !== null) {
    if (im[1] !== avatarUrl && !images.includes(im[1])) images.push(im[1]);
  }

  const viewsMatch = html.match(/aria-label="Post views:\s*([\d,]+)"/i);

  // Post text: full body from the __NUXT_DATA__ payload when present;
  // og:description (truncated) is only the fallback.
  const rawDesc = metaContent(html, "og:description");
  const text =
    extractFullText(html, postId) ??
    (rawDesc ? cleanDescription(rawDesc) : null);

  // NOTE: picks/axes selectors are being confirmed against the live site.
  // They stay null (omitted from the image) until verified — we do NOT reuse
  // the old thumbs-up "like" mapping.
  const { picks, axes } = extractEngagement(html);
  const comments: string | null = null;
  const video = extractVideo(html);

  if (!displayName && !username && !text) return null; // not a recognizable post page

  return {
    postId,
    postUrl,
    displayName,
    username,
    avatarUrl,
    text,
    timestamp: timeMatch ? timeMatch[1] : null, // "Sep 19, 2026, 9:11 PM"
    timeAgo: timeMatch ? decodeEntities(timeMatch[2]).trim() : null, // "1 hour ago"
    views: viewsMatch ? viewsMatch[1] : null,
    picks,
    axes,
    comments,
    verified,
    images,
    video,
    fetchedAt: new Date().toISOString(),
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      });
    }

    if (url.pathname === "/img") {
      const target = (url.searchParams.get("url") ?? "").trim();
      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        return jsonResponse({ error: "invalid-url" }, 400);
      }
      // Locked down: only proxy Pickax's image CDN and Rumble's thumbnail
      // CDN (post attachments + video posters), nothing else.
      const host = parsed.hostname;
      const allowed =
        host === "img.pickax.com" || host.endsWith(".cdn.rumble.cloud");
      if (parsed.protocol !== "https:" || !allowed) {
        return jsonResponse(
          { error: "invalid-url", hint: "Only Pickax/Rumble image CDN URLs are proxied" },
          400
        );
      }
      let res: Response;
      try {
        res = await fetch(parsed.toString(), {
          headers: { "User-Agent": "pickax-post-to-image/1.0" },
        });
      } catch {
        return jsonResponse({ error: "fetch-failed" }, 502);
      }
      if (!res.ok) {
        return jsonResponse({ error: "fetch-failed", hint: `img.pickax.com returned ${res.status}` }, 502);
      }
      const contentType = res.headers.get("Content-Type") ?? "image/jpeg";
      return new Response(res.body, {
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    if (url.pathname !== "/post") {
      return jsonResponse({ error: "not-found", hint: "Use /post?url=https://pickax.com/post/<id>" }, 404);
    }

    const target = (url.searchParams.get("url") ?? "").trim();
    const m = target.match(POST_URL_RE);
    if (!m) {
      return jsonResponse(
        { error: "invalid-url", hint: "Expected a public Pickax post URL like https://pickax.com/post/707864" },
        400,
      );
    }
    const postId = m[1];
    const canonical = `https://pickax.com/post/${postId}`;

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
      return jsonResponse({ error: "fetch-failed", hint: "Could not reach pickax.com" }, 502);
    }

    if (res.status === 404) return jsonResponse({ error: "not-found", hint: "Pickax returned 404 for this post" }, 404);
    if (!res.ok) return jsonResponse({ error: "fetch-failed", hint: `pickax.com returned ${res.status}` }, 502);

    const html = await res.text();
    const payload = extract(html, postId, canonical);
    if (!payload) return jsonResponse({ error: "not-found", hint: "No recognizable post content on this page" }, 404);
    return jsonResponse(payload);
  },
};
