// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupCallRemoteAudioTargets } from "@/calls/group/presentation/components/GroupCallRemoteAudioTargets";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";

function createFakeMediaStream(id: string): MediaStream {
  return {
    id,
    active: true,
    getTracks: () => [],
    getAudioTracks: () => [],
    getVideoTracks: () => [],
    addTrack: () => {},
    removeTrack: () => {},
    clone: () => createFakeMediaStream(`${id}:clone`),
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    onaddtrack: null,
    onremovetrack: null,
  } as unknown as MediaStream;
}

describe("GroupCallRemoteAudioTargets", () => {
  let container: HTMLDivElement;
  let root: Root;
  let playSpy: { mockRestore: () => void };
  let loadSpy: { mockRestore: () => void };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => undefined);
    loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    playSpy.mockRestore();
    loadSpy.mockRestore();
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("renders one hidden audio target per remote participant stream", () => {
    const remoteMedia: GroupCallRemoteMedia[] = [
      {
        mediaId: "alice:camera",
        userId: "alice",
        deviceId: "alice-phone",
        hasAudio: true,
        hasVideo: true,
        audioStream: createFakeMediaStream("alice-audio"),
        videoStream: createFakeMediaStream("alice-video"),
        videoSource: "camera",
      },
      {
        mediaId: "bob:screen",
        userId: "bob",
        deviceId: "bob-laptop",
        hasAudio: false,
        hasVideo: true,
        audioStream: null,
        videoStream: createFakeMediaStream("bob-screen"),
        videoSource: "screen",
      },
      {
        mediaId: "carol:audio",
        userId: "carol",
        deviceId: null,
        hasAudio: true,
        hasVideo: false,
        audioStream: createFakeMediaStream("carol-audio"),
        videoStream: null,
        videoSource: null,
      },
    ];

    act(() => {
      root.render(<GroupCallRemoteAudioTargets remoteMedia={remoteMedia} />);
    });

    expect(
      container.querySelectorAll('[data-testid="group-call-remote-audio-target"]').length
    ).toBe(2);
  });
});
