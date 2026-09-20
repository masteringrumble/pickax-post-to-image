/**
 * Share sheet: one "Share" button opening a panel with every social network
 * that has a working web share endpoint (ShareThis's network list was the
 * reference), styled to match the site's dark theme. No third-party widget
 * script — everything is a plain share-URL opened in a new tab, so there is
 * no tracking and no account needed.
 *
 * The generated PNG itself is shared where the platform allows it:
 *  - "Copy image" puts the PNG on the clipboard (paste anywhere)
 *  - "System share" hands the PNG file to the OS share sheet (mobile)
 * Link-based networks open their composer/share page with a suggested
 * caption prefilled; the user always edits before posting.
 */
import {
  siBlogger,
  siBluesky,
  siDouban,
  siEvernote,
  siFacebook,
  siFlipboard,
  siGmail,
  siInstapaper,
  siLine,
  siNaver,
  siOdnoklassniki,
  siPinterest,
  siQzone,
  siReddit,
  siSinaweibo,
  siTelegram,
  siThreads,
  siTumblr,
  siVk,
  siWhatsapp,
  siWordpress,
  siX,
} from "simple-icons";
import type { PostData } from "./types";

export const TOOL_URL = "https://masteringrumble.github.io/pickax-post-to-image/";

/** Canonical link to the Pickax post being shared. */
export function postUrlOf(data: Pick<PostData, "postId">): string {
  const id = data.postId.trim();
  return id ? `https://pickax.com/post/${id}` : "";
}

function excerptOf(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut) + "…";
}

export interface ShareContext {
  /** Post URL, falling back to the tool URL when the post has no id. */
  url: string;
  /** `"excerpt"\n\n— name on Pickax\nurl` — for text params. */
  caption: string;
  /** Caption without the URL (Truth Social takes the URL separately). */
  titleHead: string;
  /** Single-line title for title params. */
  title: string;
  /** Email subject line. */
  subject: string;
}

export function shareContextOf(
  data: Pick<PostData, "postId" | "displayName" | "text">,
): ShareContext {
  const url = postUrlOf(data) || TOOL_URL;
  const who = data.displayName.trim() || "someone";
  const quote = excerptOf(data.text, 110);
  const titleHead = quote ? `“${quote}”\n\n— ${who} on Pickax` : `${who} on Pickax`;
  const single = excerptOf(data.text, 160);
  const title = single ? `“${single}” — ${who} on Pickax` : `${who} on Pickax`;
  return {
    url,
    caption: `${titleHead}\n${url}`,
    titleHead,
    title,
    subject: `Pickax post by ${who}`,
  };
}

/** The OS share sheet can take the actual PNG file (mostly mobile). */
export function canNativeShareFiles(): boolean {
  try {
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
    };
    return (
      typeof nav.canShare === "function" &&
      nav.canShare({ files: [new File([], "share.png", { type: "image/png" })] })
    );
  } catch {
    return false;
  }
}

export type ShareIcon =
  | { kind: "brand"; path: string }
  | {
      kind: "custom";
      id:
        | "linkedin"
        | "truthsocial"
        | "teams"
        | "outlook"
        | "yahoomail"
        | "hackernews"
        | "email"
        | "sms"
        | "link"
        | "image"
        | "share";
    };

export type ShareAction = "copyImage" | "copyLink" | "nativeShare";

export interface ShareTarget {
  id: string;
  name: string;
  /** Glyph tint (brand color, lightened where needed for the dark theme). */
  color: string;
  icon: ShareIcon;
  /** Opens in a new tab. Absent for clipboard/native actions. */
  href?: (ctx: ShareContext) => string;
  action?: ShareAction;
}

const enc = encodeURIComponent;
const brand = (path: string): ShareIcon => ({ kind: "brand", path });
type CustomIconId = Extract<ShareIcon, { kind: "custom" }>["id"];
const custom = (id: CustomIconId): ShareIcon => ({ kind: "custom", id });

