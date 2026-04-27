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
  decodeAudioWaveformMock,
} = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  decryptAttachmentMock: vi.fn(),
  fromBase64UrlMock: vi.fn(() => new Uint8Array([1, 2, 3])),
  createObjectUrlMock: vi.fn(() => "blob:voice-note"),
  revokeObjectUrlMock: vi.fn(),
  decodeAudioWaveformMock: vi.fn(async () => [4, 8, 12]),
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

vi.mock("@/chats/presentation/shared/audio-waveform", () => ({
  PLAYBACK_WAVEFORM_BAR_COUNT: 3,
  createFallbackWaveform: () => [1, 1, 1],
  decodeAudioWaveform: decodeAudioWaveformMock,
}));

import { useVoiceNoteAttachmentRuntime } from "../useVoiceNoteAttachmentRuntime";

interface HookValue extends ReturnType<typeof useVoiceNoteAttachmentRuntime> {}

const attachment: AttachmentMessageMeta = {
  attachmentId: "att-1",
  key: "key",
  digest: "digest",
  mimeType: "audio/ogg",
  size: 128,
  kind: "voice_note",
  durationMs: 3_000,
};

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
  activeMediaKey: string | null;
}) {
  const runtime = useVoiceNoteAttachmentRuntime({
    attachment,
    messageId: "msg-1",
    mediaKey: "voice:msg-1",
    activeMediaKey: props.activeMediaKey,
    onActiveMediaChange: vi.fn(),
  });

  props.hookRef.current = runtime;
  return <audio ref={runtime.audioRef} />;
}

describe("useVoiceNoteAttachmentRuntime", () => {
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
    decodeAudioWaveformMock.mockClear();
    apiGetMock.mockResolvedValue({
      ciphertext: "ciphertext",
      encryptedDigest: "digest",
    });
    decryptAttachmentMock.mockResolvedValue(new Uint8Array([9, 9, 9]));
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

  it("decrypts only once, creates object URL, autoplays, and revokes URL on cleanup", async () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} activeMediaKey={null} />);
    });

    const audio = hookRef.current?.audioRef.current;
    expect(audio).not.toBeNull();

    let paused = true;
    Object.defineProperty(audio!, "paused", {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(audio!, "duration", {
      configurable: true,
      get: () => 7,
    });
    Object.defineProperty(audio!, "play", {
      configurable: true,
      value: vi.fn(async () => {
        paused = false;
        audio!.dispatchEvent(new Event("play"));
        audio!.dispatchEvent(new Event("loadedmetadata"));
      }),
    });
    Object.defineProperty(audio!, "pause", {
      configurable: true,
      value: vi.fn(() => {
        paused = true;
        audio!.dispatchEvent(new Event("pause"));
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
    expect(audio!.play).toHaveBeenCalledTimes(1);
    expect(hookRef.current?.audioUrl).toBe("blob:voice-note");

    await act(async () => {
      await hookRef.current?.loadAndMaybePlay(true);
    });

    expect(apiGetMock).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });

    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:voice-note");
  });

  it("pauses when another media key becomes active", async () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} activeMediaKey={null} />);
    });

    const audio = hookRef.current?.audioRef.current;
    expect(audio).not.toBeNull();

    let paused = true;
    const pauseSpy = vi.fn(() => {
      paused = true;
      audio!.dispatchEvent(new Event("pause"));
    });
    Object.defineProperty(audio!, "paused", {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(audio!, "play", {
      configurable: true,
      value: vi.fn(async () => {
        paused = false;
        audio!.dispatchEvent(new Event("play"));
      }),
    });
    Object.defineProperty(audio!, "pause", {
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
      root.render(<HookHarness hookRef={hookRef} activeMediaKey="voice:other" />);
    });

    expect(pauseSpy).toHaveBeenCalled();
  });

  it("maps digest mismatch to a stable error cause", async () => {
    apiGetMock.mockResolvedValueOnce({
      ciphertext: "ciphertext",
      encryptedDigest: "other-digest",
    });

    act(() => {
      root.render(<HookHarness hookRef={hookRef} activeMediaKey={null} />);
    });

    await act(async () => {
      await hookRef.current?.loadAndMaybePlay(true);
    });

    expect(hookRef.current?.errorCause).toBe("digestMismatch");
    expect(createObjectUrlMock).not.toHaveBeenCalled();
  });
});
