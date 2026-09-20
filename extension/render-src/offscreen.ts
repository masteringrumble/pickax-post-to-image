// Pickax Post to Image — offscreen document script.
//
// Runs inside the extension's offscreen document (a hidden page with a real
// DOM, canvas, and document.fonts). The background service worker sends it
// an extracted post payload; it renders the image with the same renderer the
// web app uses and replies with a PNG data URL for the worker to download.
import {
  renderPayloadToDataUrl,
  type ExtractedPayload,
} from "./prepare";
import type { RenderOptions } from "../../src/types";

const RENDER_MSG = "pickax-post-to-image:render-offscreen";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== RENDER_MSG) return undefined;
  (async () => {
    try {
      const payload = msg.payload as ExtractedPayload;
      if (!payload || !payload.postId) {
        sendResponse({ ok: false, error: "empty-payload" });
        return;
      }
      const { dataUrl, filename } = await renderPayloadToDataUrl(
        payload,
        msg.options as RenderOptions | undefined
      );
      sendResponse({ ok: true, dataUrl, filename });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : "render-failed",
      });
    }
  })();
  return true; // async response
});
