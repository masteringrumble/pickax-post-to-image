// Pickax Post to Image — hidden-tab render driver.
//
// Used where the offscreen API is unavailable (Firefox, older Chromium).
// The background opens render.html in a hidden tab with the render request
// in the URL hash. This page renders the PNG with the same renderer as the
// web app, then:
//   - download mode: saves the PNG via chrome.downloads and notifies the
//     requesting tab,
//   - preview mode: sends the PNG data URL back to the requesting tab.
// It then closes its own tab. The background keeps no state, so nothing
// is lost if the event page suspends mid-render.
import {
  renderPayloadToDataUrl,
  type ExtractedPayload,
} from "./prepare";
import type { RenderOptions } from "../../src/types";

const PREVIEW_TAB_RESULT = "pickax-post-to-image:preview-tab-result";
const RENDER_TAB_DONE = "pickax-post-to-image:render-tab-done";

interface RenderRequest {
  payload: ExtractedPayload;
  options?: RenderOptions;
  mode: "download" | "preview";
  reqId: number;
  replyToTab: number;
}

function api(): any {
  return (globalThis as any).browser || (globalThis as any).chrome;
}

function parseRequest(): RenderRequest | null {
  const m = /^#d=(.*)$/.exec(location.hash || "");
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1])) as RenderRequest;
  } catch {
    return null;
  }
}

async function closeOwnTab(): Promise<void> {
  try {
    const a = api();
    const tab = await a.tabs.getCurrent();
    if (tab && tab.id != null) await a.tabs.remove(tab.id);
  } catch {
    /* the tab may already be gone */
  }
}

async function notify(
  req: RenderRequest,
  msg: Record<string, unknown>
): Promise<void> {
  try {
    await api().tabs.sendMessage(req.replyToTab, msg);
  } catch {
    /* the requesting tab may be gone */
  }
}

async function main(): Promise<void> {
  const req = parseRequest();
  if (!req || !req.payload || !req.payload.postId) {
    await closeOwnTab();
    return;
  }
  const a = api();
  try {
    const { dataUrl, filename } = await renderPayloadToDataUrl(
      req.payload,
      req.options
    );
    if (req.mode === "preview") {
      await notify(req, {
        type: PREVIEW_TAB_RESULT,
        reqId: req.reqId,
        ok: true,
        dataUrl,
      });
    } else {
      await a.downloads.download({ url: dataUrl, filename, saveAs: false });
      await notify(req, {
        type: RENDER_TAB_DONE,
        reqId: req.reqId,
        ok: true,
      });
    }
  } catch (e) {
    await notify(req, {
      type: req.mode === "preview" ? PREVIEW_TAB_RESULT : RENDER_TAB_DONE,
      reqId: req.reqId,
      ok: false,
      error: e instanceof Error ? e.message : "render-failed",
    });
  }
  await closeOwnTab();
}

main();
