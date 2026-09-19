import { useEffect, useRef, useState } from "react";
import { extractPostId } from "./pickax";
import {
  fetchPostFromWorker,
  workerConfigured,
  workerErrorMessage,
  type WorkerPostPayload,
} from "./api";
import {
  BOOKMARKLET,
  clearImportHash,
  parseImportHash,
  parsePostHtml,
  prettyTimestamp,
  ImportParseError,
  type ParsedImport,
} from "./importHtml";
import { renderPostImage } from "./renderer";
import {
  DEFAULT_RENDER_OPTIONS,
  type LoadedImage,
  type PostData,
  type RenderOptions,
  type VerifiedBadge,
} from "./types";
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

/** Turn a worker payload into renderer data, loading remote images. */
async function postDataFromWorker(
  p: WorkerPostPayload
): Promise<{ data: PostData; notice: string }> {
  let avatar: HTMLImageElement | null = null;
  let avatarFailed = false;
  if (p.avatarUrl) {
    try {
      avatar = await loadImageFromUrl(p.avatarUrl);
    } catch {
      avatarFailed = true;
    }
  }

  const images: LoadedImage[] = [];
  let imageFailed = false;
  for (const u of (p.images ?? []).slice(0, MAX_POST_IMAGES)) {
    try {
      images.push(toLoaded(await loadImageFromUrl(u)));
    } catch {
      imageFailed = true;
    }
  }

  let notice = "Imported straight from the Pickax post. Give it a quick look before downloading.";
  if (avatarFailed)
    notice += " The profile picture couldn't be loaded, so a placeholder is used instead.";
  if (imageFailed)
    notice += " An attached image couldn't be loaded, so it was left out.";

  let videoThumb: LoadedImage | null = null;
  if (p.video?.thumbnail) {
    try {
      videoThumb = toLoaded(await loadImageFromUrl(p.video.thumbnail));
    } catch {
      /* fall back to the placeholder player */
    }
  }

  const data: PostData = {
    postId: p.postId,
    displayName: p.displayName ?? "",
    username: (p.username ?? "").replace(/^@+/, ""),
    verified: p.verified ?? null,
    avatar,
    text: (p.text ?? "").replace(/\r\n/g, "\n"),
    timestamp: p.timeAgo || p.timestamp || "",
    images,
    engagement: {
      picks: p.picks ?? undefined,
      axes: p.axes ?? undefined,
      views: p.views ?? undefined,
    },
    video: p.video
      ? { src: p.video.src, title: p.video.title, thumbnail: videoThumb }
      : null,
  };
  return { data, notice };
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
  const [picks, setPicks] = useState("");
  const [axes, setAxes] = useState("");
  const [views, setViews] = useState("");
  // The account's verification state, as the account actually has it.
  // Never a toggle: gold/blue when the account has that badge, null when none.
  const [verified, setVerified] = useState<VerifiedBadge>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrlList, setImageUrlList] = useState<string[]>([]);

  const [previewUrl, setPreviewUrl] = useState("");
  const [options, setOptions] = useState<RenderOptions>(DEFAULT_RENDER_OPTIONS);
  const [htmlSource, setHtmlSource] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<PostData | null>(null);

  // One-click import: the bookmarklet opens the app with #import=<data>.
  useEffect(() => {
    const imported = parseImportHash();
    if (!imported) return;
    clearImportHash();
    void importParsed(imported, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setPicks("");
    setAxes("");
    setViews("");
    setVerified(null);
    setAvatarFile(null);
    setImageFiles([]);
    setImageUrl("");
    setImageUrlList([]);
    setPreviewUrl("");
    setOptions(DEFAULT_RENDER_OPTIONS);
    setHtmlSource("");
    canvasRef.current = null;
    dataRef.current = null;
  }

  async function renderAndPreview(
    data: PostData,
    opts: RenderOptions = DEFAULT_RENDER_OPTIONS
  ) {
    dataRef.current = data;
    setOptions(opts);
    const canvas = await renderPostImage(data, opts);
    canvasRef.current = canvas;
    setPreviewUrl(canvas.toDataURL("image/png"));
    setStage("preview");
  }

  async function handleToggleChange(next: RenderOptions) {
    setOptions(next);
    const data = dataRef.current;
    if (!data) return;
    try {
      const canvas = await renderPostImage(data, next);
      canvasRef.current = canvas;
      setPreviewUrl(canvas.toDataURL("image/png"));
    } catch {
      // Keep the last good preview if a re-render fails.
    }
  }

  // Build the image from data extracted from the post page (bookmarklet or
  // pasted page source). Remote images load with CORS; anything that fails
  // is reported honestly and omitted, never invented.
  async function importParsed(p: ParsedImport, fromBookmarklet: boolean) {
    setError("");
    setNotice("");
    setPostId(p.postId);
    setStage("loading");

    let avatar: HTMLImageElement | null = null;
    let avatarFailed = false;
    if (p.avatarUrl) {
      try {
        avatar = await loadImageFromUrl(p.avatarUrl);
      } catch {
        avatarFailed = true;
      }
    }

    const images: LoadedImage[] = [];
    let imageFailed = false;
    for (const u of p.imageUrls.slice(0, MAX_POST_IMAGES)) {
      try {
        images.push(toLoaded(await loadImageFromUrl(u)));
      } catch {
        imageFailed = true;
      }
    }

    let notice =
      (fromBookmarklet
        ? "Imported from the post page in one click. "
        : "Imported from the page source. ") +
      "Give it a quick look before downloading.";
    if (avatarFailed)
      notice += " The profile picture couldn't be loaded, so a placeholder is used instead.";
    if (imageFailed)
      notice += " The post was imported, but an attached image couldn't be loaded.";
    setNotice(notice);

    let videoThumb: LoadedImage | null = null;
    if (p.videoThumbnailUrl) {
      try {
        videoThumb = toLoaded(await loadImageFromUrl(p.videoThumbnailUrl));
      } catch {
        /* fall back to the placeholder player */
      }
    }

    const data: PostData = {
      postId: p.postId,
      displayName: p.displayName,
      username: p.username,
      verified: p.verified,
      avatar,
      text: p.text.replace(/\r\n/g, "\n"),
      timestamp: prettyTimestamp(p.timestamp),
      images,
      engagement: {
        picks: p.picks || undefined,
        axes: p.axes || undefined,
        views: p.views || undefined,
      },
      video:
        p.videoSrc || p.videoTitle
          ? { src: p.videoSrc, title: p.videoTitle, thumbnail: videoThumb }
          : null,
    };
    try {
      await renderAndPreview(data);
    } catch {
      setStage("url");
      setError("Something went wrong while generating the image. Please try again.");
    }
  }

  async function handleImportFromHtml() {
    setError("");
    setNotice("");
    if (!htmlSource.trim()) {
      setError(
        "Paste the page source first — open the post, press Ctrl+U (Mac: Cmd+Option+U), copy everything, and paste it here."
      );
      return;
    }
    try {
      const parsed = parsePostHtml(htmlSource);
      await importParsed(parsed, false);
    } catch (e) {
      if (e instanceof ImportParseError) setError(e.message);
      else setError("Something went wrong while reading the page source. Please try again.");
    }
  }

  // Primary flow: paste a post URL, the import service reads the public post
  // page, and the image is built from what Pickax actually shows. No typing.
  async function handleGenerateFromUrl() {
    setError("");
    setNotice("");
    const id = extractPostId(url);
    if (!id) {
      setError("Please enter a valid Pickax post URL, like https://pickax.com/post/707864.");
      return;
    }
    setPostId(id);
    setStage("loading");
    try {
      const payload = await fetchPostFromWorker(id);
      const { data, notice } = await postDataFromWorker(payload);
      setNotice(notice);
      await renderAndPreview(data);
    } catch (e) {
      // Automatic import failed: fall back to the fast alternatives instead
      // of making the user type everything. State the limitation plainly.
      setNotice(
        workerErrorMessage(e) +
          " Instead of typing everything, use the one-click bookmarklet or paste the page source below — or enter the post details exactly as they appear on Pickax and we'll build the image from what you provide. Nothing is invented or filled in."
      );
      setStage("manual");
    }
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
      } else if (avatarUrl.trim()) {
        try {
          avatar = await loadImageFromUrl(avatarUrl.trim());
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
        verified,
        avatar,
        text: text.replace(/\r\n/g, "\n"),
        timestamp: timestamp.trim(),
        images,
        engagement: {
          picks: picks.trim() || undefined,
          axes: axes.trim() || undefined,
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

  const toggle = (key: keyof RenderOptions) => ({
    checked: options[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      handleToggleChange({ ...options, [key]: e.target.checked }),
  });

  return (
    <div className="page">
      <main className="card-wrap">
        <header className="hero">
          <h1>Pickax Post to Image</h1>
          <p className="tagline">Paste a post link, get the image.</p>
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
              {!workerConfigured() && (
                <> Automatic import is still being switched on for this copy of the app.</>
              )}
            </p>

            <div className="divider" aria-hidden="true">
              <span>other ways in</span>
            </div>

            <h2 className="fast-title">One-click import</h2>
            <p className="muted small">
              Drag this button to your bookmarks bar. Then, while viewing any
              Pickax post, click it — the post opens here with everything
              filled in.
            </p>
            <a
              className="btn primary bookmarklet"
              href={BOOKMARKLET}
              onClick={(e) => e.preventDefault()}
              title="Drag me to your bookmarks bar"
            >
              📥 Pickax → Image
            </a>

            <h2 className="fast-title">Or paste the page source</h2>
            <p className="muted small">
              Open the post in your browser, press{" "}
              <kbd>Ctrl</kbd>+<kbd>U</kbd> (Mac: <kbd>⌘</kbd>+<kbd>⌥</kbd>+
              <kbd>U</kbd>), copy everything, and paste it below:
            </p>
            <textarea
              className="text-input textarea mono"
              rows={4}
              value={htmlSource}
              onChange={(e) => setHtmlSource(e.target.value)}
              placeholder="Paste the full page source here…"
              spellCheck={false}
            />
            <button className="btn" onClick={handleImportFromHtml}>
              Import from page source
            </button>
          </section>
        )}

        {stage === "loading" && (
          <section className="panel center">
            <div className="spinner" aria-hidden="true" />
            <p className="muted">Reading the Pickax post…</p>
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
            <div>
              <label className="field-label" htmlFor="verified-badge">
                Account verification
              </label>
              <select
                id="verified-badge"
                className="text-input"
                value={verified ?? ""}
                onChange={(e) =>
                  setVerified(
                    e.target.value === ""
                      ? null
                      : (e.target.value as VerifiedBadge)
                  )
                }
              >
                <option value="">Not verified</option>
                <option value="gold">Gold badge (Verified Creator)</option>
                <option value="blue">Blue badge</option>
              </select>
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
              placeholder="e.g. 1 hour ago"
            />

            <div className="grid-3">
              <div>
                <label className="field-label" htmlFor="picks">
                  Picks
                </label>
                <input
                  id="picks"
                  className="text-input"
                  value={picks}
                  onChange={(e) => setPicks(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="axes">
                  Axes
                </label>
                <input
                  id="axes"
                  className="text-input"
                  value={axes}
                  onChange={(e) => setAxes(e.target.value)}
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
            <div className="url-row">
              <input
                className="text-input"
                type="url"
                placeholder="…or paste a profile picture URL"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>

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
            <fieldset className="toggles">
              <legend>Show in image</legend>
              <label className="toggle">
                <input type="checkbox" {...toggle("showLogo")} /> Logo
              </label>
              <label className="toggle">
                <input type="checkbox" {...toggle("showViews")} /> Views
              </label>
              <label className="toggle">
                <input type="checkbox" {...toggle("showMedia")} /> Post images
              </label>
              <label className="toggle">
                <input type="checkbox" {...toggle("showEngagement")} /> Picks &amp; axes
              </label>
            </fieldset>
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
