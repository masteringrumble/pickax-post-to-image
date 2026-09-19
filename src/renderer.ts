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
  badgeOrange: "#FDBA74", // verified seal (Tailwind orange-300)
};

// Verbatim SVG path data from Pickax's own icon set (user-supplied, 2026-09-19).
// viewBox 0 0 24 24 unless noted.
const PICK_D = "M14.2049 2.1V13.1L17.7249 11.241L17.9669 11.208C18.2859 11.208 18.5719 11.34 18.7809 11.56C19.2228 12.0198 19.1872 12.7565 18.703 13.1715L14.2049 17.027C13.9189 17.324 13.5339 17.5 13.1049 17.5H5.95493C5.10793 17.5 4.30493 16.73 4.30493 15.85V11.054C4.30493 10.383 4.68993 9.8 5.23993 9.58L10.0419 7.44148C10.4607 7.25497 10.906 7.13506 11.3619 7.08609L12.0049 7.017V2.1C12.0049 1.80826 12.1208 1.52847 12.3271 1.32218C12.5334 1.11589 12.8132 1 13.1049 1C13.3967 1 13.6765 1.11589 13.8827 1.32218C14.089 1.52847 14.2049 1.80826 14.2049 2.1ZM4.30493 20.8C4.30493 20.1925 4.79742 19.7 5.40493 19.7H12.0049C12.6124 19.7 13.1049 20.1925 13.1049 20.8V21.9C13.1049 22.5075 12.6124 23 12.0049 23H5.40493C4.79742 23 4.30493 22.5075 4.30493 21.9V20.8Z";
const COMMENT_D = "M7.75776 6.57204C12.9514 2.88974 20.374 3.19071 25.1759 7.28586C30.0617 11.4503 30.7292 18.2569 26.7108 23.1298C22.9242 27.7203 16.0984 29.2332 10.4145 26.8653L10.1054 26.7308L4.27626 27.9707L4.17633 27.988L4.02977 28L3.87921 27.9947L3.82059 27.988L3.67402 27.9614L3.53412 27.9161L3.40089 27.8575L3.29963 27.8016L3.15573 27.699L3.04781 27.6005L2.95054 27.4899L2.87993 27.3901L2.79332 27.2369L2.73736 27.0957L2.69606 26.9452L2.67874 26.8454L2.66675 26.6989L2.67208 26.5484L2.67874 26.4898L2.70539 26.3433L2.7347 26.2474L4.26693 21.6515L4.23762 21.6036C1.29307 16.6135 2.62678 10.4275 7.44998 6.79711L7.75642 6.57337L7.75776 6.57204Z"; // viewBox 0 0 32 32
const SHARE_D = "M17.3333 21C16.5926 21 15.963 20.7375 15.4444 20.2125C14.9259 19.6875 14.6667 19.05 14.6667 18.3C14.6667 18.195 14.6741 18.0861 14.6889 17.9733C14.7037 17.8605 14.7259 17.7594 14.7556 17.67L8.48889 13.98C8.23704 14.205 7.95556 14.3814 7.64444 14.5092C7.33333 14.637 7.00741 14.7006 6.66667 14.7C5.92593 14.7 5.2963 14.4375 4.77778 13.9125C4.25926 13.3875 4 12.75 4 12C4 11.25 4.25926 10.6125 4.77778 10.0875C5.2963 9.5625 5.92593 9.3 6.66667 9.3C7.00741 9.3 7.33333 9.3639 7.64444 9.4917C7.95556 9.6195 8.23704 9.7956 8.48889 10.02L14.7556 6.33C14.7259 6.24 14.7037 6.1389 14.6889 6.0267C14.6741 5.9145 14.6667 5.8056 14.6667 5.7C14.6667 4.95 14.9259 4.3125 15.4444 3.7875C15.963 3.2625 16.5926 3 17.3333 3C18.0741 3 18.7037 3.2625 19.2222 3.7875C19.7407 4.3125 20 4.95 20 5.7C20 6.45 19.7407 7.0875 19.2222 7.6125C18.7037 8.1375 18.0741 8.4 17.3333 8.4C16.9926 8.4 16.6667 8.3364 16.3556 8.2092C16.0444 8.082 15.763 7.9056 15.5111 7.68L9.24444 11.37C9.27407 11.46 9.2963 11.5614 9.31111 11.6742C9.32593 11.787 9.33333 11.8956 9.33333 12C9.33333 12.105 9.32593 12.2139 9.31111 12.3267C9.2963 12.4395 9.27407 12.5406 9.24444 12.63L15.5111 16.32C15.763 16.095 16.0444 15.9189 16.3556 15.7917C16.6667 15.6645 16.9926 15.6006 17.3333 15.6C18.0741 15.6 18.7037 15.8625 19.2222 16.3875C19.7407 16.9125 20 17.55 20 18.3C20 19.05 19.7407 19.6875 19.2222 20.2125C18.7037 20.7375 18.0741 21 17.3333 21Z";
const REPOST_D = "M17.5556 17.2H6.44444V14.2L2 18.6L6.44444 23V19.9H18.7778C19.3301 19.9 19.7778 19.4523 19.7778 18.9V13.1H17.5556M6.44444 6.7H17.5556V9.8L22 5.4L17.5556 1V4.1H5.22222C4.66994 4.1 4.22222 4.54772 4.22222 5.1V10.9H6.44444V6.7Z";
// Verified badge: seal + check cutout in ONE path (fill-rule evenodd).
// viewBox 0 0 32 32. On pickax.com the seal is orange-300 (#FDBA74);
// the check is a transparent cutout showing the background through.
const BADGE_D = "M12.7893 4.26666C12.5796 4.45641 12.3593 4.63403 12.1293 4.79866C11.732 5.06533 11.2853 5.24933 10.816 5.34266C10.612 5.38266 10.3987 5.4 9.97333 5.43333C8.90533 5.51866 8.37066 5.56133 7.92533 5.71866C7.41612 5.89845 6.95363 6.18995 6.57179 6.5718C6.18995 6.95364 5.89844 7.41613 5.71866 7.92533C5.56133 8.37066 5.51866 8.90533 5.43333 9.97333C5.41878 10.2557 5.38851 10.537 5.34266 10.816C5.24933 11.2853 5.06533 11.732 4.79866 12.1293C4.68266 12.3027 4.54399 12.4653 4.26666 12.7893C3.57199 13.6053 3.22399 14.0133 3.01999 14.44C2.54933 15.4267 2.54933 16.5733 3.01999 17.56C3.22399 17.9867 3.57199 18.3947 4.26666 19.2107C4.54399 19.5347 4.68266 19.6973 4.79866 19.8707C5.06533 20.268 5.24933 20.7147 5.34266 21.184C5.38266 21.388 5.39999 21.6013 5.43333 22.0267C5.51866 23.0947 5.56133 23.6293 5.71866 24.0747C5.89844 24.5839 6.18995 25.0464 6.57179 25.4282C6.95363 25.81 7.41612 26.1015 7.92533 26.2813C8.37066 26.4387 8.90533 26.4813 9.97333 26.5667C10.3987 26.6 10.612 26.6173 10.816 26.6573C11.2853 26.7507 11.732 26.936 12.1293 27.2013C12.3027 27.3173 12.4653 27.456 12.7893 27.7333C13.6053 28.428 14.0133 28.776 14.44 28.98C15.4267 29.4507 16.5733 29.4507 17.56 28.98C17.9867 28.776 18.3947 28.428 19.2107 27.7333C19.5347 27.456 19.6973 27.3173 19.8707 27.2013C20.268 26.9347 20.7147 26.7507 21.184 26.6573C21.388 26.6173 21.6013 26.6 22.0267 26.5667C23.0947 26.4813 23.6293 26.4387 24.0747 26.2813C24.5839 26.1015 25.0464 25.81 25.4282 25.4282C25.81 25.0464 26.1015 24.5839 26.2813 24.0747C26.4387 23.6293 26.4813 23.0947 26.5667 22.0267C26.6 21.6013 26.6173 21.388 26.6573 21.184C26.7507 20.7147 26.936 20.268 27.2013 19.8707C27.3173 19.6973 27.456 19.5347 27.7333 19.2107C28.428 18.3947 28.776 17.9867 28.98 17.56C29.4507 16.5733 29.4507 15.4267 28.98 14.44C28.776 14.0133 28.428 13.6053 27.7333 12.7893C27.5436 12.5796 27.366 12.3593 27.2013 12.1293C26.9349 11.7318 26.75 11.2854 26.6573 10.816C26.6115 10.537 26.5812 10.2557 26.5667 9.97333C26.4813 8.90533 26.4387 8.37066 26.2813 7.92533C26.1015 7.41613 25.81 6.95364 25.4282 6.5718C25.0464 6.18995 24.5839 5.89845 24.0747 5.71866C23.6293 5.56133 23.0947 5.51866 22.0267 5.43333C21.7443 5.41879 21.463 5.38852 21.184 5.34266C20.7145 5.24998 20.2681 5.06508 19.8707 4.79866C19.641 4.63368 19.4206 4.45608 19.2107 4.26666C18.3947 3.572 17.9867 3.224 17.56 3.02C17.0729 2.78717 16.5399 2.66633 16 2.66633C15.4601 2.66633 14.9271 2.78717 14.44 3.02C14.0133 3.224 13.6053 3.572 12.7893 4.26666ZM21.8307 13.1507C22.0191 12.9444 22.1208 12.6734 22.1145 12.3941C22.1082 12.1148 21.9944 11.8487 21.7969 11.6511C21.5993 11.4536 21.3332 11.3398 21.0539 11.3335C20.7746 11.3272 20.5036 11.4289 20.2973 11.6173L13.8307 18.084L11.7027 15.9573C11.4964 15.7689 11.2254 15.6672 10.9461 15.6735C10.6668 15.6798 10.4007 15.7936 10.2031 15.9911C10.0056 16.1887 9.89182 16.4548 9.88552 16.7341C9.87923 17.0134 9.98088 17.2844 10.1693 17.4907L13.0627 20.384C13.2661 20.5871 13.5419 20.7011 13.8293 20.7011C14.1168 20.7011 14.3925 20.5871 14.596 20.384L21.832 13.1507H21.8307Z";

