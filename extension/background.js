/* Pickax Post to Image — background service worker.
 *
 * Two flows:
 *
 * 1. Element picker (v1.2+): clicking the toolbar button on any Pickax
 *    page puts the tab in picker mode (uBlock Origin style) — the user
 *    hovers a post card to highlight it and clicks it. The content script
 *    shows an options panel right on the page (same "Show in image"
 *    toggles as the website); on Download it sends the post + options
 *    here. The worker renders it in a hidden offscreen document (real DOM
 *    + canvas + webfonts, same renderer as the web app) and downloads the
 *    PNG directly. Where the offscreen API is unavailable, it falls back
 *    to opening the web app with the post pre-filled.
 * 2. Toolbar button anywhere else: just opens the web app.
 *
 * No data is collected, stored, or transmitted by this extension itself.
 */
(function () {
  "use strict";

  var api = globalThis.browser || globalThis.chrome;
  var APP_URL = "https://pickax2image.top/";
  var PICKAX_RE = /^https:\/\/(www\.)?pickax\.com\//;
  var PICK_MSG = "pickax-post-to-image:pick";
  var RENDER_MSG = "pickax-post-to-image:render";
  var OFFSCREEN_MSG = "pickax-post-to-image:render-offscreen";

  function openApp(payload) {
    var url = APP_URL;
    if (payload && payload.postId) {
      url += "#import=" + encodeURIComponent(JSON.stringify(payload));
    }
    return api.tabs.create({ url: url });
  }

  // Tell the tab's content script to enter picker mode. The tab may have
  // been open before the extension was installed (or navigation raced the
  // content script): inject now, then ask again.
  async function startPickerInTab(tabId) {
    try {
      await api.tabs.sendMessage(tabId, { type: PICK_MSG });
      return;
    } catch (e) {
      /* content script not listening — fall through to inject it */
    }
    await api.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"],
    });
    await api.tabs.sendMessage(tabId, { type: PICK_MSG });
  }

  // Render the extracted post in the offscreen document (with the user's
  // "Show in image" options) and download the PNG. Falls back to opening
  // the web app when the offscreen API is unavailable (older browsers).
  async function renderToDownload(payload, options) {
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
          options: options,
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
      renderToDownload(msg.payload, msg.options).then(sendResponse);
      return true; // async response
    }
    return undefined;
  });

  api.action.onClicked.addListener(async function (tab) {
    try {
      if (tab && tab.id != null && PICKAX_RE.test(tab.url || "")) {
        await startPickerInTab(tab.id);
        return;
      }
    } catch (e) {
      /* fall through to a plain app open */
    }
    await openApp(null);
  });
})();
