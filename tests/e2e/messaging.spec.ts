import {
  expect,
  test,
} from "@playwright/test";
import {
  API_URL,
  BASE_URL,
  E2E_SHARED_SECRET,
  TEST_TIMEOUT_MS,
  createEnglishContext,
  getChatMessageList,
  expectMessageVisible,
  openConversationFromSidebar,
  openNewConversation,
  randomUsername,
  registerUser,
  selectUserFromNewConversation,
  sendDirectMessage,
  waitForApiHealth,
  waitForChatHome,
} from "./helpers/app";

test.use({
  ignoreHTTPSErrors: true,
});

test("browser smoke: first-contact messaging survives replay and direct-call signaling", async ({
  browser,
  request,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);

  await waitForApiHealth(request);

  const metricsResponse = await request.get(`${API_URL}/metrics`);
  expect(metricsResponse.ok()).toBe(true);
  const metricsText = await metricsResponse.text();
  expect(metricsText).toContain("seclettr_http_requests_total");
  expect(metricsText).toContain('seclettr_api_health{dependency="db"} 1');

  const aliceContext = await createEnglishContext(browser, { syntheticMediaLabel: "alice" });
  const bobContext = await createEnglishContext(browser, { syntheticMediaLabel: "bob" });
  const aliceUsername = randomUsername("alice");
  const bobUsername = randomUsername("bob");

  try {
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    await registerUser(alicePage, aliceUsername, E2E_SHARED_SECRET);
    await registerUser(bobPage, bobUsername, E2E_SHARED_SECRET);

    await openNewConversation(alicePage);
    await selectUserFromNewConversation(alicePage, bobUsername);

    const firstMessage = `first-contact-${Date.now()}`;
    await sendDirectMessage(alicePage, firstMessage);

    await openConversationFromSidebar(bobPage, aliceUsername);
    await expectMessageVisible(bobPage, firstMessage);

    await bobPage.close();

    const offlineReplayMessage = `offline-replay-${Date.now()}`;
    await sendDirectMessage(alicePage, offlineReplayMessage);

    const bobReplayPage = await bobContext.newPage();
    await bobReplayPage.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await waitForChatHome(bobReplayPage);
    await openConversationFromSidebar(bobReplayPage, aliceUsername);
    await expectMessageVisible(bobReplayPage, firstMessage);
    await expectMessageVisible(bobReplayPage, offlineReplayMessage);

    await alicePage.getByRole("button", { name: "Voice call" }).click();
    const rejectCallButton = bobReplayPage.getByRole("button", {
      name: "Reject call",
    });
    await expect(rejectCallButton).toBeVisible({ timeout: 20_000 });
    await rejectCallButton.click();
    await expect(rejectCallButton).toBeHidden({ timeout: 20_000 });

    await bobReplayPage.close();
    await alicePage.close();
  } finally {
    await Promise.all([aliceContext.close(), bobContext.close()]);
  }
});

test("browser smoke: switching direct threads clears unsent composer draft", async ({
  browser,
  request,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);

  await waitForApiHealth(request);

  const aliceContext = await createEnglishContext(browser, { syntheticMediaLabel: "alice" });
  const bobContext = await createEnglishContext(browser, { syntheticMediaLabel: "bob" });
  const carolContext = await createEnglishContext(browser, { syntheticMediaLabel: "carol" });
  const aliceUsername = randomUsername("alice");
  const bobUsername = randomUsername("bob");
  const carolUsername = randomUsername("carol");

  try {
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();
    const carolPage = await carolContext.newPage();

    await registerUser(alicePage, aliceUsername, E2E_SHARED_SECRET);
    await registerUser(bobPage, bobUsername, E2E_SHARED_SECRET);
    await registerUser(carolPage, carolUsername, E2E_SHARED_SECRET);

    await openNewConversation(alicePage);
    await selectUserFromNewConversation(alicePage, bobUsername);

    const composer = alicePage.getByRole("textbox", { name: "Type a message" });
    await composer.fill(`draft-${Date.now()}`);

    await openNewConversation(alicePage);
    await selectUserFromNewConversation(alicePage, carolUsername);

    await expect(composer).toHaveValue("", { timeout: 10_000 });
    await expect(getChatMessageList(alicePage)).toBeVisible({ timeout: 10_000 });
  } finally {
    await Promise.all([
      aliceContext.close(),
      bobContext.close(),
      carolContext.close(),
    ]);
  }
});
