/* Pickax Post to Image — background service worker.
 *
 * Toolbar button behavior:
 *  - On a Pickax post page (pickax.com/post/<id>): asks the content script
 *    for the extracted post and opens the web app with the data in the
 *    #import= URL hash, so the image is ready to generate.
 *  - Anywhere else: just opens the web app.
 *
 * No data is collected, stored, or transmitted by this extension itself.
 */
(function () {
  "use strict";

  var api = globalThis.browser || globalThis.chrome;
  var APP_URL = "https://masteringrumble.github.io/pickax-post-to-image/";
  var POST_RE = /^https:\/\/(www\.)?pickax\.com\/post\/\d+/;
  var EXTRACT_MSG = "pickax-post-to-image:extract";

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
