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
  /** Author's Pickax verified badge (seal next to the display name). */
  verified: boolean;
  images: string[];
  video: { src: string; title: string } | null;
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
function extractVideo(html: string): { src: string; title: string } | null {
  const tagM = html.match(/<iframe([^>]*)>/i);
  if (!tagM) return null;
  const attrs = tagM[1];
  const srcM = attrs.match(/src=["']([^"']+)["']/i);
  const titleM = attrs.match(/title=["']([^"']*)["']/i);
  if (!srcM || !/rumble\.com\/embed\//i.test(srcM[1])) return null;
  return { src: srcM[1], title: titleM ? decodeEntities(titleM[1]) : "" };
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
  let verified = false;
  if (nameMatch && typeof nameMatch.index === "number") {
    verified = html
      .slice(nameMatch.index, nameMatch.index + 2000)
      .includes("12.7893 4.26666");
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

  // Post text: og:description minus the SEO suffix (verified against live page).
  const rawDesc = metaContent(html, "og:description");
  const text = rawDesc ? cleanDescription(rawDesc) : null;

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