// Axe path was already verbatim from the live site; kept as-is.
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
const COMMENT_PATH = makePath(COMMENT_D);
const SHARE_PATH = makePath(SHARE_D);
const REPOST_PATH = makePath(REPOST_D);
const BADGE_PATH = makePath(BADGE_D);

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
  return `${base}icons/logo.svg`;
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

/** Fill a verbatim Pickax SVG path, scaled to `size` px (viewBox 0 0 vb 24/32). */
function drawSvgPath(
  ctx: CanvasRenderingContext2D,
  path: Path2D | null,
  viewBox: number,
  cx: number,
  cy: number,
  size: number,
  fill: string | CanvasGradient,
  rule?: CanvasFillRule
): void {
  if (!path) return; // non-Path2D runtime: skip the icon, keep layout
  const s = size / viewBox;
  ctx.save();
  ctx.translate(cx - (viewBox / 2) * s, cy - (viewBox / 2) * s);
  ctx.scale(s, s);
  ctx.fillStyle = fill;
  if (rule) ctx.fill(path, rule);
  else ctx.fill(path);
  ctx.restore();
}

/** Comment / repost / share: Pickax's own white glyphs, muted like the site. */
function drawActionIcon(
  ctx: CanvasRenderingContext2D,
  kind: "comments" | "repost" | "share",
  cx: number,
  cy: number,
  size: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  if (kind === "comments")
    drawSvgPath(ctx, COMMENT_PATH, 32, cx, cy, size, PX.white);
  else if (kind === "repost")
    drawSvgPath(ctx, REPOST_PATH, 24, cx, cy, size, PX.white);
  else drawSvgPath(ctx, SHARE_PATH, 24, cx, cy, size, PX.white);
  ctx.restore();
}

