// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentMessageMeta } from "@/stores/messages";

const {
  apiGetMock,
  decryptAttachmentMock,
  fromBase64UrlMock,
  createObjectUrlMock,
  revokeObjectUrlMock,
} = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  decryptAttachmentMock: vi.fn(),
  fromBase64UrlMock: vi.fn(() => new Uint8Array([1, 2, 3])),
  createObjectUrlMock: vi.fn(() => "blob:video-note"),
  revokeObjectUrlMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: apiGetMock,
  },
}));

vi.mock("@seclettr/crypto", () => ({
  decryptAttachment: decryptAttachmentMock,
  fromBase64Url: fromBase64UrlMock,
}));

import { useVideoNoteAttachmentRuntime } from "../useVideoNoteAttachmentRuntime";

interface HookValue extends ReturnType<typeof useVideoNoteAttachmentRuntime> {}

const attachment: AttachmentMessageMeta = {
  attachmentId: "att-2",
  key: "key",
  digest: "digest",
  mimeType: "video/webm",
  size: 256,
  kind: "video_note",
  durationMs: 4_000,
};

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  activeMediaKey: string | null;
}) {
  const runtime = useVideoNoteAttachmentRuntime({
    attachment,
    messageId: "msg-2",
    mediaKey: "video:msg-2",
    activeMediaKey: props.activeMediaKey,
    onActiveMediaChange: vi.fn(),
  });

  props.hookRef.current = runtime;
  return <video ref={runtime.videoRef} />;
}

describe("useVideoNoteAttachmentRuntime", () => {
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
    apiGetMock.mockReset();
    decryptAttachmentMock.mockReset();
    fromBase64UrlMock.mockClear();
    createObjectUrlMock.mockClear();
    revokeObjectUrlMock.mockClear();
    apiGetMock.mockResolvedValue({
      ciphertext: "ciphertext",
      encryptedDigest: "digest",
    });
    decryptAttachmentMock.mockResolvedValue(new Uint8Array([8, 8, 8]));
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("decrypts and starts playback on demand", async () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} activeMediaKey={null} />);
    });

    const video = hookRef.current?.videoRef.current;
    expect(video).not.toBeNull();

    let paused = true;
    Object.defineProperty(video!, "paused", {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(video!, "play", {
      configurable: true,
      value: vi.fn(async () => {
        paused = false;
        video!.dispatchEvent(new Event("play"));
        video!.dispatchEvent(new Event("loadedmetadata"));
      }),
    });
    Object.defineProperty(video!, "pause", {
      configurable: true,
      value: vi.fn(() => {
        paused = true;
        video!.dispatchEvent(new Event("pause"));
      }),
    });

    await act(async () => {
      await hookRef.current?.loadAndMaybePlay(true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(apiGetMock).toHaveBeenCalledTimes(1);
    expect(decryptAttachmentMock).toHaveBeenCalledTimes(1);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    expect(video!.play).toHaveBeenCalledTimes(1);
    expect(hookRef.current?.videoUrl).toBe("blob:video-note");
  });

  it("pauses on external active-media switch and revokes URL on cleanup", async () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} activeMediaKey={null} />);
    });

    const video = hookRef.current?.videoRef.current;
    expect(video).not.toBeNull();

    let paused = true;
    const pauseSpy = vi.fn(() => {
      paused = true;
      video!.dispatchEvent(new Event("pause"));
    });
    Object.defineProperty(video!, "paused", {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(video!, "play", {
      configurable: true,
      value: vi.fn(async () => {
        paused = false;
        video!.dispatchEvent(new Event("play"));
      }),
    });
    Object.defineProperty(video!, "pause", {
      configurable: true,
      value: pauseSpy,
    });

    await act(async () => {
      await hookRef.current?.loadAndMaybePlay(true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} activeMediaKey="video:other" />);
    });

    expect(pauseSpy).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });

    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:video-note");
  });
});
