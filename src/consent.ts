/**
 * Cookie consent: nothing third-party (Google Analytics, ShareThis, the
 * Buy Me a Coffee widget) loads until the visitor clicks Accept in the
 * banner. The choice is remembered in localStorage (`ppi-consent`).
 * Declining clears nothing because nothing was ever loaded.
 */

export type ConsentChoice = "accepted" | "declined";

const KEY = "ppi-consent";
const GA_ID = "G-E4975PF9T9";

export function getConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    // Storage unavailable (private mode etc.) — treat as undecided.
    return null;
  }
}

export function setConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    /* Banner simply shows again next visit. */
  }
}

function loadScript(
  src: string,
  attrs: Record<string, string> = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${CSS.escape(src)}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script-load"));
    document.body.appendChild(s);
  });
}

/** Load every third-party integration. Call only after consent. */
export async function enableThirdParties(): Promise<void> {
  const w = window as unknown as Record<string, unknown>;

  // Google Analytics 4.
  try {
    await loadScript(
      `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
    );
    const dl = ((w["dataLayer"] as unknown[]) ?? []) as unknown[];
    w["dataLayer"] = dl;
    w["gtag"] = (...args: unknown[]) => {
      dl.push(args);
    };
    (w["gtag"] as (...a: unknown[]) => void)("js", new Date());
    (w["gtag"] as (...a: unknown[]) => void)("config", GA_ID);
  } catch {
    /* Analytics is optional; the tool works without it. */
  }

  // ShareThis sticky share buttons (left side).
  try {
    await loadScript(
      "https://platform-api.sharethis.com/js/sharethis.js#property=6ab11bda4a0270b6dfa564c0&product=inline-share-buttons"
    );
  } catch {
    /* Share buttons are optional. */
  }

  // Buy Me a Coffee floating widget. Its script builds the button inside a
  // DOMContentLoaded listener — when we inject it after consent, that event
  // has long since fired, so the button never appears. Re-fire the event for
  // it (safe: ShareThis's ready-helper guards against double-firing and
  // nothing else on the page listens for DOMContentLoaded). If the document
  // is still loading, the real event is yet to come — leave it alone.
  try {
    await loadScript("https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js", {
      "data-name": "BMC-Widget",
      "data-cfasync": "false",
      "data-id": "masteringrumble",
      "data-description": "Support me on Buy me a coffee!",
      "data-message": "",
      "data-color": "#3eb1f9",
      "data-position": "Right",
      "data-x_margin": "18",
      "data-y_margin": "18",
    });
    if (
      !document.getElementById("bmc-wbtn") &&
      document.readyState !== "loading"
    ) {
      window.dispatchEvent(new Event("DOMContentLoaded"));
    }
  } catch {
    /* Donation widget is optional. */
  }
}
