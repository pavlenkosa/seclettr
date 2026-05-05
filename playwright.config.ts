import { defineConfig, devices } from "@playwright/test";

const useExternalStack = process.env["SECLETTR_E2E_EXTERNAL_STACK"] === "1";
const baseURL = process.env["BASE_URL"]
  ?? (useExternalStack ? "https://127.0.0.1:5175" : "http://localhost:5173");

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  retries: process.env["CI"] ? 2 : 0,
  workers: 1, // Sequential — tests share state between Alice and Bob contexts
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["camera", "microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
      },
    },
  ],
  // Start local web/api processes only for the lightweight raw Playwright mode.
  webServer: process.env["CI"] || useExternalStack ? undefined : [
    {
      command: "pnpm --filter @seclettr/api dev",
      url: "http://localhost:3001/health",
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        DATABASE_URL: "postgresql://seclettr:changeme@localhost:5432/seclettr",
        REDIS_URL: "redis://localhost:6379",
        JWT_SECRET: "test-secret-at-least-32-chars-long!!",
        NODE_ENV: "test",
      },
    },
    {
      command: "pnpm --filter @seclettr/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
