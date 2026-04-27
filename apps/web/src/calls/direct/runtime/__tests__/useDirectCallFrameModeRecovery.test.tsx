// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyRemoteMediaSlot,
  type RemoteMediaSlot,
  type RemoteMediaSource,
} from "@/calls/direct/model/call-media-slots";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import { useDirectCallFrameModeRecovery } from "@/calls/direct/runtime/useDirectCallFrameModeRecovery";

type FrameModeRecoveryOptions = Parameters<typeof useDirectCallFrameModeRecovery>[0];

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer",
    callType: "video",
    direction: "outbound",
    state: "active",
    muted: false,
    videoOff: false,
    screenSharing: false,
    duration: 0,
    signalingVerified: true,
    e2eeActive: true,
    verificationCode: null,
    verificationHash: null,
    verificationError: null,
    mediaEncryptionMode: "frame-v1",
    peerSupportsRenegotiationV1: true,
    ...overrides,
  };
}

function createLiveVideoStream(trackId = "remote-video"): MediaStream {
  return {
    getVideoTracks: () => [{
      id: trackId,
      enabled: true,
      readyState: "live",
    }],
  } as unknown as MediaStream;
}

function createRemoteSlot(
  source: RemoteMediaSource,
  stream: MediaStream | null,
  overrides?: Partial<RemoteMediaSlot>
): RemoteMediaSlot {
  const trackId = stream?.getVideoTracks()[0]?.id ?? null;
  return {
    ...createEmptyRemoteMediaSlot(source),
    trackId,
    stream,
    status: stream ? "starting" : "inactive",
    ...overrides,
  };
}

function HookHarness(props: {
  active: ActiveCall | null;
  activeRef: MutableRefObject<ActiveCall | null>;
  setActive: FrameModeRecoveryOptions["setActive"];
  configureDirectCallFrameCrypto: (params: {
    callId: string;
    mediaEncryptionMode: "transport" | "frame-v1";
    peerUserId: string;
    peerDeviceId: string | null;
  }) => Promise<boolean>;
  pushNotice: FrameModeRecoveryOptions["pushNotice"];
  remoteCameraStreamRef: MutableRefObject<MediaStream | null>;
  remoteScreenStreamRef: MutableRefObject<MediaStream | null>;
  remoteCameraSlot: RemoteMediaSlot;
  remoteScreenSlot: RemoteMediaSlot;
  remoteVideoReady: boolean;
  remoteScreenReady: boolean;
  frameModeRecoveryTimerRef: MutableRefObject<number | null>;
  frameModeRecoveryAttemptedCallIdRef: MutableRefObject<string | null>;
}) {
  useDirectCallFrameModeRecovery({
    active: props.active,
    activeRef: props.activeRef,
    callSecurityMode: "balanced",
    remoteVideoReady: props.remoteVideoReady,
    remoteScreenReady: props.remoteScreenReady,
    remoteCameraSlot: props.remoteCameraSlot,
    remoteScreenSlot: props.remoteScreenSlot,
    remoteCameraStreamRef: props.remoteCameraStreamRef,
    remoteScreenStreamRef: props.remoteScreenStreamRef,
    setActive: props.setActive,
    configureDirectCallFrameCrypto: props.configureDirectCallFrameCrypto,
    pushNotice: props.pushNotice,
    t: (key: string) => key,
    frameModeRecoveryTimerRef: props.frameModeRecoveryTimerRef,
    frameModeRecoveryAttemptedCallIdRef: props.frameModeRecoveryAttemptedCallIdRef,
  });
  return null;
}

function createRecoveryRefs(active: ActiveCall) {
  const activeRef = { current: active } as MutableRefObject<ActiveCall | null>;
  return {
    activeRef,
    setActive: vi.fn((next: ActiveCall | null | ((prev: ActiveCall | null) => ActiveCall | null)) => {
      activeRef.current = typeof next === "function" ? next(activeRef.current) : next;
    }),
    configureDirectCallFrameCrypto: vi.fn(async () => true),
    pushNotice: vi.fn(),
    frameModeRecoveryTimerRef: { current: null } as MutableRefObject<number | null>,
    frameModeRecoveryAttemptedCallIdRef: { current: null } as MutableRefObject<string | null>,
  };
}

