import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { installSyntheticMedia } from "./fake-media";

export const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:5173";
export const API_URL = process.env["API_URL"] ?? "http://localhost:3001";
const E2E_SHARED_SECRET_FALLBACK = `e2e-${Math.random().toString(36).slice(2, 12)}-A9!`;
export const E2E_SHARED_SECRET =
  process.env["E2E_SHARED_SECRET"] ?? E2E_SHARED_SECRET_FALLBACK;
export const TEST_TIMEOUT_MS = 120_000;

type CallDebugSnapshot = Record<string, unknown> & {
  callActive?: boolean;
  connectionState?: string | null;
  remoteSlots?: {
    camera?: { renderable?: boolean; source?: string | null };
    screen?: { renderable?: boolean; source?: string | null };
  };
  remoteMedia?: Array<{
    userId?: string | null;
    hasVideo?: boolean;
    videoSource?: string | null;
  }>;
  lifecycle?: {
    state?: string | null;
  };
};

export function randomUsername(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createEnglishContext(
  browser: Browser,
  options?: { syntheticMediaLabel?: string }
): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem("seclettr.locale.v1", "en");
  });
  if (options?.syntheticMediaLabel) {
    await installSyntheticMedia(context, { label: options.syntheticMediaLabel });
  }
  return context;
}

export async function waitForApiHealth(request: APIRequestContext): Promise<void> {
  const healthResponse = await request.get(`${API_URL}/health`);
  expect(healthResponse.ok()).toBe(true);
  const healthBody = (await healthResponse.json()) as {
    status: string;
    db?: boolean;
    redis?: boolean;
  };
  expect(healthBody.status).toBe("ok");
  if ("db" in healthBody) {
    expect(healthBody.db).toBe(true);
  }
  if ("redis" in healthBody) {
    expect(healthBody.redis).toBe(true);
  }
}

export async function waitForChatHome(page: Page): Promise<void> {
  await expect(page.getByTestId("chat-sidebar")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "New conversation" })
  ).toBeVisible({ timeout: 30_000 });
}

export function getChatSidebar(page: Page) {
  return page.getByTestId("chat-sidebar");
}

export function getChatMessageList(page: Page) {
  return page.getByTestId("chat-message-list");
}

export async function registerUser(
  page: Page,
  username: string,
  password: string
): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/auth/, { timeout: TEST_TIMEOUT_MS });
  await page.getByRole("button", { name: "Create one" }).click();
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await waitForChatHome(page);
}

export async function openNewConversation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search by username..." })
  ).toBeVisible({ timeout: 10_000 });
}

export async function selectUserFromNewConversation(
  page: Page,
  fullUsername: string
): Promise<void> {
  const searchInput = page.getByRole("searchbox", {
    name: "Search by username...",
  });

  await searchInput.fill(fullUsername.slice(0, 3));
  await expect(page.getByText("No users found")).toBeVisible({
    timeout: 10_000,
  });

  await searchInput.fill(fullUsername);
  const userOption = page.locator("[role='option']").filter({
    hasText: fullUsername,
  });
  await expect(userOption).toHaveCount(1, { timeout: 10_000 });
  await userOption.first().click();
}

export async function openConversationFromSidebar(
  page: Page,
  username: string
): Promise<void> {
  const conversationEntry = getChatSidebar(page).getByRole("option").filter({
    hasText: username,
  });
  await expect(conversationEntry.first()).toBeVisible({ timeout: 20_000 });
  await conversationEntry.first().click();
}

export async function sendDirectMessage(page: Page, content: string): Promise<void> {
  const composer = page.getByRole("textbox", { name: "Type a message" });
  await composer.fill(content);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    getChatMessageList(page).getByText(content, { exact: true })
  ).toBeVisible({ timeout: 15_000 });
}

export async function expectMessageVisible(page: Page, content: string): Promise<void> {
  await expect(
    getChatMessageList(page).getByText(content, { exact: true })
  ).toBeVisible({ timeout: 20_000 });
}

export async function readCallDebugSnapshot(page: Page): Promise<CallDebugSnapshot | null> {
  return page.evaluate(async () => {
    const callDebugWindow = window as Window & {
      __scGetCallDebugSnapshot?: () => Promise<Record<string, unknown> | null>;
    };
    return (await callDebugWindow.__scGetCallDebugSnapshot?.()) ?? null;
  });
}

export async function waitForDirectCallSnapshot(
  page: Page,
  predicate: (snapshot: CallDebugSnapshot | null) => boolean,
  timeoutMs = 30_000
): Promise<CallDebugSnapshot> {
  let latestSnapshot: CallDebugSnapshot | null = null;
  try {
    await expect.poll(async () => {
      latestSnapshot = await readCallDebugSnapshot(page);
      return predicate(latestSnapshot);
    }, { timeout: timeoutMs }).toBe(true);
  } catch (error) {
    const serializedSnapshot = latestSnapshot
      ? JSON.stringify(latestSnapshot, null, 2)
      : "null";
    throw new Error(
      `Timed out waiting for direct-call snapshot predicate.\nLast snapshot:\n${serializedSnapshot}`,
      { cause: error }
    );
  }
  if (!latestSnapshot) {
    throw new Error("Expected direct-call debug snapshot");
  }
  return latestSnapshot;
}
