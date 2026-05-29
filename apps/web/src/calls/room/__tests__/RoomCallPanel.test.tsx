// @vitest-environment jsdom
//
// Smoke test only — RoomCallPanel mounts via createPortal + has async getUserMedia/SFU
// bootstrap that make deep state testing impractical without integration fixtures.
// Follow-up: T-DIRECT-20260529-08 (pending creation) should add state-level tests
// once SFU/media mocking helpers exist.

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/hooks", () => ({
  useIsMobileViewport: () => false,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getRoomParticipants: async () => ({ participants: [] }),
    joinRoomPresence: async () => {},
    leaveRoomPresence: async () => {},
    closeRoom: async () => {},
    kickRoomGuest: async () => {},
  },
}));

vi.mock("@/calls/room/room-call-bootstrap", () => ({
  joinRoomAndStartSfu: async () =>
    new Promise(() => {}) as never,
}));

vi.mock("@/calls/shared/media/input-devices/useCallInputDevices", () => ({
  useCallInputDevices: () => ({
    micDevices: [],
    cameraDevices: [],
    selectedMicId: null,
    selectedCameraId: null,
    isLoading: false,
    selectMic: async () => {},
    selectCamera: async () => {},
    refreshDevices: async () => {},
  }),
}));

vi.mock("@/calls/shared/media/audio-output/CallAudioOutputProvider", () => ({
  CallAudioOutputProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useCallAudioOutput: () => ({
    support: "unsupported" as const,
    options: [],
    isLoading: false,
    isPromptingDeviceSelection: false,
    canPromptForDevices: false,
    isAndroidBrowserManagedOutput: false,
    error: null,
    selectedPreference: "system" as const,
    setSelectedPreference: async () => {},
    requestDeviceSelection: async () => {},
    registerAudioElement: () => () => {},
  }),
  useOptionalCallAudioOutput: () => null,
  useRegisterCallAudioOutputTarget: () => {},
}));

vi.mock("@/calls/shared/media/audio-output/useNativeSpeakerToggle", () => ({
  useNativeSpeakerToggle: () => ({ supported: false, speakerOn: false, toggle: vi.fn() }),
}));

import { RoomCallPanel } from "@/calls/room/RoomCallPanel";
import type { RoomCallSession } from "@/calls/room/room-call-bootstrap";

function makeSession(overrides?: Partial<RoomCallSession>): RoomCallSession {
  return {
    callId: "test-room-id",
    callType: "audio",
    participantId: "participant-1",
    deviceId: "device-1",
    displayName: "Test User",
    isGuest: false,
    isHost: false,
    guestToken: null,
    sfuBaseUrl: null,
    inviteUrl: null,
    ...overrides,
  };
}

describe("RoomCallPanel", () => {
  let root: Root;
  let mountNode: HTMLDivElement;
  const originalGetUserMedia = globalThis.navigator?.mediaDevices?.getUserMedia;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(() => new Promise<MediaStream>(() => {})),
        enumerateDevices: vi.fn(async () => []),
        getDisplayMedia: undefined,
      },
      configurable: true,
      writable: true,
    });
    mountNode = document.createElement("div");
    document.body.appendChild(mountNode);
    root = createRoot(mountNode);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    mountNode.remove();
    if (originalGetUserMedia !== undefined) {
      Object.defineProperty(globalThis.navigator, "mediaDevices", {
        value: { getUserMedia: originalGetUserMedia },
        configurable: true,
        writable: true,
      });
    }
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("mounts and renders the call panel shell in the document body", () => {
    act(() => {
      root.render(<RoomCallPanel session={makeSession()} onLeave={vi.fn()} />);
    });

    // RoomCallPanel uses createPortal — content lands in document.body, not mountNode.
    // CallPanelShell renders <dialog open aria-modal="true" aria-label={t("room.call.title")}>.
    const panel = document.body.querySelector('dialog[aria-modal="true"]');
    expect(panel).not.toBeNull();
  });

  it("shows the host invite card when session has inviteUrl and isHost", () => {
    act(() => {
      root.render(
        <RoomCallPanel
          session={makeSession({ isHost: true, inviteUrl: "https://s.lettr/invite/xyz" })}
          onLeave={vi.fn()}
        />
      );
    });

    expect(document.body.textContent).toContain("https://s.lettr/invite/xyz");
  });
});
