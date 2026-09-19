import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path for GitHub Pages project site:
// https://<user>.github.io/pickax-post-to-image/
export default defineConfig({
  plugins: [react()],
  base: "/pickax-post-to-image/",
});
