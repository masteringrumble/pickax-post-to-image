// After `vite build`, copy dist/index.html to dist/404.html so that
// refreshing any path on the GitHub Pages project site still loads the app.
import { copyFileSync, existsSync } from "node:fs";

if (!existsSync("dist/index.html")) {
  console.error("dist/index.html not found; run `vite build` first.");
  process.exit(1);
}
copyFileSync("dist/index.html", "dist/404.html");
console.log("copied dist/index.html -> dist/404.html");
