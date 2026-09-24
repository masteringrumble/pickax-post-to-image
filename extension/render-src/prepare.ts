// Pickax Post to Image — extension render preparation.
//
// Turns the v6 extraction payload produced by content.js into renderer data
// (PostData + loaded images) and renders it to a PNG data URL. This is the
// same pipeline the web app uses (App.tsx importParsed), factored out so the
// browser extension can generate the image itself without opening the site.
//
// Bundled with esbuild into extension/offscreen.js and run inside the
// extension's offscreen document (which has a real DOM, canvas, and
// document.fonts, exactly what the renderer needs).
import { renderPostImage } from "../../src/renderer";
import {
  WORKER_BASE,
  fetchPostFromWorker,
  workerConfigured,
  type WorkerPostPayload,
  type WorkerQuotedPost,
} from "../../src/api";
import {
  DEFAULT_RENDER_OPTIONS,
  type RenderOptions,
} from "../../src/types";
import type {
  LoadedImage,
  PostData,
  QuotedPost,
  VerifiedBadge,
} from "../../src/types";

// The payload shape content.js extracts (v6).
export interface ExtractedPayload {
  v: number;
  postId: string;
  displayName: string;
  text: string;
  username: string;
  verified: string; // "gold" | "blue" | ""
  avatarUrl: string;
  timestamp: string;
  picks: string;
  axes: string;
  views: string;
  videoSrc: string;
  videoTitle: string;
  videoThumb: string;
  imageUrls: string[];
  linkCard: {
    url: string;
    title: string;
    domain: string;
    imageUrl: string;
    description: string;
  } | null;
  q: {
    postId: string;
    displayName: string;
    username: string;
    avatarUrl: string;
    verified: string;
    text: string;
    timestamp: string;
  } | null;
}

const MAX_POST_IMAGES = 4;

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image-load"));
    img.src = url.trim();
  });
}

