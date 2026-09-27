/**
 * inlineCss.mjs — post-build step: inline dist/assets/*.css into index.html.
 *
 * PageSpeed flags the app's own stylesheet as render-blocking. It's ~9KB,
 * so inlining it removes the extra request with no visual change.
 * Only touches <link rel="stylesheet"> tags pointing at ./assets/*.css —
 * the Google Fonts links (media="print") are left alone.
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

const dist = "dist";
const assetsDir = join(dist, "assets");
const htmlPath = join(dist, "index.html");

let html = readFileSync(htmlPath, "utf8");
const cssFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".css"));
if (cssFiles.length === 0) {
  console.log("inlineCss: no css files found, skipping");
  process.exit(0);
}

let combined = "";
for (const f of cssFiles) {
  combined += readFileSync(join(assetsDir, f), "utf8") + "\n";
  unlinkSync(join(assetsDir, f));
}

// Match <link ... rel="stylesheet" ... href="./assets/*.css" ...> in any
// attribute order; leave all other stylesheet links (Google Fonts) intact.
const cssLinkRe =
  /<link\b(?=[^>]*rel="stylesheet")(?=[^>]*href="\.\/assets\/[^"]*\.css")[^>]*>/g;
const removed = (html.match(cssLinkRe) || []).length;
html = html.replace(cssLinkRe, "");
html = html.replace("</head>", `<style>${combined}</style>\n</head>`);

writeFileSync(htmlPath, html);
console.log(
  `inlineCss: inlined ${cssFiles.length} file(s) (${combined.length} chars), removed ${removed} link tag(s)`
);
