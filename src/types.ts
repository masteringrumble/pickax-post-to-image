/**
 * The account's Pickax verified badge, exactly as the post shows it.
 * Gold ("Verified Creator") or blue; null when the account has none.
 * This always reflects the account's real state — it is detected from the
 * post on import, or declared for the account in manual entry. It is never
 * a user toggle: an account with a badge gets its badge, one without gets none.
 */
export type VerifiedBadge = "gold" | "blue" | null;

// A post image that has already been loaded (from a file upload or URL)
// so its natural dimensions are known before rendering.
export interface LoadedImage {
  img: HTMLImageElement;
  width: number;
  height: number;
}

export interface Engagement {
  // Legacy keys (manual entry / bookmarklet). The renderer prefers
  // picks/axes when present and falls back to likes.
  likes?: string;
  comments?: string;
  reposts?: string;
  views?: string;
  /** Pickax "pick" (like) count — shown with the pick/hand icon. */
  picks?: string;
  /** Pickax "axe" (dislike) count — shown with the axe icon. */
  axes?: string;
}

export interface PostVideo {
  /** Embed URL (e.g. https://rumble.com/embed/...) */
  src: string;
  /** Video title, shown on the placeholder. */
  title: string;
  /** Poster thumbnail, drawn like the video looks on the actual post. */
  thumbnail: LoadedImage | null;
}

// A quoted (reposted) post embedded inside a quote post, as pickax.com
// shows it: the quoted author's own header (avatar, name, badge,
// timestamp) and their full text, inside the darker inner card.
export interface QuotedPost {
  postId: string;
  displayName: string;
  username: string;
  /** The quoted account's verified badge (gold/blue), or null when none. */
  verified: VerifiedBadge;
  /** The quoted author's own profile picture (not the post image). */
  avatar: HTMLImageElement | null;
  text: string;
  timestamp: string;
}

// Everything the renderer needs. Every field is either retrieved from the
// public post, auto-imported, or typed in by the user in manual mode.
// Nothing here is ever invented by the app.
export interface PostData {
  postId: string;
  displayName: string;
  username: string;
  /** The account's verified badge (gold/blue), or null when it has none. */
  verified: VerifiedBadge;
  avatar: HTMLImageElement | null;
  text: string;
  timestamp: string;
  images: LoadedImage[];
  engagement: Engagement;
  video?: PostVideo | null;
  /** Set when the post quotes another post; null/undefined otherwise. */
  quoted?: QuotedPost | null;
}

// Toggles for what appears in the generated image. Everything defaults to
// visible; the UI lets the user hide individual pieces.
export interface RenderOptions {
  showLogo: boolean;
  showViews: boolean;
  showMedia: boolean;
  showEngagement: boolean;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  showLogo: true,
  showViews: true,
  showMedia: true,
  showEngagement: true,
};
