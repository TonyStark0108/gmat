import { defineConfig } from "@playwright/test";

// End-to-end tests: the installable build, driven in a real Chromium the way you'd use it.
// They need the study file (data/gmat-content-v1.json), so they run on the laptop, not on GitHub.
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e-report/html", open: "never" }]],
  use: {
    baseURL: "http://localhost:4175/",
    viewport: { width: 1366, height: 768 },
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4175 --strictPort",
    url: "http://localhost:4175/",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
