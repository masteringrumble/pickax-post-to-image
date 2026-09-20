/* Pickax Post to Image — background service worker.
 *
 * Two flows:
 *
 * 1. Element picker (v1.2+): clicking the toolbar button on any Pickax
 *    page puts the tab in picker mode (uBlock Origin style) — the user
 *    hovers a post card to highlight it and clicks it. The content script
 *    extracts that post and sends it here; the worker opens the web app
 *    with the post pre-filled, so people get the same options as the
 *    website (image toggles, site embed, etc.).
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
  var OPEN_APP_MSG = "pickax-post-to-image:open-app";

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

  api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === OPEN_APP_MSG) {
      openApp(msg.payload).then(
        function () {
          sendResponse({ ok: true });
        },
        function () {
          sendResponse({ ok: false });
        }
      );
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
