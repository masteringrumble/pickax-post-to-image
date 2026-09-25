// Client for the Cloudflare Worker that fetches public Pickax post pages
// server-side and returns clean JSON. The static site can't fetch
// pickax.com directly (no CORS headers), so the worker does it where CORS
// doesn't apply. Public posts only — no login, no session, nothing stored.

export const WORKER_BASE = "https://api.pickax2image.top";

import type { VerifiedBadge } from "./types";

export interface WorkerPostVideo {
  src: string;
  title: string;
  thumbnail: string | null;
}

export interface WorkerQuotedPost {
  postId: string;
  displayName: string | null;
  username: string | null;
  /** Absolute https://img.pickax.com/... URL of the QUOTED author's avatar. */
  avatarUrl: string | null;
  /** The quoted account's verified badge (gold/blue), or null when none. */
  verified: VerifiedBadge;
  text: string | null;
  /** Relative timestamp as the site shows it, e.g. "2 hours ago". */
  timestamp: string | null;
  /** The next level of the quote chain, or null when none. */
  quoted: WorkerQuotedPost | null;
}

export interface WorkerPostPayload {
  postId: string;
  postUrl: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  text: string | null;
  timestamp: string | null;
  timeAgo: string | null;
  views: string | null;
  picks: string | null;
  axes: string | null;
  comments: string | null;
  /** The account's verified badge (gold/blue), or null when it has none. */
  verified: VerifiedBadge;
  images: string[];
  video: WorkerPostVideo | null;
  /** The shared-website link card, or null when the post shares no link. */
  linkCard: {
    url: string;
    title: string;
    domain: string;
    imageUrl: string;
    description: string;
  } | null;
  /** The quoted post, or null when this is not a quote post. */
  quoted: WorkerQuotedPost | null;
  fetchedAt: string;
}

export type WorkerErrorKind =
  | "not-found"
  | "blocked"
  | "empty"
  | "network"
  | "not-configured";

export class WorkerError extends Error {
  kind: WorkerErrorKind;
  constructor(kind: WorkerErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

export function workerConfigured(): boolean {
  return !WORKER_BASE.includes("__WORKER_HOST__");
}

export async function fetchPostFromWorker(
  postId: string
): Promise<WorkerPostPayload> {
  if (!workerConfigured()) throw new WorkerError("not-configured");
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 20000);
  let res: Response;
  try {
    const target = `https://pickax.com/post/${encodeURIComponent(postId)}`;
    res = await fetch(
      `${WORKER_BASE}/post?url=${encodeURIComponent(target)}`,
      { signal: ctrl.signal }
    );
  } catch {
    window.clearTimeout(timer);
    throw new WorkerError("network");
  }
  window.clearTimeout(timer);

  if (res.status === 404) throw new WorkerError("not-found");
  if (!res.ok) throw new WorkerError("blocked");

  const data = (await res.json()) as WorkerPostPayload;
  if (!data || (!data.displayName && !data.text)) throw new WorkerError("empty");
  return data;
}

/** Plain-English explanation of a worker failure, for the UI. */
export function workerErrorMessage(e: unknown): string {
  if (e instanceof WorkerError) {
    switch (e.kind) {
      case "not-found":
        return "We couldn't find that Pickax post. Check the URL and try again.";
      case "not-configured":
        return "Automatic import isn't switched on yet on this copy of the app.";
      case "network":
        return "Couldn't reach the import service. Check your connection and try again.";
      case "empty":
        return "The post page didn't contain readable post data.";
      case "blocked":
        return "The post couldn't be read right now. It may be private, deleted, or temporarily unavailable.";
    }
  }
  return "Something went wrong while importing the post. Please try again.";
}