/**
 * Verified badge next to the display name, as on the post: the orange-300
 * seal; the check is a transparent cutout (evenodd), so the card shows
 * through exactly like the site's CSS override does.
 */
function drawVerifiedBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  size: number
): void {
  drawSvgPath(ctx, BADGE_PATH, 32, x + size / 2, cy, size, PX.badgeOrange, "evenodd");
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
  const padX = 18;
  // The timestamp row reserves 200px for this pill; never exceed it so the
  // pill can never spill past the card edge, no matter the input.
  const maxTextW = Math.max(0, 200 - padX - iconS - 12 - padX);
  const shown = truncate(ctx, views, maxTextW);
  const textW = ctx.measureText(shown).width;
  const pillW = padX + iconS + 12 + textW + padX;
  const pillH = 52;
  const top = centerY - pillH / 2;
  roundRectPath(ctx, x, top, pillW, pillH, pillH / 2);
  ctx.fillStyle = PX.btn;
  ctx.fill();
  drawEye(ctx, x + padX + iconS / 2, centerY, iconS);
  ctx.fillStyle = PX.white;
  ctx.textBaseline = "middle";
  ctx.fillText(shown, x + padX + iconS + 12, centerY + 1);
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
    // The count must never spill outside its button.
    const shown = label ? truncate(ctx, label, Math.max(0, w - iconS - 14 - 32)) : "";
    const labelW = shown ? ctx.measureText(shown).width : 0;
    const gapI = shown ? 14 : 0;
    const totalW = iconS + gapI + labelW;
    const ix = x + (w - totalW) / 2;
    drawPickAxeIcon(ctx, kind, ix + iconS / 2, cy, iconS);
    if (shown) {
      ctx.fillStyle = PX.white;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(shown, ix + iconS + gapI, cy + 1);
      ctx.textBaseline = "alphabetic";
    }
  } else if (kind === "comments") {
    drawActionIcon(ctx, "comments", x + w / 2, cy, 40);
  } else if (kind === "repost") {
    drawActionIcon(ctx, "repost", x + w / 2, cy, 40);
  } else {
    drawActionIcon(ctx, "share", x + w / 2, cy, 40);
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
  const showBadge = data.verified && o.showVerified;
  const BADGE_S = 40;
  const nameMaxW =
    CONTENT_W - AVATAR - 28 - (o.showLogo ? LOGO_W + 24 : 0) - (showBadge ? BADGE_S + 14 : 0);
  // The handle/timestamp row has no badge, so it keeps the full width.
  const metaMaxW = CONTENT_W - AVATAR - 28 - (o.showLogo ? LOGO_W + 24 : 0);
  let ny = y + 50;
  if (displayName) {
    ctx.fillStyle = PX.white;
    ctx.font = font(44, 700);
    const shownName = truncate(ctx, displayName, nameMaxW);
    ctx.fillText(shownName, nameX, ny);
    if (showBadge) {
      // Verified seal sits right after the name, as on the post.
      const nameW = ctx.measureText(shownName).width;
      drawVerifiedBadge(ctx, nameX + nameW + 14, ny - 16, BADGE_S);
    }
    ny += 56;
  }
  if (username || timestamp || showViewsPill) {
    ctx.font = font(34);
    let lx = nameX;
    if (username) {
      const handle = "@" + username;
      ctx.fillStyle = PX.muted;
      const shown = truncate(ctx, handle, metaMaxW);
      ctx.fillText(shown, lx, ny);
      lx += ctx.measureText(shown).width;
    }
    if (timestamp) {
      const sep = username ? "  ·  " : "";
      const avail = Math.max(
        0,
        metaMaxW -
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

  // ---- video embed: thumbnail as shown on the actual post, with a play -----
  // ---- button overlay; dark placeholder only when no thumbnail loaded ----
  if (videoH > 0 && video) {
    y += GAP_SECTION;
    roundRectPath(ctx, cx0, y, CONTENT_W, videoH, 24);
    ctx.fillStyle = PX.videoBg;
    ctx.fill();
    const thumb = video.thumbnail;
    if (thumb) {
      // Cover-fit the 16:9 box, clipped to the rounded corners.
      const scale = Math.max(CONTENT_W / thumb.width, videoH / thumb.height);
      const dw = thumb.width * scale;
      const dh = thumb.height * scale;
      ctx.save();
      roundRectPath(ctx, cx0, y, CONTENT_W, videoH, 24);
      ctx.clip();
      ctx.drawImage(thumb.img, cx0 + (CONTENT_W - dw) / 2, y + (videoH - dh) / 2, dw, dh);
      // Dim slightly so the play button reads, like the real player.
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(cx0, y, CONTENT_W, videoH);
      ctx.restore();
    }
    const pcx = cx0 + CONTENT_W / 2;
    const pcy = y + videoH / 2 - (video.title && !thumb ? 26 : 0);
    drawPlayButton(ctx, pcx, pcy, 58);
    if (video.title && !thumb) {
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
