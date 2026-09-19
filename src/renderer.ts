import { wrapText } from "./lib/text";
import type { Engagement, LoadedImage, PostData } from "./types";

// ---------------------------------------------------------------------------
// Layout constants (CSS pixels; the canvas is rendered at SCALE for crispness)
// ---------------------------------------------------------------------------
const W = 1200;
const SCALE = 2;
const PAD = 64;
const CARD_RADIUS = 44;
const AVATAR = 112;
const LOGO_W = 200; // supplied pickax logo, kept at natural aspect ratio
const GAP_SECTION = 44;
const GAP_SMALL = 32;

const FONT_STACK = `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

const C = {
  card: "#ffffff",
  cardBorder: "#e6e8eb",
  name: "#111418",
  handle: "#6b7280",
  text: "#1c2026",
  meta: "#6b7280",
  divider: "#eef0f2",
  imageBg: "#f3f4f6",
  avatarBg: "#e8edf3",
  avatarInitial: "#9aa3af",
};

const CONTENT_W = W - PAD * 2;

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

const ENGAGEMENT_ITEMS: {
  key: keyof Engagement;
  icon: string;
}[] = [
  { key: "likes", icon: "♡" },
  { key: "comments", icon: "💬" },
  { key: "reposts", icon: "↻" },
  { key: "views", icon: "👁" },
];

/**
 * Render a polished standalone Pickax post graphic.
 * Height is computed from the actual content: nothing is ever cut off.
 */
export async function renderPostImage(data: PostData): Promise<HTMLCanvasElement> {
  const measure = document.createElement("canvas").getContext("2d")!;

  // ---- measure text -------------------------------------------------------
  measure.font = font(40);
  const textMaxW = CONTENT_W;
  const lines = data.text
    ? wrapText(data.text, textMaxW, (t) => measure.measureText(t).width)
    : [];
  const TEXT_LH = 62;
  const textH = lines.length * TEXT_LH;

  measure.font = font(30);
  const hasMeta = data.timestamp.trim().length > 0;
  const hasEngagement = ENGAGEMENT_ITEMS.some(
    (e) => (data.engagement[e.key] ?? "").trim().length > 0
  );

  const rows = layoutImages(data.images);
  const imagesH =
    rows.length > 0
      ? rows.reduce((sum, r) => sum + r.height, 0) + 16 * (rows.length - 1)
      : 0;

  const headerH = AVATAR;
  const footerH = 30 + GAP_SMALL; // divider + source line
  const engagementH = hasEngagement ? 46 : 0;
  const metaH = hasMeta ? 44 : 0;

  let H = PAD + headerH;
  if (lines.length > 0) H += GAP_SECTION + textH;
  if (imagesH > 0) H += GAP_SECTION + imagesH;
  if (hasMeta) H += GAP_SMALL + metaH;
  if (hasEngagement) H += GAP_SMALL + engagementH;
  H += GAP_SECTION + footerH + PAD;
  H = Math.max(H, 460);

  // ---- create canvas ------------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = Math.ceil(H * SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // card
  roundRectPath(ctx, 1, 1, W - 2, H - 2, CARD_RADIUS);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textBaseline = "alphabetic";

  // ---- header: avatar, name, handle, logo ---------------------------------
  const avatarCx = PAD + AVATAR / 2;
  const avatarCy = PAD + AVATAR / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, AVATAR / 2, 0, Math.PI * 2);
  ctx.clip();
  if (data.avatar) {
    ctx.drawImage(data.avatar, PAD, PAD, AVATAR, AVATAR);
  } else {
    ctx.fillStyle = C.avatarBg;
    ctx.fillRect(PAD, PAD, AVATAR, AVATAR);
    const initial = (
      data.displayName.trim()[0] ||
      data.username.trim()[0] ||
      "?"
    ).toUpperCase();
    ctx.fillStyle = C.avatarInitial;
    ctx.font = font(52, 600);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial, avatarCx, avatarCy + 2);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
  ctx.restore();

  const nameX = PAD + AVATAR + 28;
  const nameMaxW = CONTENT_W - AVATAR - 28 - LOGO_W - 24;
  let nameY = PAD + 46;
  if (data.displayName.trim()) {
    ctx.fillStyle = C.name;
    ctx.font = font(44, 700);
    let name = data.displayName.trim();
    while (name.length > 1 && ctx.measureText(name).width > nameMaxW) {
      name = name.slice(0, -1);
    }
    if (name !== data.displayName.trim()) name = name.slice(0, -1).trimEnd() + "…";
    ctx.fillText(name, nameX, nameY);
    nameY += 52;
  }
  if (data.username.trim()) {
    ctx.fillStyle = C.handle;
    ctx.font = font(36);
    let handle = data.username.trim().replace(/^@+/, "");
    handle = "@" + handle;
    while (handle.length > 2 && ctx.measureText(handle).width > nameMaxW) {
      handle = handle.slice(0, -1);
    }
    ctx.fillText(handle, nameX, nameY);
  }

  // supplied Pickax logo, upper-right, natural aspect ratio
  try {
    const logo = await loadLogo();
    const logoH = (LOGO_W * logo.naturalHeight) / logo.naturalWidth;
    ctx.drawImage(logo, W - PAD - LOGO_W, PAD + (AVATAR - logoH) / 2, LOGO_W, logoH);
  } catch {
    // Logo missing: the post still renders; the brand mark is a nice-to-have
    // here, not post content, so we omit it rather than fail.
  }

  let y = PAD + headerH;

  // ---- post text ----------------------------------------------------------
  if (lines.length > 0) {
    y += GAP_SECTION;
    ctx.fillStyle = C.text;
    ctx.font = font(40);
    for (const line of lines) {
      if (line !== "") ctx.fillText(line, PAD, y);
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
      let x = PAD;
      for (const m of row.items) {
        roundRectPath(ctx, x, y, cellW, row.height, 24);
        ctx.fillStyle = C.imageBg;
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

  // ---- timestamp ----------------------------------------------------------
  if (hasMeta) {
    y += GAP_SMALL;
    ctx.fillStyle = C.meta;
    ctx.font = font(30);
    ctx.fillText(data.timestamp.trim(), PAD, y + 30);
    y += metaH;
  }

  // ---- engagement ---------------------------------------------------------
  if (hasEngagement) {
    y += GAP_SMALL;
    ctx.font = font(34);
    let x = PAD;
    for (const item of ENGAGEMENT_ITEMS) {
      const value = (data.engagement[item.key] ?? "").trim();
      if (!value) continue;
      ctx.fillStyle = C.meta;
      const iconW = ctx.measureText(item.icon + " ").width;
      ctx.fillText(item.icon, x, y + 34);
      x += iconW;
      ctx.fillStyle = C.text;
      ctx.font = font(34, 600);
      ctx.fillText(value, x, y + 34);
      x += ctx.measureText(value).width + 56;
      ctx.font = font(34);
    }
    y += engagementH;
  }

  // ---- footer -------------------------------------------------------------
  y += GAP_SECTION;
  ctx.strokeStyle = C.divider;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += GAP_SMALL + 24;
  ctx.fillStyle = C.meta;
  ctx.font = font(28);
  ctx.fillText(`pickax.com/post/${data.postId}`, PAD, y);

  return canvas;
}
