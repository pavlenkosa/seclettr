// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { NotificationsSettingsSection } from "./NotificationsSettingsSection";

describe("NotificationsSettingsSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("dispatches preference and device actions without relying on modal shell state", () => {
    const onBrowserPushToggle = vi.fn().mockResolvedValue(undefined);
    const onDeletePushSubscription = vi.fn().mockResolvedValue(undefined);
    const onPreferenceToggle = vi.fn().mockResolvedValue(undefined);

    act(() => {
      root.render(
        <NotificationsSettingsSection
          pushStatusLabel="ready"
          browserPushValue="on"
          browserPushDisabled={false}
          pushPreferences={{
            directMessagesEnabled: true,
            groupMessagesEnabled: true,
            callInvitesEnabled: true,
            showSender: true,
          }}
          pushSubscriptions={[
            {
              id: "sub-1",
              endpoint: "https://push.example/sub-1",
              userAgent: "Chrome on macOS",
              currentDevice: true,
              createdAt: "2026-04-10T08:00:00.000Z",
              updatedAt: "2026-04-10T09:00:00.000Z",
              lastErrorAt: null,
              lastSuccessAt: "2026-04-10T09:00:00.000Z",
            },
          ]}
          pushBusy={false}
          onBrowserPushToggle={onBrowserPushToggle}
          onDeletePushSubscription={onDeletePushSubscription}
          onPreferenceToggle={onPreferenceToggle}
        />
      );
    });

    const browserPushGroup = document.body.querySelector<HTMLElement>('[aria-label="settings.push.browser"]');
    const directMessagesGroup = document.body.querySelector<HTMLElement>('[aria-label="settings.push.directMessages"]');
    const revokeButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "settings.push.devices.revoke"
    );

    expect(browserPushGroup).not.toBeNull();
    expect(directMessagesGroup).not.toBeNull();
    expect(revokeButton).not.toBeUndefined();

    const browserPushButtons = browserPushGroup?.querySelectorAll<HTMLButtonElement>("button");
    const directMessagesButtons = directMessagesGroup?.querySelectorAll<HTMLButtonElement>("button");

    act(() => {
      browserPushButtons?.[1]?.click();
      directMessagesButtons?.[1]?.click();
      revokeButton?.click();
    });

    expect(onBrowserPushToggle).toHaveBeenCalledWith("off");
    expect(onPreferenceToggle).toHaveBeenCalledWith("directMessagesEnabled", "off");
    expect(onDeletePushSubscription).toHaveBeenCalledWith("sub-1");
  });
});
