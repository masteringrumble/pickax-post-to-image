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
import { WORKER_BASE } from "../../src/api";
import type {
  LoadedImage,
  PostData,
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

/** Turn an extraction payload into renderer data, loading remote images. */
export async function prepareRenderData(
  p: ExtractedPayload
): Promise<PostData> {
  let avatar: HTMLImageElement | null = null;
  if (p.avatarUrl) {
    try {
      avatar = await loadCdnImage(p.avatarUrl);
    } catch {
      /* renderer falls back to the placeholder avatar */
    }
  }

  const images: LoadedImage[] = [];
  for (const u of (p.imageUrls ?? []).slice(0, MAX_POST_IMAGES)) {
    try {
      images.push(toLoaded(await loadCdnImage(u)));
    } catch {
      /* failed images are omitted, never invented */
    }
  }

  let videoThumb: LoadedImage | null = null;
  if (p.videoThumb) {
    try {
      videoThumb = toLoaded(await loadCdnImage(p.videoThumb));
    } catch {
      /* fall back to the placeholder player */
    }
  }

  // The shared-website link card: load its preview image like any other
  // post image. When it fails, the card still renders domain + title.
  let linkImage: LoadedImage | null = null;
  if (p.linkCard?.imageUrl) {
    try {
      linkImage = toLoaded(await loadCdnImage(p.linkCard.imageUrl));
    } catch {
      /* link card renders without its preview image */
    }
  }

  // The quoted post (quote posts only): the quoted author's own avatar,
  // badge, and full text — exactly as the inner card on pickax.com shows.
  let quotedAvatar: HTMLImageElement | null = null;
  if (p.q?.avatarUrl) {
    try {
      quotedAvatar = await loadCdnImage(p.q.avatarUrl);
    } catch {
      /* quoted card falls back to the placeholder avatar */
    }
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
        }
      : null,
  };
  return data;
}

/** Render the payload straight to a PNG data URL. */
export async function renderPayloadToDataUrl(
  p: ExtractedPayload
): Promise<{ dataUrl: string; filename: string }> {
  const data = await prepareRenderData(p);
  const canvas = await renderPostImage(data);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    filename: `pickax-post-${p.postId || "image"}.png`,
  };
}
