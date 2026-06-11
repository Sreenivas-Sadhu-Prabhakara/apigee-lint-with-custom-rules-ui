import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development the UI runs on :5600 and proxies API + download traffic to
// the Rule Studio backend on :4600. In production the backend serves ui/dist.
// VITE_BASE is set by the GitHub Pages build to the repo subpath
// (e.g. "/apigee-lint-with-custom-rules-ui/"). Defaults to "/" for local use.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    port: 5600,
    proxy: {
      "/api": "http://localhost:4600",
      "/download": "http://localhost:4600",
    },
  },
  build: { outDir: "dist" },
});
