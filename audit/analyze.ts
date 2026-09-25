// Audit harness: runs the EXACT production extractors against a saved post HTML.
import { extract } from "../worker/src/index";
import { extractNuxtBlock, parseNuxtPostData } from "../src/lib/nuxtPost";
import * as fs from "fs";

const [file, postId] = process.argv.slice(2);
const html = fs.readFileSync(file, "utf8");

const block = extractNuxtBlock(html);
const nuxt = block ? parseNuxtPostData(block, postId) : null;
let payload: any = null;
try {
  payload = extract(html, postId, `https://pickax.com/post/${postId}`);
} catch (e: any) {
  payload = { _extractError: String(e?.message || e) };
}

// Raw markup markers (independent of the extractors)
const raw: Record<string, any> = {
  htmlBytes: html.length,
  nuxtBlockBytes: block ? block.length : 0,
  hasPayloadKey_content: block ? /"content"/.test(block) : false,
  hasPayloadKey_createdAt: block ? /"createdAt"/.test(block) : false,
  hasPayloadKey_fullname: block ? /"fullname"/.test(block) : false,
  hasPayloadKey_avatar: block ? /"avatar"/.test(block) : false,
  hasPayloadKey_is_verified: block ? /"is_verified"/.test(block) : false,
  hasPayloadKey_creator: block ? /"creator"/.test(block) : false,
  hasPayloadKey_attachments: block ? /"attachments"/.test(block) : false,
  hasPayloadKey_link: block ? /"link"/.test(block) : false,
  hasPayloadKey_repostOf: block ? /"repostOf"/.test(block) : false,
  hasPayloadKey_inputUrl: block ? /"inputUrl"/.test(block) : false,
  roundedFullImgCount: (html.match(/<img[^>]*rounded-full/gi) || []).length,
  firstRoundedFullSrc: (html.match(/<img[^>]*rounded-full[^>]*src="([^"]+)"/i) || [])[1] || null,
  bylineNameClass: /class="[^"]*cursor-pointer inline-block overflow-clip"/.test(html),
  bylineHandleClass: /class="[^"]*text-sm[^"]*"[^>]*>@/.test(html),
  timeSpanTitle: (html.match(/@[\w.]+<\/a><span title="([^"]+)"/) || [])[1] || null,
  verifiedSealPath: html.includes("12.7893 4.26666"),
  picksGradient0083f5: /#0083f5/i.test(html),
  axesGradientDc1919: /#dc1919/i.test(html),
  viewsAriaLabel: (html.match(/aria-label="Post views:\s*([\d,]+)"/i) || [])[1] || null,
  literalIframeCount: (html.match(/<iframe/gi) || []).length,
  escapedIframeCount: (html.match(/\\u003[cC]iframe|\\u003[cC]IFRAME/gi) || []).length,
  rumbleEmbedCount: (html.match(/rumble\.com\/embed/gi) || []).length,
  rumbleCdnThumb: (html.match(/https:\/\/[a-z0-9.-]+\.cdn\.rumble\.cloud\/[^"\\\s'<>]+\.(?:jpg|jpeg|png|webp)/i) || [])[0] || null,
  metadataImgCount: (html.match(/img\.pickax\.com\/metadata\//gi) || []).length,
  imgCdnCount: (html.match(/img\.pickax\.com/gi) || []).length,
  linkCardDivTitle: /<div[^>]*title="[^"]{1,200}"[^>]*>[\s\S]{0,600}?img\.pickax\.com\/metadata/i.test(html),
  ogDescription: (html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i) || [])[1]?.slice(0, 120) || null,
  ogTitle: (html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i) || [])[1] || null,
  nonNumericIdInPayload: null as any,
};

const summary = {
  postId,
  payloadOk: payload && !payload._extractError ? true : false,
  extractError: payload?._extractError || null,
  fields: payload && !payload._extractError ? {
    displayName: payload.displayName,
    username: payload.username,
    avatarUrl: payload.avatarUrl ? payload.avatarUrl.slice(0, 90) : null,
    textLen: payload.text ? payload.text.length : 0,
    textHead: payload.text ? payload.text.slice(0, 100) : null,
    timestamp: payload.timestamp,
    timeAgo: payload.timeAgo,
    views: payload.views,
    picks: payload.picks,
    axes: payload.axes,
    verified: payload.verified,
    images: payload.images,
    video: payload.video ? { src: payload.video.src?.slice(0, 80), title: payload.video.title?.slice(0, 60), thumbnail: payload.video.thumbnail ? "YES" : null } : null,
    linkCard: payload.linkCard ? { url: payload.linkCard.url?.slice(0, 60), title: payload.linkCard.title?.slice(0, 60), domain: payload.linkCard.domain, image: payload.linkCard.imageUrl ? "YES" : null } : null,
    quoted: payload.quoted ? { postId: payload.quoted.postId, user: payload.quoted.username, textLen: payload.quoted.text?.length || 0 } : null,
    createdAtISO: nuxt ? (nuxt as any).createdAt : null,
    nuxtAuthorKeys: nuxt ? Object.keys((nuxt as any).author || {}) : null,
  } : null,
  raw,
};

console.log(JSON.stringify(summary, null, 1));
