import { wrapText } from "./lib/text";
import {
  DEFAULT_RENDER_OPTIONS,
  type LoadedImage,
  type PostData,
  type RenderOptions,
} from "./types";

// ---------------------------------------------------------------------------
// Pickax dark theme — colors verified against pickax.com (2026-09-19).
// The generated image mirrors the post card: dark card floating on the
// darker page background, icon-only engagement buttons, views pill.
// ---------------------------------------------------------------------------
const PX = {
  page: "#0B101E", // page background behind the card
  card: "#222A39", // post card
  btn: "#333D52", // engagement buttons + views pill
  divider: "#394050",
  white: "#FFFFFF",
  muted: "#BDC5DB", // @username, timestamp
  blue: "#3EB1F9", // @mentions, #hashtags
  videoBg: "#0B101E",
  avatarBg: "#333D52",
  avatarInitial: "#BDC5DB",
  pickFrom: "#0083f5",
  pickTo: "#00c4f5",
  axeFrom: "#dc1919",
  axeTo: "#f59b00",
};

// Verbatim SVG path data from the live Pickax post (viewBox 0 0 24 24).
const PICK_D =
  "M14.2049 2.1V13.1L17.7249 11.241L17.9669 11.208C18.2859 11.208 18.6049 11.348 18.8839 11.596L20.8639 13.296C22.6439 14.856 22.6439 17.316 21.0439 18.916C19.7839 20.176 17.9439 20.436 16.4239 19.696C15.9839 21.416 15.1039 22.896 13.6639 22.896C12.9839 22.896 12.2839 22.576 11.7439 22.016C10.9439 21.176 10.8439 19.936 11.3639 19.056C10.1839 18.836 9.28386 17.976 9.28386 16.716L9.30386 8.316C9.30386 7.896 9.48386 7.516 9.78386 7.256C10.4239 6.716 11.4839 7.036 11.8039 7.916L13.2239 11.876L13.2439 3.16C13.2439 2.38 14.2049 2.1 14.2049 2.1Z";
const AXE_D =
  "M12.4276 0L24.5 7.3991C24.5 12.3318 22.0855 14.7982 17.2565 16.0314L13.6348 9.86547L8.80583 4.93274L12.4276 0ZM3.82963 20.7587C3.32024 21.4406 2.35059 21.5723 1.67782 21.0508C1.02334 20.5435 0.894501 19.6061 1.38785 18.9411L9.03521 8.63229L11.2203 10.8644L3.82963 20.7587Z";

// Path2D is unavailable in some non-browser runtimes; fall back gracefully.
function makePath(d: string): Path2D | null {
  try {
    if (typeof Path2D !== "undefined") return new Path2D(d);
  } catch {
    /* ignore */
  }
  return null;
}
const PICK_PATH = makePath(PICK_D);
const AXE_PATH = makePath(AXE_D);

// ---------------------------------------------------------------------------
// Layout constants (CSS pixels; the canvas is rendered at SCALE for crispness)
// ---------------------------------------------------------------------------
const W = 1200;
const SCALE = 2;
const PAGE_PAD = 36; // page background margin around the card
const CARD_PAD = 52; // padding inside the card
const CONTENT_W = W - (PAGE_PAD + CARD_PAD) * 2;
const CARD_RADIUS = 36;
const AVATAR = 104;
const LOGO_W = 190;
const HEADER_H = 132;
const GAP_SECTION = 48;
const BTN_H = 76;
const BTN_GAP = 18;

