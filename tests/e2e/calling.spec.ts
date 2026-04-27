import { expect, test } from "@playwright/test";
import {
  E2E_SHARED_SECRET,
  TEST_TIMEOUT_MS,
  createEnglishContext,
  openNewConversation,
  randomUsername,
  registerUser,
  selectUserFromNewConversation,
  waitForApiHealth,
  waitForDirectCallSnapshot,
} from "./helpers/app";

test.use({
  ignoreHTTPSErrors: true,
});

test("browser smoke: direct-call caller clears remote camera after sender turns it off", async ({
  browser,
  request,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await waitForApiHealth(request);

  const aliceContext = await createEnglishContext(browser, { syntheticMediaLabel: "alice" });
  const bobContext = await createEnglishContext(browser, { syntheticMediaLabel: "bob" });
  const aliceUsername = randomUsername("caller");
  const bobUsername = randomUsername("callee");

  try {
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    await registerUser(alicePage, aliceUsername, E2E_SHARED_SECRET);
    await registerUser(bobPage, bobUsername, E2E_SHARED_SECRET);

    await openNewConversation(alicePage);
    await selectUserFromNewConversation(alicePage, bobUsername);

    await alicePage.getByRole("button", { name: "Voice call" }).click();
    const acceptCallButton = bobPage.getByRole("button", { name: "Accept call" });
    await expect(acceptCallButton).toBeVisible({ timeout: 20_000 });
    await acceptCallButton.click();

    await waitForDirectCallSnapshot(
      alicePage,
      (snapshot) => (
        snapshot?.callActive === true &&
        snapshot.connectionState === "connected" &&
        snapshot.lifecycle?.state !== "connecting"
      ),
      30_000
    );

    await expect(bobPage.getByRole("button", { name: "End call" })).toBeVisible({ timeout: 20_000 });

    await bobPage.getByRole("button", { name: "Turn camera on" }).click();

    const callerCameraSnapshot = await waitForDirectCallSnapshot(
      alicePage,
      (snapshot) => (
        snapshot?.remoteSlots?.camera?.renderable === true &&
        snapshot.remoteSlots?.camera?.source === "camera" &&
        snapshot.remoteSlots?.screen?.renderable !== true
      ),
      30_000
    );

    expect(callerCameraSnapshot.receiverTrackBindings ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "camera" }),
      ])
    );

    await bobPage.getByRole("button", { name: "Turn camera off" }).click();

    await waitForDirectCallSnapshot(
      alicePage,
      (snapshot) => (
        snapshot?.remoteSlots?.camera?.renderable !== true &&
        snapshot.remoteSlots?.screen?.renderable !== true
      ),
      30_000
    );

    await bobPage.getByRole("button", { name: "End call" }).click();
    await expect(bobPage.getByRole("button", { name: "End call" })).toBeHidden({ timeout: 20_000 });
  } finally {
    await Promise.all([aliceContext.close(), bobContext.close()]);
  }
});

test("browser smoke: direct-call caller keeps camera and screen share on distinct slots", async ({
  browser,
  request,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await waitForApiHealth(request);

  const aliceContext = await createEnglishContext(browser, { syntheticMediaLabel: "alice" });
  const bobContext = await createEnglishContext(browser, { syntheticMediaLabel: "bob" });
  const aliceUsername = randomUsername("caller");
  const bobUsername = randomUsername("callee");

  try {
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();

    await registerUser(alicePage, aliceUsername, E2E_SHARED_SECRET);
    await registerUser(bobPage, bobUsername, E2E_SHARED_SECRET);

    await openNewConversation(alicePage);
    await selectUserFromNewConversation(alicePage, bobUsername);

    await alicePage.getByRole("button", { name: "Voice call" }).click();
    const acceptCallButton = bobPage.getByRole("button", { name: "Accept call" });
    await expect(acceptCallButton).toBeVisible({ timeout: 20_000 });
    await acceptCallButton.click();

    await waitForDirectCallSnapshot(
      alicePage,
      (snapshot) => (
        snapshot?.callActive === true &&
        snapshot.connectionState === "connected" &&
        snapshot.lifecycle?.state !== "connecting"
      ),
      30_000
    );

    await bobPage.getByRole("button", { name: "Turn camera on" }).click();

    await waitForDirectCallSnapshot(
      alicePage,
      (snapshot) => (
        snapshot?.remoteSlots?.camera?.renderable === true &&
        snapshot.remoteSlots?.camera?.source === "camera" &&
        snapshot.remoteSlots?.screen?.renderable !== true
      ),
      30_000
    );

    await bobPage.getByRole("button", { name: "Share screen" }).click();

    await waitForDirectCallSnapshot(
      alicePage,
      (snapshot) => (
        snapshot?.remoteSlots?.camera?.renderable === true &&
        snapshot.remoteSlots?.screen?.renderable === true &&
        snapshot.remoteSlots?.screen?.source === "screen"
      ),
      30_000
    );

    await bobPage.getByRole("button", { name: "Turn camera off" }).click();

    await waitForDirectCallSnapshot(
      alicePage,
      (snapshot) => (
        snapshot?.remoteSlots?.camera?.renderable !== true &&
        snapshot.remoteSlots?.screen?.renderable === true &&
        snapshot.remoteSlots?.screen?.source === "screen"
      ),
      30_000
    );

    await bobPage.getByRole("button", { name: "Stop sharing" }).click();

    await waitForDirectCallSnapshot(
      alicePage,
      (snapshot) => (
        snapshot?.remoteSlots?.camera?.renderable !== true &&
        snapshot.remoteSlots?.screen?.renderable !== true
      ),
      30_000
    );

    await bobPage.getByRole("button", { name: "End call" }).click();
    await expect(bobPage.getByRole("button", { name: "End call" })).toBeHidden({ timeout: 20_000 });
  } finally {
    await Promise.all([aliceContext.close(), bobContext.close()]);
  }
});
