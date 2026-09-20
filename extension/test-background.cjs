/* Smoke test for extension/background.js: verifies the render routing —
 * offscreen document where available (Chromium), hidden render.html tab
 * where it isn't (Firefox / older Chromium), web-app fallback as a last
 * resort. Run: node extension/test-background.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bgSrc = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");

function loadBackground(chromeStub) {
  delete globalThis.browser;
  globalThis.chrome = chromeStub;
  let msgListener = null;
  let actionListener = null;
  chromeStub.runtime.onMessage = {
    addListener: (fn) => {
      msgListener = fn;
    },
  };
  chromeStub.action = {
    onClicked: { addListener: (fn) => (actionListener = fn) },
  };
  eval(bgSrc);
  return {
    send: (msg, sender) =>
      new Promise((resolve) => {
        const r = msgListener(msg, sender || {}, resolve);
        assert.equal(r, true, "async response expected");
      }),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

(async () => {
  // 1. No offscreen API (Firefox): download goes through a hidden tab.
  {
    const created = [];
    const bg = loadBackground({
      runtime: { getURL: (p) => "chrome-extension://fakeid/" + p },
      tabs: {
        create: (opts) => {
          created.push(opts);
          return Promise.resolve({ id: 99 });
        },
      },
      downloads: {
        download: () => {
          throw new Error("should not download directly here");
        },
      },
    });
    const res = await bg.send(
      {
        type: "pickax-post-to-image:render",
        payload: { postId: "111111", text: "hi" },
        options: { showMedia: false },
      },
      { tab: { id: 42 } }
    );
    assert.equal(created.length, 1, "one hidden tab created");
    assert.equal(created[0].active, false, "tab is hidden");
    assert.ok(
      created[0].url.startsWith("chrome-extension://fakeid/render.html#d="),
      "render.html with payload in the hash"
    );
    const req = JSON.parse(
      decodeURIComponent(created[0].url.split("#d=")[1])
    );
    assert.equal(req.mode, "download", "download mode");
    assert.equal(req.replyToTab, 42, "replies to the requesting tab");
    assert.equal(req.payload.postId, "111111", "payload survives");
    assert.deepEqual(req.options, { showMedia: false }, "options survive");
    assert.ok(res.ok && res.viaTab, "viaTab response");
    assert.equal(typeof res.reqId, "number", "reqId for the tab reply");
    console.log("ok  background: hidden-tab fallback for downloads");
  }

  // 2. No offscreen API: preview also goes through a hidden tab.
  {
    const created = [];
    const bg = loadBackground({
      runtime: { getURL: (p) => "chrome-extension://fakeid/" + p },
      tabs: {
        create: (opts) => {
          created.push(opts);
          return Promise.resolve({ id: 100 });
        },
      },
      downloads: { download: () => Promise.resolve(1) },
    });
    const res = await bg.send(
      {
        type: "pickax-post-to-image:preview",
        payload: { postId: "222222" },
        options: {},
      },
      { tab: { id: 7 } }
    );
    assert.equal(created.length, 1);
    const req = JSON.parse(
      decodeURIComponent(created[0].url.split("#d=")[1])
    );
    assert.equal(req.mode, "preview", "preview mode");
    assert.equal(req.replyToTab, 7);
    assert.ok(res.ok && res.viaTab, "viaTab preview response");
    console.log("ok  background: hidden-tab fallback for previews");
  }

  // 3. No offscreen API and tabs.create fails: last resort opens the app.
  {
    const created = [];
    let calls = 0;
    const bg = loadBackground({
      runtime: { getURL: (p) => "chrome-extension://fakeid/" + p },
      tabs: {
        create: (opts) => {
          calls += 1;
          created.push(opts);
          return calls === 1
            ? Promise.reject(new Error("nope"))
            : Promise.resolve({ id: 5 });
        },
      },
      downloads: { download: () => Promise.resolve(1) },
    });
    const res = await bg.send(
      {
        type: "pickax-post-to-image:render",
        payload: { postId: "333333" },
        options: {},
      },
      { tab: { id: 9 } }
    );
    assert.equal(created.length, 2, "hidden tab tried, then the web app");
    assert.ok(
      created[1].url.startsWith("https://pickax2image.top/#import="),
      "web app opened with the payload"
    );
    assert.deepEqual(res, { ok: true, opened: true });
    console.log("ok  background: web-app fallback when tabs fail");
  }

  // 4. Offscreen API present (Chromium): direct render + download.
  {
    const downloaded = [];
    const bg = loadBackground({
      runtime: {
        getURL: (p) => "chrome-extension://fakeid/" + p,
        sendMessage: (msg) => {
          assert.equal(msg.type, "pickax-post-to-image:render-offscreen");
          return Promise.resolve({
            ok: true,
            dataUrl: "data:image/png;base64,XYZ",
            filename: "pickax-post-1.png",
          });
        },
      },
      offscreen: {
        hasDocument: () => Promise.resolve(true),
        createDocument: () => Promise.resolve(),
      },
      tabs: {
        create: () => {
          throw new Error("no tab should be created on the offscreen path");
        },
      },
      downloads: {
        download: (o) => {
          downloaded.push(o);
          return Promise.resolve(1);
        },
      },
    });
    const res = await bg.send(
      {
        type: "pickax-post-to-image:render",
        payload: { postId: "1" },
        options: {},
      },
      { tab: { id: 3 } }
    );
    assert.deepEqual(res, { ok: true });
    assert.equal(downloaded.length, 1);
    assert.equal(downloaded[0].url, "data:image/png;base64,XYZ");
    assert.equal(downloaded[0].filename, "pickax-post-1.png");
    console.log("ok  background: offscreen render + download (Chromium)");
  }

  console.log("ALL BACKGROUND TESTS PASSED");
  await tick();
})().catch((e) => {
  console.error("BACKGROUND TEST FAILURE:", e);
  process.exit(1);
});
