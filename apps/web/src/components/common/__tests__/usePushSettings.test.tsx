// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  ApiErrorMock,
  deletePushSubscriptionMock,
  disablePushForBrowserMock,
  enablePushForBrowserMock,
  getPushClientStatusMock,
  getPushPreferencesMock,
  listPushSubscriptionsMock,
  translateMock,
  updatePushPreferencesMock,
} = vi.hoisted(() => ({
  ApiErrorMock: class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
  deletePushSubscriptionMock: vi.fn(),
  disablePushForBrowserMock: vi.fn(),
  enablePushForBrowserMock: vi.fn(),
  getPushClientStatusMock: vi.fn(),
  getPushPreferencesMock: vi.fn(),
  listPushSubscriptionsMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
  updatePushPreferencesMock: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: translateMock,
  }),
}));

vi.mock("@/lib/api", () => ({
  ApiError: ApiErrorMock,
  api: {
    deletePushSubscription: deletePushSubscriptionMock,
    getPushPreferences: getPushPreferencesMock,
    listPushSubscriptions: listPushSubscriptionsMock,
    updatePushPreferences: updatePushPreferencesMock,
  },
}));

vi.mock("@/lib/push", () => ({
  disablePushForBrowser: disablePushForBrowserMock,
  enablePushForBrowser: enablePushForBrowserMock,
  getPushClientStatus: getPushClientStatusMock,
}));

import { usePushSettings } from "../usePushSettings";

interface HookValue extends ReturnType<typeof usePushSettings> {}

function HookHarness(props: { hookRef: MutableRefObject<HookValue | null> }) {
  props.hookRef.current = usePushSettings();
  return null;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForHook(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) {
      return;
    }
    await act(async () => {
      await flushAsyncWork();
    });
  }

  throw new Error("Hook state did not stabilize in time");
}

describe("usePushSettings", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<HookValue | null>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };

    getPushClientStatusMock.mockReset();
    getPushPreferencesMock.mockReset();
    listPushSubscriptionsMock.mockReset();
    translateMock.mockClear();
    updatePushPreferencesMock.mockReset();
    deletePushSubscriptionMock.mockReset();
    enablePushForBrowserMock.mockReset();
    disablePushForBrowserMock.mockReset();

    getPushClientStatusMock.mockResolvedValue({
      supported: true,
      browserEnabled: true,
      permission: "granted",
      subscribed: true,
      pushConfigured: true,
      platformHint: "none",
    });
    getPushPreferencesMock.mockResolvedValue({
      directMessagesEnabled: true,
      groupMessagesEnabled: true,
      callInvitesEnabled: true,
      showSender: true,
    });
    listPushSubscriptionsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("ignores stale preference failures after a newer toggle succeeds", async () => {
    const firstUpdate = createDeferred<{
      directMessagesEnabled: boolean;
      groupMessagesEnabled: boolean;
      callInvitesEnabled: boolean;
      showSender: boolean;
    }>();
    const secondUpdate = createDeferred<{
      directMessagesEnabled: boolean;
      groupMessagesEnabled: boolean;
      callInvitesEnabled: boolean;
      showSender: boolean;
    }>();

    updatePushPreferencesMock
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(secondUpdate.promise);

    await act(async () => {
      root.render(<HookHarness hookRef={hookRef} />);
      await flushAsyncWork();
    });
    await waitForHook(() => hookRef.current?.pushStatus !== null);

    let firstTogglePromise: Promise<void> | undefined;
    await act(async () => {
      firstTogglePromise = hookRef.current?.handlePreferenceToggle("directMessagesEnabled", "off");
      await Promise.resolve();
    });

    expect(hookRef.current?.pushPreferences).toMatchObject({
      directMessagesEnabled: false,
      groupMessagesEnabled: true,
      callInvitesEnabled: true,
      showSender: true,
    });
    expect(hookRef.current?.pushBusy).toBe(true);

    let secondTogglePromise: Promise<void> | undefined;
    await act(async () => {
      secondTogglePromise = hookRef.current?.handlePreferenceToggle("groupMessagesEnabled", "off");
      await Promise.resolve();
    });

    expect(hookRef.current?.pushPreferences).toMatchObject({
      directMessagesEnabled: false,
      groupMessagesEnabled: false,
      callInvitesEnabled: true,
      showSender: true,
    });

    await act(async () => {
      secondUpdate.resolve({
        directMessagesEnabled: false,
        groupMessagesEnabled: false,
        callInvitesEnabled: true,
        showSender: true,
      });
      await secondTogglePromise;
    });

    expect(hookRef.current?.pushPreferences).toMatchObject({
      directMessagesEnabled: false,
      groupMessagesEnabled: false,
      callInvitesEnabled: true,
      showSender: true,
    });
    expect(hookRef.current?.pushBusy).toBe(false);
    expect(hookRef.current?.pushError).toBeNull();

    await act(async () => {
      firstUpdate.reject(new Error("stale request failed"));
      await firstTogglePromise;
    });

    expect(hookRef.current?.pushPreferences).toMatchObject({
      directMessagesEnabled: false,
      groupMessagesEnabled: false,
      callInvitesEnabled: true,
      showSender: true,
    });
    expect(hookRef.current?.pushBusy).toBe(false);
    expect(hookRef.current?.pushError).toBeNull();
  });
});
