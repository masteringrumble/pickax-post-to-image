/* Pickax Post to Image — background service worker.
 *
 * Two flows:
 *
 * 1. One-click images (new in v1.1): the content script's per-post "Image"
 *    buttons send an extracted post here. The worker renders it in a hidden
 *    offscreen document (real DOM + canvas + webfonts, same renderer as the
 *    web app) and downloads the PNG directly — no website visit needed.
 *    Where the offscreen API is unavailable, it falls back to opening the
 *    web app with the post pre-filled (the v1.0 behavior).
 * 2. Toolbar button: on a Pickax post page, extracts the post and opens the
 *    web app with the data in the #import= URL hash; anywhere else it just
 *    opens the web app.
 *
 * No data is collected, stored, or transmitted by this extension itself.
 */
(function () {
  "use strict";

  var api = globalThis.browser || globalThis.chrome;
  var APP_URL = "https://pickax2image.top/";
  var POST_RE = /^https:\/\/(www\.)?pickax\.com\/post\/\d+/;
  var EXTRACT_MSG = "pickax-post-to-image:extract";
  var RENDER_MSG = "pickax-post-to-image:render";
  var OFFSCREEN_MSG = "pickax-post-to-image:render-offscreen";

  function openApp(payload) {
    var url = APP_URL;
    if (payload && payload.postId) {
      url += "#import=" + encodeURIComponent(JSON.stringify(payload));
    }
    return api.tabs.create({ url: url });
  }

  async function extractFromTab(tabId) {
    try {
      var payload = await api.tabs.sendMessage(tabId, { type: EXTRACT_MSG });
      if (payload && payload.postId) return payload;
    } catch (e) {
      /* content script not listening — fall through to inject it */
    }
    // The tab was open before the extension was installed (or navigation
    // raced the content script): inject now, then ask again.
    await api.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"],
    });
    var retry = await api.tabs.sendMessage(tabId, { type: EXTRACT_MSG });
    return retry && retry.postId ? retry : null;
  }

  // Render the extracted post in the offscreen document and download the
  // PNG. Falls back to opening the web app when the offscreen API is
  // unavailable (older browsers).
  async function renderToDownload(payload) {
    if (api.offscreen && api.offscreen.createDocument) {
      try {
        var exists = false;
        try {
          exists = await api.offscreen.hasDocument();
        } catch (e) {
          exists = false;
        }
        if (!exists) {
          await api.offscreen.createDocument({
            url: "offscreen.html",
            reasons: ["DOM_SCRAPING"],
            justification:
              "Render the Pickax post image on an offscreen canvas",
          });
        }
        var res = await api.runtime.sendMessage({
          type: OFFSCREEN_MSG,
          payload: payload,
        });
        if (res && res.ok && res.dataUrl) {
          await api.downloads.download({
            url: res.dataUrl,
            filename: res.filename || "pickax-post.png",
            saveAs: false,
          });
          return { ok: true };
        }
        return { ok: false, error: (res && res.error) || "render-failed" };
      } catch (e) {
        return { ok: false, error: "offscreen-failed" };
      }
    }
    await openApp(payload);
    return { ok: true, opened: true };
  }

  api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === RENDER_MSG) {
      renderToDownload(msg.payload).then(sendResponse);
      return true; // async response
    }
    return undefined;
  });

  api.action.onClicked.addListener(async function (tab) {
    try {
      if (tab && tab.id != null && POST_RE.test(tab.url || "")) {
        var payload = await extractFromTab(tab.id);
        if (payload) {
          await openApp(payload);
          return;
        }
      }
    } catch (e) {
      /* fall through to a plain app open */
    }
    await openApp(null);
  });
})();
