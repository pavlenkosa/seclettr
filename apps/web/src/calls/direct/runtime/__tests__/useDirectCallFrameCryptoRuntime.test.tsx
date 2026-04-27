// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupCallFrameCryptoHandle } from "@/calls/shared/crypto/frame-crypto";
import type { DirectCallFrameCryptoState } from "@/calls/direct/model/direct-call-types";
import { createEmptyDirectCallSenderFrameHandles } from "@/calls/direct/runtime/direct-call-frame-crypto-runtime";
import { useDirectCallFrameCryptoRuntime } from "@/calls/direct/runtime/useDirectCallFrameCryptoRuntime";

const runtimeMocks = vi.hoisted(() => {
  const bindSenderFrameEncryption = vi.fn();
  const bindReceiverFrameDecryption = vi.fn();
  const deriveDirectCallFrameKeys = vi.fn();
  const loadPeerIdentityPublicKey = vi.fn();
  const getAuthState = vi.fn();
  return {
    bindSenderFrameEncryption,
    bindReceiverFrameDecryption,
    deriveDirectCallFrameKeys,
    loadPeerIdentityPublicKey,
    getAuthState,
  };
});

vi.mock("@/stores/auth", () => ({
  useAuthStore: {
    getState: runtimeMocks.getAuthState,
  },
}));

vi.mock("@/calls/direct/runtime/crypto/call-auth-store", () => ({
  loadPeerIdentityPublicKey: runtimeMocks.loadPeerIdentityPublicKey,
}));

vi.mock("@/calls/direct/runtime/crypto/direct-call-frame-crypto", () => ({
  deriveDirectCallFrameKeys: runtimeMocks.deriveDirectCallFrameKeys,
}));

vi.mock("@/calls/shared/crypto/frame-crypto", () => ({
  bindSenderFrameEncryption: runtimeMocks.bindSenderFrameEncryption,
  bindReceiverFrameDecryption: runtimeMocks.bindReceiverFrameDecryption,
}));

type RuntimeApi = ReturnType<typeof useDirectCallFrameCryptoRuntime>;

