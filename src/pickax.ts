// Pickax post URL validation.
//
// Automatic import goes through the Cloudflare Worker (see src/api.ts):
// the static site can't fetch pickax.com directly because Pickax sends no
// CORS headers, so the worker reads the public post page server-side where
// CORS doesn't apply. This module just validates/normalizes the URL.

export function extractPostId(input: string): string | null {
  const t = input.trim();
  const m = t.match(
    /^https?:\/\/(?:www\.)?pickax\.com\/post\/(\d+)(?:[/?#].*)?$/i
  );
  return m ? m[1] : null;
}
