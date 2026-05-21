// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authStoreState = vi.hoisted(() => ({
  authLifecycle: "ready" as const,
  pinEnabled: false,
  storageKeyVolatile: false,
  setPinMock: vi.fn(),
  removePinMock: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: (
    selector: (state: {
      authLifecycle: "ready" | "locked" | "restoring" | "signed_out" | "recovery_required";
      pinEnabled: boolean;
      storageKeyVolatile: boolean;
      setPin: typeof authStoreState.setPinMock;
      removePin: typeof authStoreState.removePinMock;
    }) => unknown
  ) => selector({
    authLifecycle: authStoreState.authLifecycle,
    pinEnabled: authStoreState.pinEnabled,
    storageKeyVolatile: authStoreState.storageKeyVolatile,
    setPin: authStoreState.setPinMock,
    removePin: authStoreState.removePinMock,
  }),
}));

import { SecuritySettingsSection } from "../SecuritySettingsSection";

function updateTextInput(input: HTMLInputElement, nextValue: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement.prototype,
    "value"
  )?.set;
  valueSetter?.call(input, nextValue);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("SecuritySettingsSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    authStoreState.authLifecycle = "ready";
    authStoreState.pinEnabled = false;
    authStoreState.storageKeyVolatile = false;
    authStoreState.setPinMock.mockReset();
    authStoreState.removePinMock.mockReset();
    authStoreState.setPinMock.mockResolvedValue(undefined);
    authStoreState.removePinMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("updates call security controls and app-lock PIN flow independently", async () => {
    const setCallSecurityMode = vi.fn();
    const setAutoDecryptMedia = vi.fn();

    act(() => {
      root.render(
        <SecuritySettingsSection
          callSecurityMode="balanced"
          autoDecryptMedia="on"
          setCallSecurityMode={setCallSecurityMode}
          setAutoDecryptMedia={setAutoDecryptMedia}
        />
      );
    });

    const strictButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "settings.callSecurity.strict"
    );
    const autoDecryptOffButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "settings.autoDecryptMedia.off"
    );
    const setPinButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "settings.appLock.setPin"
    );

    expect(strictButton).not.toBeUndefined();
    expect(autoDecryptOffButton).not.toBeUndefined();
    expect(setPinButton).not.toBeUndefined();

    act(() => {
      strictButton?.click();
      autoDecryptOffButton?.click();
      setPinButton?.click();
    });

    const newPinInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="settings.appLock.pinEntry.new"]'
    );
    const confirmPinInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="settings.appLock.pinEntry.confirm"]'
    );
    const savePinButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "settings.appLock.pinEntry.save"
    );

    expect(newPinInput).not.toBeNull();
    expect(confirmPinInput).not.toBeNull();
    expect(savePinButton).not.toBeUndefined();

    act(() => {
      if (newPinInput) {
        updateTextInput(newPinInput, "1234");
      }
      if (confirmPinInput) {
        updateTextInput(confirmPinInput, "1234");
      }
    });

    await act(async () => {
      savePinButton?.click();
      await Promise.resolve();
    });

    expect(setCallSecurityMode).toHaveBeenCalledWith("strict");
    expect(setAutoDecryptMedia).toHaveBeenCalledWith("off");
    expect(authStoreState.setPinMock).toHaveBeenCalledWith("1234");
  });

  it("surfaces PIN persistence failures instead of failing silently", async () => {
    authStoreState.setPinMock.mockRejectedValue(new Error("storage_key_lock_persist_failed"));

    act(() => {
      root.render(
        <SecuritySettingsSection
          callSecurityMode="balanced"
          autoDecryptMedia="on"
          setCallSecurityMode={vi.fn()}
          setAutoDecryptMedia={vi.fn()}
        />
      );
    });

    const setPinButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "settings.appLock.setPin"
    );

    act(() => {
      setPinButton?.click();
    });

    const newPinInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="settings.appLock.pinEntry.new"]'
    );
    const confirmPinInput = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="settings.appLock.pinEntry.confirm"]'
    );
    const savePinButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "settings.appLock.pinEntry.save"
    );

    act(() => {
      if (newPinInput) updateTextInput(newPinInput, "1234");
      if (confirmPinInput) updateTextInput(confirmPinInput, "1234");
    });

    await act(async () => {
      savePinButton?.click();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("settings.appLock.pinEntry.persistenceUnavailable");
  });

  it("disables PIN setup when secure local persistence is unavailable", () => {
    authStoreState.storageKeyVolatile = true;

    act(() => {
      root.render(
        <SecuritySettingsSection
          callSecurityMode="balanced"
          autoDecryptMedia="on"
          setCallSecurityMode={vi.fn()}
          setAutoDecryptMedia={vi.fn()}
        />
      );
    });

    const setPinButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "settings.appLock.setPin"
    );

    expect(setPinButton?.disabled).toBe(true);
    expect(document.body.textContent).toContain("settings.appLock.pinEntry.persistenceUnavailable");
  });
});
