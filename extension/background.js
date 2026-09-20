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
 *    PNG directly. Where the offscreen API is unavailable (Firefox, older
 *    Chromium), it opens a hidden extension tab (render.html) that renders
 *    and replies directly to the requesting tab — the worker keeps no
 *    state, so nothing is lost if the event page suspends mid-render.
 *    As a last resort it opens the web app with the post pre-filled.
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
  var PREVIEW_MSG = "pickax-post-to-image:preview";
  var OFFSCREEN_MSG = "pickax-post-to-image:render-offscreen";
  var nextReqId = 1;

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

  // No offscreen API (Firefox, older Chromium): open a hidden extension
  // tab that renders and replies DIRECTLY to the requesting content-script
  // tab. The worker keeps no state, so nothing is lost if the event page
  // suspends mid-render. Resolves { ok, viaTab, reqId } — the render tab's
  // reply arrives as a separate message to the requesting tab.
  function renderViaHiddenTab(payload, options, mode, replyToTab) {
    var reqId = nextReqId++;
    var url =
      api.runtime.getURL("render.html") +
      "#d=" +
      encodeURIComponent(
        JSON.stringify({
          payload: payload,
          options: options,
          mode: mode,
          reqId: reqId,
          replyToTab: replyToTab,
        })
      );
    return api.tabs.create({ url: url, active: false }).then(function () {
      return { ok: true, viaTab: true, reqId: reqId };
    });
  }

  // Render the extracted post in the offscreen document (with the user's
  // "Show in image" options). Returns the PNG data URL without downloading.
  async function renderViaOffscreen(payload, options) {
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
          return { ok: true, dataUrl: res.dataUrl, filename: res.filename };
        }
        return { ok: false, error: (res && res.error) || "render-failed" };
      } catch (e) {
        return { ok: false, error: "offscreen-failed" };
      }
    }
    return { ok: false, error: "offscreen-unavailable" };
  }

  // Full download flow. Without the offscreen API it goes through a hidden
  // render tab; as a last resort it opens the web app with the post.
  async function handleRender(payload, options, replyToTab, sendResponse) {
    var rendered = await renderViaOffscreen(payload, options);
    if (rendered.ok && rendered.dataUrl) {
      try {
        await api.downloads.download({
          url: rendered.dataUrl,
          filename: rendered.filename || "pickax-post.png",
          saveAs: false,
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: "download-failed" });
      }
      return;
    }
    if (rendered.error === "offscreen-unavailable" && replyToTab != null) {
      try {
        sendResponse(
          await renderViaHiddenTab(payload, options, "download", replyToTab)
        );
        return;
      } catch (e) {
        /* fall through to the web-app fallback */
      }
    }
    if (rendered.error === "offscreen-unavailable") {
      try {
        await openApp(payload);
        sendResponse({ ok: true, opened: true });
      } catch (e) {
        sendResponse({ ok: false, error: "open-failed" });
      }
      return;
    }
    sendResponse({ ok: false, error: rendered.error });
  }

  // Live preview flow. Without the offscreen API it goes through a hidden
  // render tab that replies directly to the requesting tab.
  async function handlePreview(payload, options, replyToTab, sendResponse) {
    var rendered = await renderViaOffscreen(payload, options);
    if (rendered.ok) {
      sendResponse({ ok: true, dataUrl: rendered.dataUrl });
      return;
    }
    if (rendered.error === "offscreen-unavailable" && replyToTab != null) {
      try {
        sendResponse(
          await renderViaHiddenTab(payload, options, "preview", replyToTab)
        );
        return;
      } catch (e) {
        /* fall through */
      }
    }
    sendResponse({ ok: false, error: rendered.error || "preview-failed" });
  }

  api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    var replyToTab =
      sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;
    if (msg && msg.type === RENDER_MSG) {
      handleRender(msg.payload, msg.options, replyToTab, sendResponse);
      return true; // async response
    }
    if (msg && msg.type === PREVIEW_MSG) {
      handlePreview(msg.payload, msg.options, replyToTab, sendResponse);
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
