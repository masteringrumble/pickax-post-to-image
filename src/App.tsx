import { useRef, useState } from "react";
import { extractPostId, tryAutoImport, AutoImportError } from "./pickax";
import { renderPostImage } from "./renderer";
import type { LoadedImage, PostData } from "./types";
import "./styles.css";

type Stage = "url" | "loading" | "manual" | "preview";

const MAX_POST_IMAGES = 4;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-load"));
    };
    img.src = url;
  });
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image-load"));
    img.src = url.trim();
  });
}

function toLoaded(img: HTMLImageElement): LoadedImage {
  return { img, width: img.naturalWidth, height: img.naturalHeight };
}

export default function App() {
  const [stage, setStage] = useState<Stage>("url");
  const [url, setUrl] = useState("");
  const [postId, setPostId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // manual-entry fields
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [text, setText] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [reposts, setReposts] = useState("");
  const [views, setViews] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrlList, setImageUrlList] = useState<string[]>([]);

  const [previewUrl, setPreviewUrl] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  function resetAll() {
    setStage("url");
    setUrl("");
    setPostId("");
    setError("");
    setNotice("");
    setBusy(false);
    setDisplayName("");
    setUsername("");
    setText("");
    setTimestamp("");
    setLikes("");
    setComments("");
    setReposts("");
    setViews("");
    setAvatarFile(null);
    setImageFiles([]);
    setImageUrl("");
    setImageUrlList([]);
    setPreviewUrl("");
    canvasRef.current = null;
  }

  async function handleGenerateFromUrl() {
    setError("");
    setNotice("");
    const id = extractPostId(url);
    if (!id) {
      setError("Please enter a valid Pickax post URL.");
      return;
    }
    setPostId(id);
    setStage("loading");
    try {
      const auto = await tryAutoImport(id);
      // Automatic import worked: build the image straight away.
      const data: PostData = {
        postId: id,
        displayName: auto.displayName,
        username: "",
        avatar: null,
        text: auto.text,
        timestamp: "",
        images: [],
        engagement: {},
      };
      await renderAndPreview(data);
    } catch (e) {
      if (e instanceof AutoImportError && e.kind === "not-found") {
        setStage("url");
        setError("We couldn't find that Pickax post. Check the URL and try again.");
        return;
      }
      // Expected path: Pickax blocks direct browser access (CORS), so fall
      // back to manual entry. State the limitation plainly.
      setNotice(
        "This Pickax post couldn't be imported automatically. " +
          "Pickax blocks direct browser access to post pages, so automatic " +
          "import isn't possible. Enter the post details below exactly as " +
          "they appear on Pickax and we'll build the image from what you " +
          "provide — nothing is invented or filled in."
      );
      setStage("manual");
    }
  }

  async function renderAndPreview(data: PostData) {
    const canvas = await renderPostImage(data);
    canvasRef.current = canvas;
    setPreviewUrl(canvas.toDataURL("image/png"));
    setStage("preview");
  }

  async function handleGenerateFromManual() {
    setError("");
    setBusy(true);
    try {
      if (!text.trim()) {
        setError("Please paste the post text before generating the image.");
        setBusy(false);
        return;
      }

      let avatar: HTMLImageElement | null = null;
      if (avatarFile) {
        try {
          avatar = await loadImageFromFile(avatarFile);
        } catch {
          setNotice(
            (n) => n + (n ? " " : "") + "The avatar image couldn't be loaded, so a placeholder is used instead."
          );
        }
      }

      const images: LoadedImage[] = [];
      let imageFailed = false;
      for (const f of imageFiles.slice(0, MAX_POST_IMAGES)) {
        try {
          images.push(toLoaded(await loadImageFromFile(f)));
        } catch {
          imageFailed = true;
        }
      }
      for (const u of imageUrlList.slice(0, MAX_POST_IMAGES - images.length)) {
        try {
          images.push(toLoaded(await loadImageFromUrl(u)));
        } catch {
          imageFailed = true;
        }
      }
      if (imageFailed) {
        setNotice(
          (n) =>
            n +
            (n ? " " : "") +
            "The post was imported, but an attached image couldn't be loaded."
        );
      }

      const data: PostData = {
        postId,
        displayName: displayName.trim(),
        username: username.trim().replace(/^@+/, ""),
        avatar,
        text: text.replace(/\r\n/g, "\n"),
        timestamp: timestamp.trim(),
        images,
        engagement: {
          likes: likes.trim() || undefined,
          comments: comments.trim() || undefined,
          reposts: reposts.trim() || undefined,
          views: views.trim() || undefined,
        },
      };
      await renderAndPreview(data);
    } catch {
      setError("Something went wrong while generating the image. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Something went wrong while generating the image. Please try again.");
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pickax-post-${postId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
  }

  function addImageUrl() {
    const u = imageUrl.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      setError("Image URLs must start with http:// or https://.");
      return;
    }
    setError("");
    setImageUrlList((l) => [...l, u].slice(0, MAX_POST_IMAGES));
    setImageUrl("");
  }

  return (
    <div className="page">
      <main className="card-wrap">
        <header className="hero">
          <h1>Pickax Post to Image</h1>
          <p className="tagline">Turn a Pickax post into an image.</p>
        </header>

        {stage === "url" && (
          <section className="panel">
            <label className="field-label" htmlFor="pickax-url">
              Pickax post URL
            </label>
            <input
              id="pickax-url"
              className="text-input"
              type="url"
              inputMode="url"
              placeholder="https://pickax.com/post/707864"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGenerateFromUrl();
              }}
              autoFocus
            />
            {error && <p className="error">{error}</p>}
            <button className="btn primary" onClick={handleGenerateFromUrl}>
              Generate Image
            </button>
            <p className="hint">
              Only public posts. Nothing is posted, stored, or shared — the
              image is built right in your browser.
            </p>
          </section>
        )}

        {stage === "loading" && (
          <section className="panel center">
            <div className="spinner" aria-hidden="true" />
            <p className="muted">Trying to import the public post…</p>
          </section>
        )}

        {stage === "manual" && (
          <section className="panel">
            {notice && <p className="notice">{notice}</p>}
            {error && <p className="error">{error}</p>}

            <div className="grid-2">
              <div>
                <label className="field-label" htmlFor="display-name">
                  Display name
                </label>
                <input
                  id="display-name"
                  className="text-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="As shown on the post"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  className="text-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="@username"
                />
              </div>
            </div>

            <label className="field-label" htmlFor="post-text">
              Post text
            </label>
            <textarea
              id="post-text"
              className="text-input textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the post text exactly as it appears…"
              rows={6}
            />

            <label className="field-label" htmlFor="timestamp">
              Timestamp <span className="optional">(optional)</span>
            </label>
            <input
              id="timestamp"
              className="text-input"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              placeholder="e.g. Sep 19, 2026"
            />

            <div className="grid-4">
              <div>
                <label className="field-label" htmlFor="likes">
                  Likes
                </label>
                <input
                  id="likes"
                  className="text-input"
                  value={likes}
                  onChange={(e) => setLikes(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="comments">
                  Comments
                </label>
                <input
                  id="comments"
                  className="text-input"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="reposts">
                  Reposts
                </label>
                <input
                  id="reposts"
                  className="text-input"
                  value={reposts}
                  onChange={(e) => setReposts(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="views">
                  Views
                </label>
                <input
                  id="views"
                  className="text-input"
                  value={views}
                  onChange={(e) => setViews(e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>
            <p className="hint">
              Only fill in numbers you can actually see on the post — anything
              left blank is simply omitted from the image.
            </p>

            <label className="field-label" htmlFor="avatar">
              Profile picture <span className="optional">(optional)</span>
            </label>
            <input
              id="avatar"
              className="file-input"
              type="file"
              accept="image/*"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />

            <label className="field-label" htmlFor="post-images">
              Post images <span className="optional">(optional, up to {MAX_POST_IMAGES})</span>
            </label>
            <input
              id="post-images"
              className="file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) =>
                setImageFiles(Array.from(e.target.files ?? []).slice(0, MAX_POST_IMAGES))
              }
            />
            <div className="url-row">
              <input
                className="text-input"
                type="url"
                placeholder="…or paste an image URL and press Add"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addImageUrl();
                  }
                }}
              />
              <button className="btn" onClick={addImageUrl} type="button">
                Add
              </button>
            </div>
            {imageUrlList.length > 0 && (
              <ul className="url-list">
                {imageUrlList.map((u, i) => (
                  <li key={i}>
                    <span className="url-list-item">{u}</span>
                    <button
                      className="link-btn"
                      type="button"
                      onClick={() =>
                        setImageUrlList((l) => l.filter((_, j) => j !== i))
                      }
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="btn-row">
              <button
                className="btn primary"
                onClick={handleGenerateFromManual}
                disabled={busy}
              >
                {busy ? "Generating…" : "Generate Image"}
              </button>
              <button className="btn" onClick={resetAll} type="button">
                Back
              </button>
            </div>
          </section>
        )}

        {stage === "preview" && (
          <section className="panel">
            {notice && <p className="notice">{notice}</p>}
            {error && <p className="error">{error}</p>}
            <h2 className="preview-title">Generated Pickax Image</h2>
            {previewUrl && (
              <img
                className="preview-img"
                src={previewUrl}
                alt="Generated Pickax post graphic"
              />
            )}
            <div className="btn-row center">
              <button className="btn primary" onClick={handleDownload}>
                Download PNG
              </button>
              <button className="btn" onClick={resetAll}>
                Generate New
              </button>
            </div>
          </section>
        )}
      </main>
      <footer className="footer">
        <span>Personal-use utility. Not affiliated with Pickax.</span>
      </footer>
    </div>
  );
}
