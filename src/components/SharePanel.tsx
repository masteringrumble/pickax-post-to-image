import { useCallback, useEffect, useRef, useState } from "react";
import { WORKER_BASE } from "../api";

/**
 * Share the rendered PNG to Instagram Stories via the worker backend
 * (OAuth + Graph API content publishing). The PNG is staged on the worker
 * for a few minutes so Instagram can fetch it, then deleted.
 */
export default function SharePanel({ getPngBlob }: { getPngBlob: () => Promise<Blob | null> }) {
  const [session] = useState(() => {
    let sid = "";
    try {
      sid = localStorage.getItem("pp2i_ig_session") || "";
      if (!sid) {
        sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + Math.random().toString(36).slice(2);
        localStorage.setItem("pp2i_ig_session", sid);
      }
    } catch {
      sid = String(Date.now());
    }
    return sid;
  });
  const [connected, setConnected] = useState<boolean | null>(null);
  const [igUser, setIgUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [msg, setMsg] = useState("");
  const popupRef = useRef<Window | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch(`${WORKER_BASE}/ig/status?session=${encodeURIComponent(session)}`);
      const j = await r.json();
      setConnected(!!j.connected);
      setIgUser(j.igUsername ? String(j.igUsername) : "");
    } catch {
      setConnected(false);
    }
  }, [session]);

  useEffect(() => {
    refreshStatus();
    const onMsg = (e: MessageEvent) => {
      if (e.data === "ig-connected") {
        try { popupRef.current?.close(); } catch { /* noop */ }
        setMsg("");
        refreshStatus();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [refreshStatus]);

  function connect() {
    setMsg("");
    popupRef.current = window.open(
      `${WORKER_BASE}/ig/auth/start?session=${encodeURIComponent(session)}`,
      "pp2i-ig-connect",
      "width=560,height=720"
    );
    if (!popupRef.current) setMsg("Pop-up blocked — allow pop-ups for this site, then try again.");
  }

  async function disconnect() {
    setMsg("");
    try {
      await fetch(`${WORKER_BASE}/ig/disconnect?session=${encodeURIComponent(session)}`);
    } catch { /* noop */ }
    setConnected(false);
    setIgUser("");
  }

  async function share() {
    setMsg("");
    setBusy(true);
    try {
      setStep("Preparing image…");
      const blob = await getPngBlob();
      if (!blob) throw new Error("Could not render the image. Try downloading it first.");

      setStep("Uploading…");
      const up = await fetch(`${WORKER_BASE}/ig/stage`, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: blob,
      });
      const staged = await up.json();
      if (!up.ok || !staged.id) {
        throw new Error(
          staged.error === "not-configured" || staged.error === "expected-image"
            ? "Instagram sharing isn't set up on the server yet."
            : staged.hint || staged.detail || "Upload failed."
        );
      }

      setStep("Posting to your story…");
      const pub = await fetch(`${WORKER_BASE}/ig/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, stageId: staged.id }),
      });
      const res = await pub.json();
      if (!pub.ok || !res.ok) {
        if (res.error === "not-connected") {
          setConnected(false);
          throw new Error("Instagram disconnected — connect again and retry.");
        }
        throw new Error(res.hint || res.detail || "Instagram refused to publish.");
      }
      setStep("");
      setMsg(`Posted to @${res.igUsername}'s story!`);
    } catch (e) {
      setStep("");
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-panel">
      {connected ? (
        <>
          <button className="btn" onClick={share} disabled={busy}>
            {busy ? step || "Working…" : "Share to Instagram Story"}
          </button>
          <span className="share-meta">
            @{igUser} ·{" "}
            <button type="button" className="linklike" onClick={disconnect} disabled={busy}>
              disconnect
            </button>
          </span>
        </>
      ) : (
        <button className="btn" onClick={connect} disabled={connected === null}>
          Connect Instagram
        </button>
      )}
      {msg && <p className={msg.startsWith("Posted") ? "notice" : "error"}>{msg}</p>}
      {connected && !msg && !busy && (
        <p className="share-hint">Posts the image above straight to your Instagram Story.</p>
      )}
    </div>
  );
}
