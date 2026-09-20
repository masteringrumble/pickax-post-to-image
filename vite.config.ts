import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path: relative ("./") so the built site works on any host,
// including the custom domain pickax2image.top and any subpath.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