export const SHARE_TARGETS: ShareTarget[] = [
  // Image-first actions
  { id: "copy-image", name: "Copy image", color: "#e8e8e8", icon: custom("image"), action: "copyImage" },
  { id: "system-share", name: "System share", color: "#e8e8e8", icon: custom("share"), action: "nativeShare" },
  { id: "copy-link", name: "Copy link", color: "#e8e8e8", icon: custom("link"), action: "copyLink" },
  // Social networks
  { id: "x", name: "X", color: "#e7e9ea", icon: brand(siX.path),
    href: (c) => `https://x.com/intent/post?text=${enc(c.caption)}` },
  { id: "facebook", name: "Facebook", color: "#1877F2", icon: brand(siFacebook.path),
    href: (c) => `https://www.facebook.com/sharer/sharer.php?u=${enc(c.url)}` },
  { id: "whatsapp", name: "WhatsApp", color: "#25D366", icon: brand(siWhatsapp.path),
    href: (c) => `https://wa.me/?text=${enc(`${c.caption}`)}` },
  { id: "telegram", name: "Telegram", color: "#229ED9", icon: brand(siTelegram.path),
    href: (c) => `https://t.me/share/url?url=${enc(c.url)}&text=${enc(c.titleHead)}` },
  { id: "reddit", name: "Reddit", color: "#FF4500", icon: brand(siReddit.path),
    href: (c) => `https://www.reddit.com/submit?url=${enc(c.url)}&title=${enc(c.title)}` },
  { id: "linkedin", name: "LinkedIn", color: "#0A66C2", icon: custom("linkedin"),
    href: (c) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(c.url)}` },
  { id: "pinterest", name: "Pinterest", color: "#E60023", icon: brand(siPinterest.path),
    href: (c) => `https://pinterest.com/pin/create/button/?url=${enc(c.url)}&description=${enc(c.caption)}` },
  { id: "threads", name: "Threads", color: "#e7e9ea", icon: brand(siThreads.path),
    href: (c) => `https://www.threads.net/intent/post?text=${enc(c.caption)}` },
  { id: "bluesky", name: "Bluesky", color: "#0285FF", icon: brand(siBluesky.path),
    href: (c) => `https://bsky.app/intent/compose?text=${enc(c.caption)}` },
  { id: "truthsocial", name: "Truth Social", color: "#8b7cf6", icon: custom("truthsocial"),
    href: (c) => `https://truthsocial.com/share?title=${enc(c.titleHead)}&url=${enc(c.url)}` },
  { id: "tumblr", name: "Tumblr", color: "#9aa7b8", icon: brand(siTumblr.path),
    href: (c) => `https://www.tumblr.com/share/link?url=${enc(c.url)}&name=${enc(c.title)}&description=${enc(c.caption)}` },
  // Messaging & mail
  { id: "email", name: "Email", color: "#c9c9c9", icon: custom("email"),
    href: (c) => `mailto:?subject=${enc(c.subject)}&body=${enc(`${c.caption}`)}` },
  { id: "gmail", name: "Gmail", color: "#EA4335", icon: brand(siGmail.path),
    href: (c) => `https://mail.google.com/mail/?view=cm&fs=1&su=${enc(c.subject)}&body=${enc(c.caption)}` },
  { id: "outlook", name: "Outlook", color: "#4aa3f0", icon: custom("outlook"),
    href: (c) => `https://outlook.live.com/owa/?path=/mail/action/compose&subject=${enc(c.subject)}&body=${enc(c.caption)}` },
  { id: "yahoomail", name: "Yahoo Mail", color: "#b678f0", icon: custom("yahoomail"),
    href: (c) => `https://compose.mail.yahoo.com/?subject=${enc(c.subject)}&body=${enc(c.caption)}` },
  { id: "sms", name: "SMS", color: "#34C759", icon: custom("sms"),
    href: (c) => `sms:?&body=${enc(`${c.titleHead} ${c.url}`)}` },
  { id: "line", name: "LINE", color: "#06C755", icon: brand(siLine.path),
    href: (c) => `https://social-plugins.line.me/lineit/share?url=${enc(c.url)}` },
  { id: "teams", name: "Teams", color: "#7b83eb", icon: custom("teams"),
    href: (c) => `https://teams.microsoft.com/share?href=${enc(c.url)}` },
  // Regional networks
  { id: "naver", name: "Naver", color: "#03C75A", icon: brand(siNaver.path),
    href: (c) => `https://share.naver.com/web/shareView?url=${enc(c.url)}&title=${enc(c.title)}` },
  { id: "weibo", name: "Weibo", color: "#ff4d5e", icon: brand(siSinaweibo.path),
    href: (c) => `https://service.weibo.com/share/share.php?url=${enc(c.url)}&title=${enc(c.title)}` },
  { id: "qzone", name: "QZone", color: "#FFCE00", icon: brand(siQzone.path),
    href: (c) => `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=${enc(c.url)}&title=${enc(c.title)}` },
  { id: "douban", name: "Douban", color: "#35a853", icon: brand(siDouban.path),
    href: (c) => `https://www.douban.com/share/service?href=${enc(c.url)}&name=${enc(c.title)}` },
  { id: "vk", name: "VK", color: "#2f8fff", icon: brand(siVk.path),
    href: (c) => `https://vk.com/share.php?url=${enc(c.url)}&title=${enc(c.title)}` },
  { id: "odnoklassniki", name: "Odnoklassniki", color: "#EE8208", icon: brand(siOdnoklassniki.path),
    href: (c) => `https://connect.ok.ru/offer?url=${enc(c.url)}&title=${enc(c.title)}` },
  // Bookmarking / publishing
  { id: "hackernews", name: "Hacker News", color: "#FF6600", icon: custom("hackernews"),
    href: (c) => `https://news.ycombinator.com/submitlink?u=${enc(c.url)}&t=${enc(c.title)}` },
  { id: "flipboard", name: "Flipboard", color: "#E12828", icon: brand(siFlipboard.path),
    href: (c) => `https://share.flipboard.com/bookmarklet/popout?v=2&url=${enc(c.url)}&title=${enc(c.title)}` },
  { id: "instapaper", name: "Instapaper", color: "#c9c9c9", icon: brand(siInstapaper.path),
    href: (c) => `https://www.instapaper.com/hello2?url=${enc(c.url)}&title=${enc(c.title)}` },
  { id: "evernote", name: "Evernote", color: "#2DBE60", icon: brand(siEvernote.path),
    href: (c) => `https://www.evernote.com/clip.action?url=${enc(c.url)}&title=${enc(c.title)}` },
  { id: "blogger", name: "Blogger", color: "#FF5722", icon: brand(siBlogger.path),
    href: (c) => `https://www.blogger.com/blog-this.g?u=${enc(c.url)}&n=${enc(c.title)}&t=${enc(c.caption)}` },
  { id: "wordpress", name: "WordPress", color: "#4da6cf", icon: brand(siWordpress.path),
    href: (c) => `https://wordpress.com/press-this.php?u=${enc(c.url)}&t=${enc(c.title)}` },
];
