// Instagram sharing backend for the pickax-post-to-image tool.
//
// The static site cannot hold the Meta app secret, so this module runs the
// OAuth dance and the Story publish calls server-side. Secrets live only as
// worker env vars (META_APP_ID / META_APP_SECRET), set in the Cloudflare
// dashboard — never in the repo.
//
// Flow:
//   1. Site opens GET /ig/auth/start?session=<sid> in a popup.
//      We 302 to instagram.com/oauth/authorize with a KV-backed state token.
//   2. Meta calls back GET /ig/auth/callback?code&state. We exchange the code
//      for a short-lived token, then a 60-day long-lived token, read the IG
//      user id/username, and store it all in KV under the session id.
//      The callback page postMessages "ig-connected" to the opener and closes.
//   3. To share, the site renders its PNG, POSTs the bytes to /ig/stage,
//      gets back a short-lived public URL, then POSTs /ig/publish
//      {session, stageId}. We create a STORIES media container from the staged
//      URL and publish it.
//
// Requirements on the user's side: a Meta developer app with the Instagram
// product, the callback URL registered as a Valid OAuth Redirect URI, and an
// Instagram Business or Creator account. Posting via the API is free.

export interface IgEnv {
  SHARE_KV: KVNamespace;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
}

const IG_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const IG_TOKEN_EXCHANGE = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";
const SCOPES = "instagram_business_basic,instagram_business_content_publish";
/** Instagram caps story images at 8 MB. */
const MAX_STAGE_BYTES = 8_000_000;
/** Staged PNGs and OAuth state tokens live 10 minutes. */
const STAGE_TTL = 600;

function randHex(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

function callbackPage(title: string, bodyHtml: string, ok: boolean): Response {
  const script = ok
    ? `<script>
         try { window.opener && window.opener.postMessage("ig-connected", "*"); } catch (e) {}
         setTimeout(function(){ window.close(); }, 900);
       </script>`
    : "";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;` +
      `align-items:center;justify-content:center;background:#0c101d;color:#e8ecf4;` +
      `margin:0;text-align:center;padding:24px}</style></head>` +
      `<body><div><h2>${title}</h2><p>${bodyHtml}</p></div>${script}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function callbackUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.origin}/ig/auth/callback`;
}

interface IgSession {
  token: string;
  igUserId: string;
  igUsername: string;
  obtainedAt: number;
}

async function getSession(env: IgEnv, sessionId: string | null): Promise<IgSession | null> {
  if (!sessionId) return null;
  const raw = await env.SHARE_KV.get("ig:session:" + sessionId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IgSession;
  } catch {
    return null;
  }
}

/** Step 1: redirect the popup to Instagram's OAuth page. */
export async function igAuthStart(req: Request, env: IgEnv): Promise<Response> {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    return json(
      {
        error: "not-configured",
        hint: "Set META_APP_ID and META_APP_SECRET as worker secrets, then reconnect.",
      },
      500
    );
  }
  const session = new URL(req.url).searchParams.get("session") || randHex(12);
  const state = randHex(24);
  await env.SHARE_KV.put("ig:state:" + state, session, { expirationTtl: STAGE_TTL });
  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: callbackUrl(req),
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return Response.redirect(`${IG_AUTHORIZE}?${params.toString()}`, 302);
}

/** Step 2: Meta calls back here with the auth code. */
export async function igAuthCallback(req: Request, env: IgEnv): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const session = state ? await env.SHARE_KV.get("ig:state:" + state) : null;
  if (state) await env.SHARE_KV.delete("ig:state:" + state);
  if (!code || !state || !session) {
    return callbackPage("Connection failed", "Missing code or session — please close this and try again.", false);
  }

  // Code -> short-lived token (needs the app secret, server-side only).
  let tok: { access_token?: string; error_message?: string; error_type?: string };
  try {
    const form = new URLSearchParams({
      client_id: env.META_APP_ID ?? "",
      client_secret: env.META_APP_SECRET ?? "",
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(req),
      code,
    });
    const r = await fetch(IG_TOKEN_EXCHANGE, { method: "POST", body: form });
    tok = (await r.json()) as typeof tok;
  } catch {
    return callbackPage("Connection failed", "Could not reach Instagram's token endpoint.", false);
  }
  if (!tok.access_token) {
    return callbackPage(
      "Instagram refused the login",
      `(${tok.error_type || "unknown"}: ${tok.error_message || "no detail"}) ` +
        "Check the app's redirect URI and that your account is Business/Creator.",
      false
    );
  }

  // Short-lived -> 60-day long-lived token.
  const llUrl =
    `${GRAPH}/access_token?grant_type=ig_exchange_token` +
    `&client_secret=${encodeURIComponent(env.META_APP_SECRET ?? "")}` +
    `&access_token=${encodeURIComponent(tok.access_token)}`;
  let ll: { access_token?: string };
  try {
    ll = (await (await fetch(llUrl)).json()) as typeof ll;
  } catch {
    return callbackPage("Connection failed", "Could not get a long-lived token from Instagram.", false);
  }
  if (!ll.access_token) {
    return callbackPage("Connection failed", "Instagram did not issue a long-lived token.", false);
  }

  const me = (await (
    await fetch(`${GRAPH}/me?fields=id,username&access_token=${encodeURIComponent(ll.access_token)}`)
  ).json()) as { id?: string; username?: string };
  if (!me.id) {
    return callbackPage("Connection failed", "Could not read your Instagram profile.", false);
  }

  const sess: IgSession = {
    token: ll.access_token,
    igUserId: me.id,
    igUsername: me.username ?? "",
    obtainedAt: Date.now(),
  };
  await env.SHARE_KV.put("ig:session:" + session, JSON.stringify(sess));
  return callbackPage(
    `Connected as @${sess.igUsername}`,
    "You're all set — this window will close itself.",
    true
  );
}