const FONT_STACK = `"Poppins", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

function font(px: number, weight: number = 400): string {
  return `${weight} ${px}px ${FONT_STACK}`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function logoUrl(): string {
  const base =
    (import.meta as unknown as { env?: { BASE_URL?: string } }).env
      ?.BASE_URL ?? "./";
  return `${base}pickax-logo.png`;
}

function loadLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo"));
    img.src = logoUrl();
  });
}

interface MeasuredImage {
  src: LoadedImage;
  drawW: number;
  drawH: number;
}

/** Fit an image inside a cell, preserving aspect ratio, never cropping. */
function fitImage(img: LoadedImage, cellW: number, maxH: number): MeasuredImage {
  const ratio = img.width / img.height;
  let drawW = cellW;
  let drawH = drawW / ratio;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = drawH * ratio;
  }
  return { src: img, drawW, drawH };
}

interface ImageRow {
  items: MeasuredImage[];
  height: number;
}

function layoutImages(images: LoadedImage[]): ImageRow[] {
  const list = images.slice(0, 4); // keep the layout simple
  if (list.length === 0) return [];
  const gap = 16;
  const rows: ImageRow[] = [];

  if (list.length === 1) {
    const m = fitImage(list[0], CONTENT_W, 680);
    rows.push({ items: [m], height: m.drawH });
    return rows;
  }

  const cols = list.length === 3 ? 3 : 2;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const maxH = 460;
  for (let i = 0; i < list.length; i += cols) {
    const chunk = list.slice(i, i + cols);
    const items = chunk.map((im) => fitImage(im, cellW, maxH));
    const height = Math.max(...items.map((m) => m.drawH));
    rows.push({ items, height });
  }
  return rows;
}

/** Truncate text with an ellipsis to fit maxW. */
function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number
): string {
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
  if (t !== text) t = t.slice(0, -1).trimEnd() + "…";
  return t;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function gradientFill(
  ctx: CanvasRenderingContext2D,
  from: string,
  to: string
): void {
  const anyCtx = ctx as unknown as {
    createLinearGradient?: (
      x0: number,
      y0: number,
      x1: number,
      y1: number
    ) => { addColorStop: (o: number, c: string) => void };
  };
  if (typeof anyCtx.createLinearGradient === "function") {
    const g = anyCtx.createLinearGradient(0, 0, 24, 0);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    ctx.fillStyle = g as unknown as string;
  } else {
    ctx.fillStyle = from;
  }
}

/** Pick hand / axe icons from the live site, with their brand gradients. */
function drawPickAxeIcon(
  ctx: CanvasRenderingContext2D,
  kind: "picks" | "axes",
  cx: number,
  cy: number,
  size: number
): void {
  const path = kind === "picks" ? PICK_PATH : AXE_PATH;
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  if (kind === "picks") gradientFill(ctx, PX.pickFrom, PX.pickTo);
  else gradientFill(ctx, PX.axeFrom, PX.axeTo);
  if (path) ctx.fill(path);
  else ctx.fillRect(2, 2, 20, 20); // non-Path2D fallback keeps layout intact
  ctx.restore();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number
): void {
  ctx.save();
  ctx.strokeStyle = PX.white;
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.beginPath();
  if (typeof ctx.ellipse === "function")
    ctx.ellipse(cx, cy, s * 0.5, s * 0.3, 0, 0, Math.PI * 2);
  else ctx.arc(cx, cy, s * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PX.white;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = PX.white;
  const w = s;
  const h = s * 0.76;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, s * 0.24);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.16, cy + h / 2 - 2);
  ctx.lineTo(cx - w * 0.02, cy + h / 2 + s * 0.3);
  ctx.lineTo(cx + w * 0.14, cy + h / 2 - 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRepost(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = PX.white;
  ctx.lineWidth = s * 0.13;
  ctx.lineCap = "round";
  const w = s * 0.4;
  const h = s * 0.24;
  const ah = s * 0.16; // arrowhead size
  // top arrow, pointing right
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w - ah * 0.4, cy - h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w - ah, cy - h - ah * 0.7);
  ctx.lineTo(cx + w, cy - h);
  ctx.lineTo(cx + w - ah, cy - h + ah * 0.7);
  ctx.stroke();
  // bottom arrow, pointing left
  ctx.beginPath();
  ctx.moveTo(cx + w, cy + h);
  ctx.lineTo(cx - w + ah * 0.4, cy + h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w + ah, cy + h - ah * 0.7);
  ctx.lineTo(cx - w, cy + h);
  ctx.lineTo(cx - w + ah, cy + h + ah * 0.7);
  ctx.stroke();
  ctx.restore();
}

function drawShare(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = PX.white;
  ctx.fillStyle = PX.white;
  ctx.lineWidth = s * 0.11;
  const r = s * 0.16;
  const left = { x: cx - s * 0.34, y: cy };
  const tr = { x: cx + s * 0.3, y: cy - s * 0.3 };
  const br = { x: cx + s * 0.3, y: cy + s * 0.3 };
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(br.x, br.y);
  ctx.stroke();
  for (const p of [left, tr, br]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayButton(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PX.videoBg;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.34, cy - r * 0.5);
  ctx.lineTo(cx + r * 0.52, cy);
  ctx.lineTo(cx - r * 0.34, cy + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Views pill as on the site: dark pill, eye icon, count. Returns its width. */
function drawViewsPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  views: string
): number {
  const iconS = 26;
  ctx.font = font(30, 600);
  const textW = ctx.measureText(views).width;
  const padX = 18;
  const pillW = padX + iconS + 12 + textW + padX;
  const pillH = 52;
  const top = centerY - pillH / 2;
  roundRectPath(ctx, x, top, pillW, pillH, pillH / 2);
  ctx.fillStyle = PX.btn;
  ctx.fill();
  drawEye(ctx, x + padX + iconS / 2, centerY, iconS);
  ctx.fillStyle = PX.white;
  ctx.textBaseline = "middle";
  ctx.fillText(views, x + padX + iconS + 12, centerY + 1);
  ctx.textBaseline = "alphabetic";
  return pillW;
}

/** One engagement button. Picks/axes show their gradient icon + count. */
function drawEngagementButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: "picks" | "axes" | "comments" | "repost" | "share",
  count: string
): void {
  roundRectPath(ctx, x, y, w, h, 18);
  ctx.fillStyle = PX.btn;
  ctx.fill();
  const cy = y + h / 2;
  if (kind === "picks" || kind === "axes") {
    const iconS = 38;
    ctx.font = font(32, 600);
    const label = count.trim();
    const labelW = label ? ctx.measureText(label).width : 0;
    const gapI = label ? 14 : 0;
    const totalW = iconS + gapI + labelW;
    const ix = x + (w - totalW) / 2;
    drawPickAxeIcon(ctx, kind, ix + iconS / 2, cy, iconS);
    if (label) {
      ctx.fillStyle = PX.white;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(label, ix + iconS + gapI, cy + 1);
      ctx.textBaseline = "alphabetic";
    }
  } else if (kind === "comments") {
    drawBubble(ctx, x + w / 2, cy, 40);
  } else if (kind === "repost") {
    drawRepost(ctx, x + w / 2, cy, 40);
  } else {
    drawShare(ctx, x + w / 2, cy, 40);
  }
}

/** Post body: white text, @mentions and #hashtags in Pickax blue. */
function drawRichLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number
): void {
  const words = line.split(" ");
  const spaceW = ctx.measureText(" ").width;
  let cx = x;
  for (const word of words) {
    ctx.fillStyle = /^[@#]/.test(word) ? PX.blue : PX.white;
    ctx.fillText(word, cx, y);
    cx += ctx.measureText(word).width + spaceW;
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Render a Pickax post graphic that mirrors the post card on pickax.com.
 * Height is computed from the actual content: nothing is ever cut off.
 * Fields left empty are omitted — nothing is invented.
 */
export async function renderPostImage(
  data: PostData,
  opts: RenderOptions = DEFAULT_RENDER_OPTIONS
): Promise<HTMLCanvasElement> {
  const o = { ...DEFAULT_RENDER_OPTIONS, ...opts };
  const measure = document.createElement("canvas").getContext("2d")!;

  // Picks/axes are the engagement system; fall back to the legacy "likes"
  // key so bookmarklet/manual flows keep working until they migrate.
  const picks = (data.engagement.picks ?? data.engagement.likes ?? "").trim();
  const axes = (data.engagement.axes ?? "").trim();
  const views = (data.engagement.views ?? "").trim();
  const showViewsPill = o.showViews && views.length > 0;
  const showEngagementRow =
    o.showEngagement && (picks.length > 0 || axes.length > 0);

  const displayName = data.displayName.trim();
  const username = data.username.trim().replace(/^@+/, "");
  const timestamp = data.timestamp.trim();

  // ---- measure text -------------------------------------------------------
  measure.font = font(40);
  const lines = data.text
    ? wrapText(data.text, CONTENT_W, (t) => measure.measureText(t).width)
    : [];
  const TEXT_LH = 62;
  const textH = lines.length * TEXT_LH;

  const rows = o.showMedia ? layoutImages(data.images) : [];
  const imagesH =
    rows.length > 0
      ? rows.reduce((sum, r) => sum + r.height, 0) + 16 * (rows.length - 1)
      : 0;
  const video = o.showMedia ? data.video : null;
  const videoH = video ? Math.round((CONTENT_W * 9) / 16) : 0;

  const engagementH = showEngagementRow ? BTN_H : 0;
  const FOOTER_TAIL = 56; // divider -> source line

  let cardH = CARD_PAD + HEADER_H;
  if (lines.length > 0) cardH += GAP_SECTION + textH;
  if (imagesH > 0) cardH += GAP_SECTION + imagesH;
  if (videoH > 0) cardH += GAP_SECTION + videoH;
  if (engagementH > 0) cardH += GAP_SECTION + engagementH;
  cardH += GAP_SECTION + FOOTER_TAIL + CARD_PAD;
  cardH = Math.max(cardH, 400);

  const H = cardH + PAGE_PAD * 2;

  // ---- create canvas ------------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = Math.ceil(H * SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // page background, then the floating post card
  ctx.fillStyle = PX.page;
  ctx.fillRect(0, 0, W, H);
  roundRectPath(ctx, PAGE_PAD, PAGE_PAD, W - PAGE_PAD * 2, cardH, CARD_RADIUS);
  ctx.fillStyle = PX.card;
  ctx.fill();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const cx0 = PAGE_PAD + CARD_PAD;
  let y = PAGE_PAD + CARD_PAD;

  // ---- header: avatar, name, handle / timestamp / views --------------------
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx0 + AVATAR / 2, y + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2);
  ctx.clip();
  if (data.avatar) {
    ctx.drawImage(data.avatar, cx0, y, AVATAR, AVATAR);
  } else {
    ctx.fillStyle = PX.avatarBg;
    ctx.fillRect(cx0, y, AVATAR, AVATAR);
    const initial = (displayName[0] || username[0] || "?").toUpperCase();
    ctx.fillStyle = PX.avatarInitial;
    ctx.font = font(52, 600);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial, cx0 + AVATAR / 2, y + AVATAR / 2 + 2);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
  ctx.restore();

  const nameX = cx0 + AVATAR + 28;
  const nameMaxW = CONTENT_W - AVATAR - 28 - (o.showLogo ? LOGO_W + 24 : 0);
  let ny = y + 50;
  if (displayName) {
    ctx.fillStyle = PX.white;
    ctx.font = font(44, 700);
    ctx.fillText(truncate(ctx, displayName, nameMaxW), nameX, ny);
    ny += 56;
  }
  if (username || timestamp || showViewsPill) {
    ctx.font = font(34);
    let lx = nameX;
    if (username) {
      const handle = "@" + username;
      ctx.fillStyle = PX.muted;
      const shown = truncate(ctx, handle, nameMaxW);
      ctx.fillText(shown, lx, ny);
      lx += ctx.measureText(shown).width;
    }
    if (timestamp) {
      const sep = username ? "  ·  " : "";
      const avail = Math.max(
        0,
        nameMaxW -
          (lx - nameX) -
          ctx.measureText(sep).width -
          (showViewsPill ? 200 : 0)
      );
      if (username) {
        ctx.fillStyle = PX.muted;
        ctx.fillText(sep, lx, ny);
        lx += ctx.measureText(sep).width;
      }
      ctx.fillStyle = PX.muted;
      const shown = truncate(ctx, timestamp, avail);
      ctx.fillText(shown, lx, ny);
      lx += ctx.measureText(shown).width;
    }
    if (showViewsPill) {
      drawViewsPill(ctx, lx + 22, ny - 12, views);
    }
  }

  // supplied Pickax logo, upper-right
  if (o.showLogo) {
    try {
      const logo = await loadLogo();
      const logoH = (LOGO_W * logo.naturalHeight) / logo.naturalWidth;
      ctx.drawImage(
        logo,
        PAGE_PAD + (W - PAGE_PAD * 2) - CARD_PAD - LOGO_W,
        y + (HEADER_H - logoH) / 2,
        LOGO_W,
        logoH
      );
    } catch {
      // Brand mark is a nice-to-have, not post content: omit, don't fail.
    }
  }

  y += HEADER_H;

  // ---- post text ----------------------------------------------------------
  if (lines.length > 0) {
    y += GAP_SECTION;
    ctx.font = font(40);
    for (const line of lines) {
      if (line !== "") drawRichLine(ctx, line, cx0, y);
      y += TEXT_LH;
    }
    y -= TEXT_LH; // back up: the loop advanced past the last line
  }

  // ---- attached images ----------------------------------------------------
  if (rows.length > 0) {
    y += GAP_SECTION;
    const gap = 16;
    for (const row of rows) {
      const n = row.items.length;
      const c = n === 1 ? 1 : n === 3 ? 3 : 2;
      const cellW = (CONTENT_W - gap * (c - 1)) / c;
      let x = cx0;
      for (const m of row.items) {
        roundRectPath(ctx, x, y, cellW, row.height, 24);
        ctx.fillStyle = PX.videoBg;
        ctx.fill();
        ctx.save();
        roundRectPath(ctx, x, y, cellW, row.height, 24);
        ctx.clip();
        ctx.drawImage(
          m.src.img,
          x + (cellW - m.drawW) / 2,
          y + (row.height - m.drawH) / 2,
          m.drawW,
          m.drawH
        );
        ctx.restore();
        x += cellW + gap;
      }
      y += row.height + gap;
    }
    y -= gap;
  }

  // ---- video embed placeholder (16:9, play button, title) ------------------
  if (videoH > 0 && video) {
    y += GAP_SECTION;
    roundRectPath(ctx, cx0, y, CONTENT_W, videoH, 24);
    ctx.fillStyle = PX.videoBg;
    ctx.fill();
    const pcx = cx0 + CONTENT_W / 2;
    const pcy = y + videoH / 2 - (video.title ? 26 : 0);
    drawPlayButton(ctx, pcx, pcy, 58);
    if (video.title) {
      ctx.fillStyle = PX.muted;
      ctx.font = font(30);
      ctx.textAlign = "center";
      ctx.fillText(truncate(ctx, video.title, CONTENT_W - 80), pcx, pcy + 104);
      ctx.textAlign = "left";
    }
    y += videoH;
  }

  // ---- engagement: picks / axes / comments / repost / share ----------------
  if (engagementH > 0) {
    y += GAP_SECTION;
    const btnW = (CONTENT_W - BTN_GAP * 4) / 5;
    let bx = cx0;
    drawEngagementButton(ctx, bx, y, btnW, BTN_H, "picks", picks);
    bx += btnW + BTN_GAP;
    drawEngagementButton(
      ctx,
      bx,
      y,
      btnW,
      BTN_H,
      "axes",
      axes === "0" ? "" : axes
    );
    bx += btnW + BTN_GAP;
    drawEngagementButton(ctx, bx, y, btnW, BTN_H, "comments", "");
    bx += btnW + BTN_GAP;
    drawEngagementButton(ctx, bx, y, btnW, BTN_H, "repost", "");
    bx += btnW + BTN_GAP;
    drawEngagementButton(ctx, bx, y, btnW, BTN_H, "share", "");
    y += engagementH;
  }

  // ---- footer -------------------------------------------------------------
  y += GAP_SECTION;
  ctx.strokeStyle = PX.divider;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx0, y);
  ctx.lineTo(cx0 + CONTENT_W, y);
  ctx.stroke();
  y += FOOTER_TAIL;
  ctx.fillStyle = PX.muted;
  ctx.font = font(28);
  ctx.fillText(`pickax.com/post/${data.postId}`, cx0, y);

  return canvas;
}
