import { chromium, type ConsoleMessage } from "@playwright/test";

const BASE_URL = process.env["BASE_URL"] ?? "https://127.0.0.1:5175";
const WARMUP_TIMEOUT_MS = 60_000;

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

  const consoleLogs: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    const text = `[browser:${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    console.log(text);
  });
  page.on("pageerror", (err: Error) => {
    const text = `[browser:error] ${err.message}`;
    consoleLogs.push(text);
    console.error(text);
  });
  page.on("requestfailed", (req) => {
    const text = `[browser:requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`;
    consoleLogs.push(text);
    console.warn(text);
  });

  try {
    console.log(`[global-setup] Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: WARMUP_TIMEOUT_MS });
    console.log(`[global-setup] DOM loaded, current URL: ${page.url()}`);
    await page.waitForURL(/\/auth/, { timeout: WARMUP_TIMEOUT_MS });
    console.log(`[global-setup] Vite warm-up complete — app is at /auth`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lastUrl = page.url();
    console.error(`[global-setup] FAILED: warm-up did not reach /auth — ${msg}`);
    console.error(`[global-setup] Last URL: ${lastUrl}`);
    // Screenshot for CI artifacts (saved to playwright-report/ via trace).
    await page.screenshot({ path: "/tmp/global-setup-failure.png", fullPage: true });
    if (consoleLogs.length > 0) {
      console.error(`[global-setup] Browser logs (last 30):\n${consoleLogs.slice(-30).join("\n")}`);
    }
    throw new Error(
      `SPA did not reach /auth. Last URL: ${lastUrl}. ` +
      `Console logs:\n${consoleLogs.slice(-30).join("\n")}`
    );
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}