describe("useDirectCallFrameModeRecovery", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("falls back to transport when remote video never becomes playable", async () => {
    const remoteCameraStream = createLiveVideoStream();
    const remoteCameraSlot = createRemoteSlot("camera", remoteCameraStream, {
      status: "live",
      lastPacketAt: 1,
    });
    const remoteScreenSlot = createEmptyRemoteMediaSlot("screen");
    const {
      activeRef,
      configureDirectCallFrameCrypto,
      frameModeRecoveryAttemptedCallIdRef,
      frameModeRecoveryTimerRef,
      pushNotice,
      setActive,
    } = createRecoveryRefs(createActiveCall());

    act(() => {
      root.render(
        <HookHarness
          active={activeRef.current}
          activeRef={activeRef}
          setActive={setActive}
          configureDirectCallFrameCrypto={configureDirectCallFrameCrypto}
          pushNotice={pushNotice}
          remoteCameraStreamRef={{ current: remoteCameraStream }}
          remoteScreenStreamRef={{ current: null }}
          remoteCameraSlot={remoteCameraSlot}
          remoteScreenSlot={remoteScreenSlot}
          remoteVideoReady={false}
          remoteScreenReady={false}
          frameModeRecoveryTimerRef={frameModeRecoveryTimerRef}
          frameModeRecoveryAttemptedCallIdRef={frameModeRecoveryAttemptedCallIdRef}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(3500);
      await Promise.resolve();
    });

    expect(configureDirectCallFrameCrypto).toHaveBeenCalledWith({
      callId: "call-1",
      mediaEncryptionMode: "transport",
      peerUserId: "peer-1",
      peerDeviceId: "device-1",
    });
    expect(activeRef.current?.mediaEncryptionMode).toBe("transport");
    expect(pushNotice).toHaveBeenCalledWith({
      kind: "info",
      message: "callSecurity.frameFallbackTransport",
    });
  });

  it("does not fall back for a bare receiver track without remote visual activity", async () => {
    const remoteCameraStream = createLiveVideoStream();
    const remoteCameraSlot = createRemoteSlot("camera", remoteCameraStream);
    const remoteScreenSlot = createEmptyRemoteMediaSlot("screen");
    const {
      activeRef,
      configureDirectCallFrameCrypto,
      frameModeRecoveryAttemptedCallIdRef,
      frameModeRecoveryTimerRef,
      pushNotice,
      setActive,
    } = createRecoveryRefs(createActiveCall({ callType: "audio", videoOff: true }));

    act(() => {
      root.render(
        <HookHarness
          active={activeRef.current}
          activeRef={activeRef}
          setActive={setActive}
          configureDirectCallFrameCrypto={configureDirectCallFrameCrypto}
          pushNotice={pushNotice}
          remoteCameraStreamRef={{ current: remoteCameraStream }}
          remoteScreenStreamRef={{ current: null }}
          remoteCameraSlot={remoteCameraSlot}
          remoteScreenSlot={remoteScreenSlot}
          remoteVideoReady={false}
          remoteScreenReady={false}
          frameModeRecoveryTimerRef={frameModeRecoveryTimerRef}
          frameModeRecoveryAttemptedCallIdRef={frameModeRecoveryAttemptedCallIdRef}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(3500);
      await Promise.resolve();
    });

    expect(configureDirectCallFrameCrypto).not.toHaveBeenCalled();
    expect(activeRef.current?.mediaEncryptionMode).toBe("frame-v1");
    expect(pushNotice).not.toHaveBeenCalled();
  });

  it("does not fall back when remote media signaling says the camera is inactive", async () => {
    const remoteCameraStream = createLiveVideoStream();
    const remoteCameraSlot = createRemoteSlot("camera", remoteCameraStream, {
      status: "live",
      lastPacketAt: 1,
      signaledActivity: "inactive",
    });
    const remoteScreenSlot = createEmptyRemoteMediaSlot("screen");
    const {
      activeRef,
      configureDirectCallFrameCrypto,
      frameModeRecoveryAttemptedCallIdRef,
      frameModeRecoveryTimerRef,
      pushNotice,
      setActive,
    } = createRecoveryRefs(createActiveCall());

    act(() => {
      root.render(
        <HookHarness
          active={activeRef.current}
          activeRef={activeRef}
          setActive={setActive}
          configureDirectCallFrameCrypto={configureDirectCallFrameCrypto}
          pushNotice={pushNotice}
          remoteCameraStreamRef={{ current: remoteCameraStream }}
          remoteScreenStreamRef={{ current: null }}
          remoteCameraSlot={remoteCameraSlot}
          remoteScreenSlot={remoteScreenSlot}
          remoteVideoReady={false}
          remoteScreenReady={false}
          frameModeRecoveryTimerRef={frameModeRecoveryTimerRef}
          frameModeRecoveryAttemptedCallIdRef={frameModeRecoveryAttemptedCallIdRef}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(3500);
      await Promise.resolve();
    });

    expect(configureDirectCallFrameCrypto).not.toHaveBeenCalled();
    expect(activeRef.current?.mediaEncryptionMode).toBe("frame-v1");
    expect(pushNotice).not.toHaveBeenCalled();
  });

  it("does not fall back after remote frame progress has already been observed", async () => {
    const remoteCameraStream = createLiveVideoStream();
    const remoteCameraSlot = createRemoteSlot("camera", remoteCameraStream, {
      status: "live",
      lastFrameAt: 1,
      lastPacketAt: 1,
      signaledActivity: "active",
    });
    const remoteScreenSlot = createEmptyRemoteMediaSlot("screen");
    const {
      activeRef,
      configureDirectCallFrameCrypto,
      frameModeRecoveryAttemptedCallIdRef,
      frameModeRecoveryTimerRef,
      pushNotice,
      setActive,
    } = createRecoveryRefs(createActiveCall());

    act(() => {
      root.render(
        <HookHarness
          active={activeRef.current}
          activeRef={activeRef}
          setActive={setActive}
          configureDirectCallFrameCrypto={configureDirectCallFrameCrypto}
          pushNotice={pushNotice}
          remoteCameraStreamRef={{ current: remoteCameraStream }}
          remoteScreenStreamRef={{ current: null }}
          remoteCameraSlot={remoteCameraSlot}
          remoteScreenSlot={remoteScreenSlot}
          remoteVideoReady={false}
          remoteScreenReady={false}
          frameModeRecoveryTimerRef={frameModeRecoveryTimerRef}
          frameModeRecoveryAttemptedCallIdRef={frameModeRecoveryAttemptedCallIdRef}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(3500);
      await Promise.resolve();
    });

    expect(configureDirectCallFrameCrypto).not.toHaveBeenCalled();
    expect(activeRef.current?.mediaEncryptionMode).toBe("frame-v1");
    expect(pushNotice).not.toHaveBeenCalled();
  });
});
