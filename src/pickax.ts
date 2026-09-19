// Pickax URL validation + best-effort public post import.
//
// Pickax does not send CORS headers, so a direct browser fetch of a post
// page is blocked. tryAutoImport() makes one honest attempt anyway (it
// works if Pickax ever enables CORS or the page is same-origin) and
// otherwise throws a typed error so the UI can fall back to manual entry.

export function extractPostId(input: string): string | null {
  const t = input.trim();
  const m = t.match(
    /^https?:\/\/(?:www\.)?pickax\.com\/post\/(\d+)(?:[/?#].*)?$/i
  );
  return m ? m[1] : null;
}

export interface AutoImport {
  displayName: string;
  text: string;
}

export type AutoImportErrorKind = "not-found" | "blocked" | "empty";

export class AutoImportError extends Error {
  kind: AutoImportErrorKind;
  constructor(kind: AutoImportErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

export async function tryAutoImport(postId: string): Promise<AutoImport> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(`https://pickax.com/post/${postId}`, {
      signal: ctrl.signal,
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "text/html" },
    });
  } catch {
    window.clearTimeout(timer);
    // Almost always a CORS block: the browser refuses to even read it.
    throw new AutoImportError("blocked");
  }
  window.clearTimeout(timer);

  if (res.status === 404) throw new AutoImportError("not-found");
  if (!res.ok) throw new AutoImportError("blocked");

  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = (property: string): string =>
    doc.querySelector(`meta[property="${property}"]`)?.getAttribute("content") ??
    "";

  // og:title looks like "Display Name posted".
  const displayName = meta("og:title")
    .replace(/\s+posted\s*$/i, "")
    .trim();
  const text = meta("og:description").trim();
  if (!displayName || !text) throw new AutoImportError("empty");
  return { displayName, text };
}
