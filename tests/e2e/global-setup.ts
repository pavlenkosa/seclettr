import { chromium } from "@playwright/test";

const BASE_URL = process.env["BASE_URL"] ?? "https://127.0.0.1:5175";
const WARMUP_TIMEOUT_MS = 180_000;

export default async function globalSetup(): Promise<void> {
  if (process.env["SECLETTR_E2E_EXTERNAL_STACK"] !== "1") {
    return;
  }

  // Vite lazily compiles the module graph on first browser request. In CI the
  // cold compile of libsodium WASM and mediasoup can take >60 s. Navigate to
  // the app once here and wait for the /auth redirect before tests begin, so
  // that individual tests don't race against first-compile latency.
  const browser = await chromium.launch({
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: WARMUP_TIMEOUT_MS });
    await page.waitForURL(/\/auth/, { timeout: WARMUP_TIMEOUT_MS });
    console.log(`[global-setup] Vite warm-up complete — app is at /auth`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[global-setup] Warm-up navigation did not reach /auth: ${msg}`);
    // Non-fatal: individual tests will surface the real failure with better context.
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}