function toLoaded(img: HTMLImageElement): LoadedImage {
  return { img, width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Load a remote post image (profile picture, attached photo, video poster).
 * These CDNs send no CORS headers, so a direct cross-origin load fails in
 * the browser; the worker re-serves the same bytes with
 * `Access-Control-Allow-Origin: *` as a fallback.
 */
async function loadCdnImage(url: string): Promise<HTMLImageElement> {
  try {
    return await loadImageFromUrl(url);
  } catch {
    return await loadImageFromUrl(
      `${WORKER_BASE}/img?url=${encodeURIComponent(url.trim())}`
    );
  }
}

function badge(v: string): VerifiedBadge {
  return v === "gold" ? "gold" : v === "blue" ? "blue" : null;
}

// Cache loaded images across renders so toggle flips re-render instantly
// without refetching (mirrors the web app, which reuses its loaded data).
// Failures are cached as null so a dead URL isn't retried on every flip.
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadCdnImageCached(url: string): Promise<HTMLImageElement | null> {
  const key = url.trim();
  let hit = imageCache.get(key);
  if (!hit) {
    hit = loadCdnImage(key).catch(() => null);
    imageCache.set(key, hit);
  }
  return hit;
}

/** Turn an extraction payload into renderer data, loading remote images. */
export async function prepareRenderData(
  p: ExtractedPayload
): Promise<PostData> {
  // The website's primary path reads the post through the worker's
  // server-side extraction — that is what reliably gets video thumbnails,
  // post images, avatars, and link cards. Do exactly the same here: the
  // content script already extracted the post id, so ask the worker for
  // the identical payload the site would get. The DOM payload stays as
  // the fallback for posts the worker can't see (private/deleted) or
  // when the worker is unreachable.
  if (p.postId && workerConfigured()) {
    try {
      const wp = await fetchWorkerPayloadCached(p.postId);
      return await prepareFromWorkerPayload(wp);
    } catch {
      /* fall through to the DOM payload */
    }
  }
  return prepareFromDomPayload(p);
}

// Cache worker payloads per post id so toggle flips (which re-run
// prepareRenderData) don't refetch. A rejected fetch is evicted so the
// next call retries instead of sticking to the DOM fallback forever.
const workerPayloadCache = new Map<string, Promise<WorkerPostPayload>>();
function fetchWorkerPayloadCached(postId: string): Promise<WorkerPostPayload> {
  let hit = workerPayloadCache.get(postId);
  if (!hit) {
    hit = fetchPostFromWorker(postId);
    workerPayloadCache.set(postId, hit);
    hit.catch(() => {
      if (workerPayloadCache.get(postId) === hit)
        workerPayloadCache.delete(postId);
    });
  }
  return hit;
}

/**
 * The quoted post (quote posts only): each level's avatar loads
 * recursively — the same walk the web app does, so nested quote chains
 * render identically.
 */
async function loadQuotedFromWorker(
  q: WorkerQuotedPost | null | undefined
): Promise<QuotedPost | null> {
  if (!q) return null;
  let avatar: HTMLImageElement | null = null;
  if (q.avatarUrl) {
    avatar = await loadCdnImageCached(q.avatarUrl);
  }
  return {
    postId: q.postId,
    displayName: q.displayName ?? "",
    username: (q.username ?? "").replace(/^@+/, ""),
    verified: q.verified ?? null,
    avatar,
    text: (q.text ?? "").replace(/\\r\\n/g, "\n"),
    timestamp: q.timestamp ?? "",
    quoted: await loadQuotedFromWorker(q.quoted),
  };
}

/**
 * Turn a worker payload into renderer data, loading remote images —
 * the same conversion the web app applies to the same payload, so the
 * extension renders exactly what the site would.
 */
async function prepareFromWorkerPayload(
  wp: WorkerPostPayload
): Promise<PostData> {
  let avatar: HTMLImageElement | null = null;
  if (wp.avatarUrl) {
    avatar = await loadCdnImageCached(wp.avatarUrl);
  }

  const images: LoadedImage[] = [];
  for (const u of (wp.images ?? []).slice(0, MAX_POST_IMAGES)) {
    const loaded = await loadCdnImageCached(u);
    if (loaded) images.push(toLoaded(loaded));
  }

  let videoThumb: LoadedImage | null = null;
  if (wp.video?.thumbnail) {
    const loaded = await loadCdnImageCached(wp.video.thumbnail);
    if (loaded) videoThumb = toLoaded(loaded);
  }

  let linkImage: LoadedImage | null = null;
  if (wp.linkCard?.imageUrl) {
    const loaded = await loadCdnImageCached(wp.linkCard.imageUrl);
    if (loaded) linkImage = toLoaded(loaded);
  }

  const quoted = await loadQuotedFromWorker(wp.quoted);

  return {
    postId: wp.postId,
    displayName: wp.displayName ?? "",
    username: (wp.username ?? "").replace(/^@+/, ""),
    verified: wp.verified ?? null,
    avatar,
    text: (wp.text ?? "").replace(/\\r\\n/g, "\n"),
    timestamp: wp.timeAgo || wp.timestamp || "",
    images,
    engagement: {
      picks: wp.picks ?? undefined,
      axes: wp.axes ?? undefined,
      views: wp.views ?? undefined,
    },
    video: wp.video
      ? { src: wp.video.src, title: wp.video.title, thumbnail: videoThumb }
      : null,
    linkCard: wp.linkCard
      ? {
          url: wp.linkCard.url,
          domain: wp.linkCard.domain,
          title: wp.linkCard.title,
          description: wp.linkCard.description ?? "",
          image: linkImage,
        }
      : null,
    quoted,
  };
}

/** Turn a DOM-extraction payload into renderer data (fallback path). */
async function prepareFromDomPayload(
  p: ExtractedPayload
): Promise<PostData> {
  let avatar: HTMLImageElement | null = null;
  if (p.avatarUrl) {
    avatar = await loadCdnImageCached(p.avatarUrl);
  }

  const images: LoadedImage[] = [];
  for (const u of (p.imageUrls ?? []).slice(0, MAX_POST_IMAGES)) {
    const loaded = await loadCdnImageCached(u);
    if (loaded) images.push(toLoaded(loaded));
  }

  let videoThumb: LoadedImage | null = null;
  if (p.videoThumb) {
    const loaded = await loadCdnImageCached(p.videoThumb);
    if (loaded) videoThumb = toLoaded(loaded);
  }

  // The shared-website link card: load its preview image like any other
  // post image. When it fails, the card still renders domain + title.
  let linkImage: LoadedImage | null = null;
  if (p.linkCard?.imageUrl) {
    const loaded = await loadCdnImageCached(p.linkCard.imageUrl);
    if (loaded) linkImage = toLoaded(loaded);
  }

  // The quoted post (quote posts only): the quoted author's own avatar,
  // badge, and full text — exactly as the inner card on pickax.com shows.
  let quotedAvatar: HTMLImageElement | null = null;
  if (p.q?.avatarUrl) {
    quotedAvatar = await loadCdnImageCached(p.q.avatarUrl);
  }

  const data: PostData = {
    postId: p.postId,
    displayName: p.displayName ?? "",
    username: (p.username ?? "").replace(/^@+/, ""),
    verified: badge(p.verified ?? ""),
    avatar,
    text: (p.text ?? "").replace(/\\r\\n/g, "\n"),
    timestamp: p.timestamp ?? "",
    images,
    engagement: {
      picks: p.picks || undefined,
      axes: p.axes || undefined,
      views: p.views || undefined,
    },
    video: p.videoSrc
      ? { src: p.videoSrc, title: p.videoTitle, thumbnail: videoThumb }
      : null,
    linkCard: p.linkCard
      ? {
          url: p.linkCard.url,
          domain: p.linkCard.domain,
          title: p.linkCard.title,
          description: p.linkCard.description ?? "",
          image: linkImage,
        }
      : null,
    quoted: p.q
      ? {
          postId: p.q.postId,
          displayName: p.q.displayName ?? "",
          username: (p.q.username ?? "").replace(/^@+/, ""),
          verified: badge(p.q.verified ?? ""),
          avatar: quotedAvatar,
          text: (p.q.text ?? "").replace(/\\r\\n/g, "\n"),
          timestamp: p.q.timestamp ?? "",
          // The DOM payload only ever carries one quote level.
          quoted: null,
        }
      : null,
  };
  return data;
}

/** Render the payload straight to a PNG data URL, honoring the user's
 * "Show in image" options (same RenderOptions the web app uses). */
export async function renderPayloadToDataUrl(
  p: ExtractedPayload,
  opts: RenderOptions = DEFAULT_RENDER_OPTIONS
): Promise<{ dataUrl: string; filename: string }> {
  const data = await prepareRenderData(p);
  const canvas = await renderPostImage(data, opts);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    filename: `pickax-post-${p.postId || "image"}.png`,
  };
}
