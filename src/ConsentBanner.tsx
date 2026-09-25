import { useEffect, useState } from "react";
import {
  enableThirdParties,
  getConsent,
  setConsent,
  type ConsentChoice,
} from "./consent";

/**
 * GDPR-style cookie banner. Non-modal: the tool stays fully usable whether
 * the visitor answers or ignores it. Accept loads GA + ShareThis + the BMC
 * widget; Decline loads none of them. The choice persists in localStorage.
 */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const existing = getConsent();
    if (existing === "accepted") {
      void enableThirdParties();
      return;
    }
    if (existing === null) {
      // Brief delay so the banner doesn't flash over first paint.
      const t = window.setTimeout(() => setVisible(true), 900);
      return () => window.clearTimeout(t);
    }
  }, []);

  function choose(choice: ConsentChoice) {
    setConsent(choice);
    setVisible(false);
    if (choice === "accepted") void enableThirdParties();
  }

  if (!visible) return null;

  return (
    <div
      className="consent-banner"
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
    >
      <div className="consent-inner">
        <p id="consent-title" className="consent-title">
          Cookies — your call
        </p>
        <p className="consent-text">
          We use cookies for anonymous analytics and for the share buttons
          and donation widget. Nothing third-party loads until you choose.{" "}
          <a href="./privacy.html">Privacy Policy</a>
        </p>
        <div className="consent-actions">
          <button
            type="button"
            className="btn primary consent-btn"
            onClick={() => choose("accepted")}
          >
            Accept
          </button>
          <button
            type="button"
            className="btn consent-btn"
            onClick={() => choose("declined")}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