type SenderHandleRecord = {
  sender: RTCRtpSender;
  handle: GroupCallFrameCryptoHandle & {
    setKeyBytes: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
};

type ReceiverHandleRecord = {
  receiver: RTCRtpReceiver;
  handle: GroupCallFrameCryptoHandle & {
    setKeyBytes: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
};

function createFrameHandle(): GroupCallFrameCryptoHandle & {
  setKeyBytes: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    supported: true,
    failed: false,
    setKeyBytes: vi.fn(),
    setKeyContexts: vi.fn(),
    close: vi.fn(),
  };
}

function createSender(kind: "audio" | "video", label: string): RTCRtpSender {
  return {
    track: {
      kind,
      id: `${label}-track`,
    },
  } as unknown as RTCRtpSender;
}

function createReceiver(kind: "audio" | "video", label: string): RTCRtpReceiver {
  return {
    track: {
      kind,
      id: `${label}-track`,
      readyState: "live",
    },
  } as unknown as RTCRtpReceiver;
}

function HookHarness(props: {
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  cameraSenderRef: MutableRefObject<RTCRtpSender | null>;
  screenShareSenderRef: MutableRefObject<RTCRtpSender | null>;
  directCallFrameCryptoStateRef: MutableRefObject<DirectCallFrameCryptoState | null>;
  directCallSenderFrameHandlesRef: MutableRefObject<ReturnType<typeof createEmptyDirectCallSenderFrameHandles>>;
  directCallReceiverFrameHandlesRef: MutableRefObject<Map<RTCRtpReceiver, GroupCallFrameCryptoHandle>>;
  debugCallMedia: ReturnType<typeof vi.fn>;
  capture: (api: RuntimeApi) => void;
}) {
  const runtime = useDirectCallFrameCryptoRuntime({
    peerConnectionRef: props.peerConnectionRef,
    cameraSenderRef: props.cameraSenderRef,
    screenShareSenderRef: props.screenShareSenderRef,
    directCallFrameCryptoStateRef: props.directCallFrameCryptoStateRef,
    directCallSenderFrameHandlesRef: props.directCallSenderFrameHandlesRef,
    directCallReceiverFrameHandlesRef: props.directCallReceiverFrameHandlesRef,
    debugCallMedia: props.debugCallMedia,
  });

  props.capture(runtime);
  return null;
}

describe("useDirectCallFrameCryptoRuntime", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);

    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("keeps sender and receiver frame crypto aligned across rebind, screen-share, teardown, and second call", async () => {
    const sendKeyBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const recvKeyBytes = Uint8Array.from({ length: 32 }, (_, index) => 100 + index);

    runtimeMocks.getAuthState.mockReturnValue({
      userId: "local-user",
      deviceId: "local-device",
      identityDhKeyPair: {
        publicKey: new Uint8Array(32).fill(7),
        privateKey: new Uint8Array(32).fill(9),
      },
    });
    runtimeMocks.loadPeerIdentityPublicKey.mockResolvedValue(new Uint8Array(32).fill(5));
    runtimeMocks.deriveDirectCallFrameKeys.mockResolvedValue({
      sendKeyBytes,
      recvKeyBytes,
      keyFingerprint: "fingerprint-1",
    });

    const senderHandleRecords: SenderHandleRecord[] = [];
    runtimeMocks.bindSenderFrameEncryption.mockImplementation((sender: RTCRtpSender) => {
      const handle = createFrameHandle();
      senderHandleRecords.push({ sender, handle });
      return handle;
    });

    const receiverHandleRecords: ReceiverHandleRecord[] = [];
    runtimeMocks.bindReceiverFrameDecryption.mockImplementation((receiver: RTCRtpReceiver) => {
      const handle = createFrameHandle();
      receiverHandleRecords.push({ receiver, handle });
      return handle;
    });

    const audioSenderOne = createSender("audio", "audio-1");
    const cameraSenderOne = createSender("video", "camera-1");
    const cameraSenderTwo = createSender("video", "camera-2");
    const screenSenderOne = createSender("video", "screen-1");
    const audioSenderTwo = createSender("audio", "audio-2");
    const cameraSenderThree = createSender("video", "camera-3");
    const audioReceiverOne = createReceiver("audio", "recv-audio-1");
    const videoReceiverOne = createReceiver("video", "recv-video-1");

    const peerConnectionState = {
      senders: [audioSenderOne],
      receivers: [audioReceiverOne, videoReceiverOne],
    };
    const peerConnectionRef = {
      current: {
        getSenders: () => peerConnectionState.senders,
        getReceivers: () => peerConnectionState.receivers,
      } as unknown as RTCPeerConnection,
    } as MutableRefObject<RTCPeerConnection | null>;
    const cameraSenderRef = { current: cameraSenderOne } as MutableRefObject<RTCRtpSender | null>;
    const screenShareSenderRef = { current: null } as MutableRefObject<RTCRtpSender | null>;
    const directCallFrameCryptoStateRef = {
      current: null as DirectCallFrameCryptoState | null,
    } as MutableRefObject<DirectCallFrameCryptoState | null>;
    const directCallSenderFrameHandlesRef = {
      current: createEmptyDirectCallSenderFrameHandles(),
    } as MutableRefObject<ReturnType<typeof createEmptyDirectCallSenderFrameHandles>>;
    const directCallReceiverFrameHandlesRef = {
      current: new Map<RTCRtpReceiver, GroupCallFrameCryptoHandle>(),
    } as MutableRefObject<Map<RTCRtpReceiver, GroupCallFrameCryptoHandle>>;
    const debugCallMedia = vi.fn();
    const runtimeRef = { current: null as RuntimeApi | null };

    await act(async () => {
      root.render(
        <HookHarness
          peerConnectionRef={peerConnectionRef}
          cameraSenderRef={cameraSenderRef}
          screenShareSenderRef={screenShareSenderRef}
          directCallFrameCryptoStateRef={directCallFrameCryptoStateRef}
          directCallSenderFrameHandlesRef={directCallSenderFrameHandlesRef}
          directCallReceiverFrameHandlesRef={directCallReceiverFrameHandlesRef}
          debugCallMedia={debugCallMedia}
          capture={(api) => {
            runtimeRef.current = api;
          }}
        />
      );
    });

    let primeReady = false;
    await act(async () => {
      primeReady = runtimeRef.current!.primeDirectCallSenderFrameCrypto("call-1");
    });
    expect(primeReady).toBe(true);
    expect(runtimeMocks.bindSenderFrameEncryption).toHaveBeenCalledTimes(2);
    expect(senderHandleRecords[0]?.sender).toBe(audioSenderOne);
    expect(senderHandleRecords[1]?.sender).toBe(cameraSenderOne);

    let configureReady = false;
    await act(async () => {
      configureReady = await runtimeRef.current!.configureDirectCallFrameCrypto({
        callId: "call-1",
        mediaEncryptionMode: "frame-v1",
        peerUserId: "peer-user",
        peerDeviceId: "peer-device",
      });
    });
    expect(configureReady).toBe(true);
    expect(runtimeMocks.loadPeerIdentityPublicKey).toHaveBeenCalledWith("peer-user", "peer-device");
    expect(runtimeMocks.deriveDirectCallFrameKeys).toHaveBeenCalledTimes(1);
    expect(senderHandleRecords[0]?.handle.setKeyBytes).toHaveBeenCalledWith(sendKeyBytes);
    expect(senderHandleRecords[1]?.handle.setKeyBytes).toHaveBeenCalledWith(sendKeyBytes);
    expect(runtimeMocks.bindReceiverFrameDecryption).toHaveBeenCalledTimes(2);
    expect(directCallReceiverFrameHandlesRef.current.size).toBe(2);

    cameraSenderRef.current = cameraSenderTwo;
    let reboundReady = false;
    await act(async () => {
      reboundReady = runtimeRef.current!.ensureDirectCallSenderFrameCryptoBound("call-1");
    });
    expect(reboundReady).toBe(true);
    expect(senderHandleRecords[1]?.handle.close).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.bindSenderFrameEncryption).toHaveBeenCalledTimes(3);
    expect(senderHandleRecords[2]?.sender).toBe(cameraSenderTwo);

    screenShareSenderRef.current = screenSenderOne;
    let screenReady = false;
    await act(async () => {
      screenReady = runtimeRef.current!.ensureDirectCallSenderFrameCryptoBound("call-1");
    });
    expect(screenReady).toBe(true);
    expect(runtimeMocks.bindSenderFrameEncryption).toHaveBeenCalledTimes(4);
    expect(senderHandleRecords[3]?.sender).toBe(screenSenderOne);

    await act(async () => {
      runtimeRef.current!.closeDirectCallFrameCrypto();
    });
    expect(senderHandleRecords[0]?.handle.close).toHaveBeenCalledTimes(1);
    expect(senderHandleRecords[2]?.handle.close).toHaveBeenCalledTimes(1);
    expect(senderHandleRecords[3]?.handle.close).toHaveBeenCalledTimes(1);
    expect(receiverHandleRecords[0]?.handle.close).toHaveBeenCalledTimes(1);
    expect(receiverHandleRecords[1]?.handle.close).toHaveBeenCalledTimes(1);
    expect(directCallFrameCryptoStateRef.current).toBeNull();
    expect(directCallReceiverFrameHandlesRef.current.size).toBe(0);

    peerConnectionState.senders = [audioSenderTwo];
    peerConnectionState.receivers = [];
    cameraSenderRef.current = cameraSenderThree;
    screenShareSenderRef.current = null;
    runtimeMocks.deriveDirectCallFrameKeys.mockResolvedValueOnce({
      sendKeyBytes: Uint8Array.from({ length: 32 }, (_, index) => 200 + index),
      recvKeyBytes: Uint8Array.from({ length: 32 }, (_, index) => 50 + index),
      keyFingerprint: "fingerprint-2",
    });

    let secondCallReady = false;
    await act(async () => {
      secondCallReady = await runtimeRef.current!.configureDirectCallFrameCrypto({
        callId: "call-2",
        mediaEncryptionMode: "frame-v1",
        peerUserId: "peer-user-2",
        peerDeviceId: "peer-device-2",
      });
    });
    expect(secondCallReady).toBe(true);
    expect(runtimeMocks.bindSenderFrameEncryption).toHaveBeenCalledTimes(6);
    expect(senderHandleRecords[4]?.sender).toBe(audioSenderTwo);
    expect(senderHandleRecords[5]?.sender).toBe(cameraSenderThree);
    expect(directCallFrameCryptoStateRef.current?.callId).toBe("call-2");

    expect(debugCallMedia).toHaveBeenCalledWith(
      "frame-crypto-sender-rebound",
      expect.objectContaining({
        callId: "call-1",
        slot: "camera",
        kind: "video",
      })
    );
    expect(debugCallMedia).toHaveBeenCalledWith(
      "frame-crypto-sender-bound",
      expect.objectContaining({
        callId: "call-1",
        slot: "screen",
        kind: "video",
      })
    );
    expect(debugCallMedia).toHaveBeenCalledWith(
      "frame-crypto-closed",
      expect.objectContaining({
        receiverHandleCount: 2,
      })
    );
  });
});
