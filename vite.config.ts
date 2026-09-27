/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import fs from "node:fs";
import path from "node:path";

// The study content (plan, LSAT passages, answer keys) is never published with the app:
// in production you load it once from a file on the laptop. In development this serves the
// importer's output so testing doesn't need the file picker every time.
function devContent(): Plugin {
  return {
    name: "dev-content",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/dev-content.json", (_req, res) => {
        const file = path.resolve(__dirname, "data/gmat-content-v1.json");
        if (!fs.existsSync(file)) {
          res.statusCode = 404;
          res.end("run `npm run content` first");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; set BASE_PATH in the deploy workflow.
  base: process.env.BASE_PATH ?? "/",
  plugins: [
    react(),
    devContent(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "GMAT, one thing at a time",
        short_name: "GMAT",
        description: "Your whole GMAT plan: what's next, the questions, the review and the cards.",
        display: "standalone",
        start_url: ".",
        scope: ".",
        background_color: "#fdfbf6",
        theme_color: "#fdfbf6",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
        shortcuts: [{ name: "Bus ride", short_name: "Bus", url: "./#/?bus=1" }],
        share_target: { action: "./#/share", method: "GET", params: { url: "u", text: "t", title: "title" } },
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