/** Is this browser session connected, and to whom? */
export async function igStatus(req: Request, env: IgEnv): Promise<Response> {
  const session = new URL(req.url).searchParams.get("session");
  const s = await getSession(env, session);
  if (!s) return json({ connected: false });
  return json({ connected: true, igUsername: s.igUsername });
}

/** Disconnect: drop the stored token. */
export async function igDisconnect(req: Request, env: IgEnv): Promise<Response> {
  const session = new URL(req.url).searchParams.get("session");
  if (session) await env.SHARE_KV.delete("ig:session:" + session);
  return json({ ok: true });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Stage the rendered PNG so Instagram can fetch it. The Graph API's container
 * creation takes a public image_url, not bytes — so we hold the PNG in KV
 * for 10 minutes behind a bearer URL and hand Meta that URL.
 */
export async function igStage(req: Request, env: IgEnv): Promise<Response> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) {
    return json({ error: "expected-image", hint: "POST PNG bytes with Content-Type: image/png" }, 400);
  }
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return json({ error: "empty-image" }, 400);
  if (buf.byteLength > MAX_STAGE_BYTES) {
    return json({ error: "too-large", hint: "Instagram caps story images at 8 MB" }, 400);
  }
  const id = randHex(16);
  await env.SHARE_KV.put("ig:stage:" + id, buf, { expirationTtl: STAGE_TTL });
  const u = new URL(req.url);
  return json({ id, url: `${u.origin}/ig/stage/${id}` });
}

/** Serve a staged PNG publicly (bearer URL, 10-minute life). */
export async function igStageGet(env: IgEnv, id: string): Promise<Response> {
  const buf = await env.SHARE_KV.get("ig:stage:" + id, "arrayBuffer");
  if (!buf) return new Response("expired", { status: 404 });
  return new Response(buf, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** Create the STORIES container and publish it. Body: {session, stageId}. */
export async function igPublish(req: Request, env: IgEnv): Promise<Response> {
  let body: { session?: string; stageId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "bad-request" }, 400);
  }
  const s = await getSession(env, body.session ?? null);
  if (!s) return json({ error: "not-connected", hint: "Connect Instagram first" }, 401);

  // Long-lived tokens last 60 days; refresh lazily past day 50.
  if (Date.now() - s.obtainedAt > 50 * 86400_000) {
    try {
      const r = (await (
        await fetch(
          `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(s.token)}`
        )
      ).json()) as { access_token?: string };
      if (r.access_token && body.session) {
        s.token = r.access_token;
        s.obtainedAt = Date.now();
        await env.SHARE_KV.put("ig:session:" + body.session, JSON.stringify(s));
      }
    } catch {
      /* keep the old token; the publish attempt below will surface problems */
    }
  }

  const staged = await env.SHARE_KV.get("ig:stage:" + (body.stageId ?? ""), "arrayBuffer");
  if (!staged) {
    return json({ error: "stage-expired", hint: "The staged image expired — share again" }, 400);
  }
  const u = new URL(req.url);
  const imageUrl = `${u.origin}/ig/stage/${body.stageId}`;

  // 1. Create the media container.
  const cParams = new URLSearchParams({
    image_url: imageUrl,
    media_type: "STORIES",
    access_token: s.token,
  });
  let container: { id?: string; error?: { message?: string } };
  try {
    container = (await (await fetch(`${GRAPH}/${s.igUserId}/media`, { method: "POST", body: cParams })).json()) as typeof container;
  } catch {
    return json({ error: "container-failed", detail: "Could not reach Instagram" }, 502);
  }
  if (!container.id) {
    return json({ error: "container-failed", detail: container.error?.message || "Instagram rejected the image" }, 502);
  }

  // 2. Wait for processing (images are usually instant, cap the wait).
  let statusCode = "";
  for (let i = 0; i < 8; i++) {
    try {
      const st = (await (
        await fetch(`${GRAPH}/${container.id}?fields=status_code&access_token=${encodeURIComponent(s.token)}`)
      ).json()) as { status_code?: string };
      statusCode = st.status_code || "";
    } catch {
      break;
    }
    if (statusCode === "FINISHED" || statusCode === "ERROR") break;
    await sleep(2000);
  }
  if (statusCode === "ERROR") {
    return json({ error: "media-error", detail: "Instagram could not process the image" }, 502);
  }
  if (statusCode !== "FINISHED") {
    return json({ error: "not-ready", hint: "Instagram is still processing the image — try again in a few seconds" }, 504);
  }

  // 3. Publish.
  const pParams = new URLSearchParams({ creation_id: container.id, access_token: s.token });
  let pub: { id?: string; error?: { message?: string } };
  try {
    pub = (await (await fetch(`${GRAPH}/${s.igUserId}/media_publish`, { method: "POST", body: pParams })).json()) as typeof pub;
  } catch {
    return json({ error: "publish-failed", detail: "Could not reach Instagram" }, 502);
  }
  if (!pub.id) {
    return json({ error: "publish-failed", detail: pub.error?.message || "Instagram refused to publish" }, 502);
  }

  await env.SHARE_KV.delete("ig:stage:" + body.stageId);
  return json({ ok: true, igUsername: s.igUsername, mediaId: pub.id });
}
