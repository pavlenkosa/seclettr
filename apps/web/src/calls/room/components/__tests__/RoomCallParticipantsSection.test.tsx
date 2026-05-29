// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomCallParticipantsSection } from "@/calls/room/components/RoomCallParticipantsSection";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/calls/shared/media/audio-output/useNativeSpeakerToggle", () => ({
  useNativeSpeakerToggle: () => ({ supported: false, speakerOn: false, toggle: vi.fn() }),
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
}));

function makeParticipant(id: string, displayName: string, isGuest: boolean) {
  return { id, displayName, isGuest };
}

describe("RoomCallParticipantsSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("renders participant display names", () => {
    act(() => {
      root.render(
        <RoomCallParticipantsSection
          participants={[
            makeParticipant("u1", "Alice", false),
            makeParticipant("u2", "Bob", true),
          ]}
          isHost={false}
          kickingId={null}
          onKickGuest={vi.fn()}
          onEndForEveryone={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("Alice");
    expect(container.textContent).toContain("Bob");
  });

  it("shows the empty notice when participant list is empty", () => {
    act(() => {
      root.render(
        <RoomCallParticipantsSection
          participants={[]}
          isHost={false}
          kickingId={null}
          onKickGuest={vi.fn()}
          onEndForEveryone={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("room.call.participants.empty");
  });

  it("shows the end-for-everyone button only when user is host", () => {
    act(() => {
      root.render(
        <RoomCallParticipantsSection
          participants={[]}
          isHost={true}
          kickingId={null}
          onKickGuest={vi.fn()}
          onEndForEveryone={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("group.call.endForEveryone");
  });

  it("does not show the end-for-everyone button for non-host", () => {
    act(() => {
      root.render(
        <RoomCallParticipantsSection
          participants={[]}
          isHost={false}
          kickingId={null}
          onKickGuest={vi.fn()}
          onEndForEveryone={vi.fn()}
        />
      );
    });

    expect(container.textContent).not.toContain("group.call.endForEveryone");
  });

  it("calls onEndForEveryone when the host clicks the end button", () => {
    const onEndForEveryone = vi.fn();
    act(() => {
      root.render(
        <RoomCallParticipantsSection
          participants={[]}
          isHost={true}
          kickingId={null}
          onKickGuest={vi.fn()}
          onEndForEveryone={onEndForEveryone}
        />
      );
    });

    const buttons = container.querySelectorAll("button");
    const endBtn = Array.from(buttons).find((b) => b.textContent?.includes("group.call.endForEveryone"));
    expect(endBtn).not.toBeUndefined();

    act(() => {
      endBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onEndForEveryone).toHaveBeenCalledTimes(1);
  });
});
