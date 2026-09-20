/**
 * Sharing a generated Pickax post image to social platforms.
 *
 * Two realities shape this module:
 * - On mobile, the Web Share API can hand the actual PNG file to the
 *   platform's app (X, Truth Social, Instagram, Snapchat) — the real
 *   image-sharing path.
 * - On desktop there is no file-sharing route, so we download the PNG,
 *   copy the caption or link, and open the platform's compose/share page
 *   with a suggested caption prefilled. The user always edits before posting.
 *
 * Instagram and Snapchat expose no web share endpoint at all, so their
 * buttons are: native share sheet on mobile, download + copied link on
 * desktop (the user adds the link as a story sticker themselves).
 */
import type { PostData } from "./types";

export const PICKAX_X_URL = "https://x.com/pickaxsocial";
export const PICKAX_HANDLE = "@pickaxsocial";

/** Canonical link to the Pickax post being shared. */
export function postUrlOf(data: Pick<PostData, "postId">): string {
  const id = data.postId.trim();
  return id ? `https://pickax.com/post/${id}` : "";
}

function excerptOf(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * The suggested caption for "post" targets (X, Truth Social). The user can
 * use it as-is or edit it in the composer — it is always prefilled, never
 * posted automatically. The @pickaxsocial tag lives on the image itself
 * (the footer), so the caption names Pickax without an @-mention.
 */
export function suggestedPostCaption(data: Pick<PostData, "postId" | "displayName" | "text">): string {
  const url = postUrlOf(data);
  const who = data.displayName.trim() || "someone";
  const quote = excerptOf(data.text, 110);
  const head = quote ? `“${quote}”\n\n— ${who} on Pickax` : `${who} on Pickax`;
  return url ? `${head}\n${url}` : head;
}

/** X/Twitter web intent with the caption prefilled. Image is attached by hand. */
export function xIntentUrl(caption: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(caption)}`;
}

/**
 * Truth Social's official share endpoint (help.truthsocial.com/publishers/share-button):
 * `title` prefills the composer's first line, `url` prefills the last line.
 * 500-character limit — our captions stay well under it.
 */
export function truthSocialShareUrl(title: string, url: string): string {
  return (
    `https://truthsocial.com/share?title=${encodeURIComponent(title)}` +
    `&url=${encodeURIComponent(url)}`
  );
}

/** The title line for Truth Social: the caption minus the URL (it gets its own param). */
export function truthSocialTitle(data: Pick<PostData, "displayName" | "text">): string {
  const who = data.displayName.trim() || "someone";
  const quote = excerptOf(data.text, 200);
  return quote ? `“${quote}”\n\n— ${who} on Pickax` : `${who} on Pickax`;
}

export function captionFitsX(caption: string): boolean {
  // X counts every URL as 23 chars (t.co); raw length is the conservative check.
  return caption.length <= 280;
}

export function titleFitsTruthSocial(title: string, url: string): boolean {
  return title.length + url.length + 1 <= 500;
}

/** True when the browser can hand a file to the OS share sheet (mobile path). */
export function canNativeShareFile(file: File): boolean {
  try {
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
    };
    return typeof nav.canShare === "function" && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export interface NativeShareData {
  files: File[];
  title?: string;
  text?: string;
  url?: string;
}

/**
 * Open the OS share sheet. Resolves true when the sheet was shown;
 * resolves false when the user dismissed it (AbortError) — not an error.
 */
export async function nativeShare(data: NativeShareData): Promise<boolean> {
  try {
    await (navigator as Navigator & { share: (d: NativeShareData) => Promise<void> }).share(data);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return false;
    throw err;
  }
}

/** Copy text to the clipboard; false when the clipboard is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-secure contexts.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Download a PNG blob with the given filename. */
export function downloadPng(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Render the current preview canvas to a PNG File for sharing. */
export function canvasToPngFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}
