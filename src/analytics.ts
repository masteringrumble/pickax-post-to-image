// Google Analytics 4 event tracking for button clicks/taps.
//
// gtag only exists after the visitor accepts the cookie banner (see
// consent.ts), so every call here is a silent no-op for visitors who
// declined or haven't chosen yet — nothing ever fires before consent.
// Analytics must never break the tool, so failures are swallowed.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(
  name: string,
  params: Record<string, string | number | boolean> = {}
): void {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
  } catch {
    // Analytics must never break the tool.
  }
}
