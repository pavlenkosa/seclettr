// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDirectCallSignalMediaIngress } from "@/calls/direct/runtime/signal/useDirectCallSignalMediaIngress";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";

describe("useDirectCallSignalMediaIngress", () => {
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
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("converts camera media-state into an advisory hint for the remote media runtime", () => {
    const processIncomingMediaStateHint = vi.fn();
    const capture = vi.fn();

    function Harness() {
      const handlers = useDirectCallSignalMediaIngress({
        activeRef: {
          current: {
            callId: "call-1",
            peerUserId: "peer-1",
            peerDeviceId: "device-1",
            peerLabel: "Peer One",
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
          } satisfies ActiveCall,
        },
        incomingRef: { current: null },
        acceptingIncomingCallRef: { current: null },
        peerConnectionRef: { current: null },
        incomingIceCandidatesRef: { current: new Map() },
        pendingIceCandidatesRef: { current: new Map() },
        ignoreOfferRef: { current: false },
        remoteMediaStateSeqRef: { current: { camera: 0, screen: 0, mic: 0 } },
        remoteMediaStateRevisionRef: { current: { camera: 0, screen: 0, mic: 0 } },
        lastIncomingMediaStateRef: { current: { camera: null, screen: null, mic: null } },
        remoteCameraSlotRef: {
          current: {
            source: "camera",
            trackId: "track-camera",
            stream: null,
            status: "inactive",
            lastFrameAt: 0,
            lastPacketAt: 0,
            mid: null,
            signaledActivity: null,
          },
        },
        remoteScreenSlotRef: {
          current: {
            source: "screen",
            trackId: null,
            stream: null,
            status: "inactive",
            lastFrameAt: 0,
            lastPacketAt: 0,
            mid: null,
            signaledActivity: null,
          },
        },
        debugCallMedia: vi.fn(),
        shouldIgnoreUnexpectedPeerSignal: () => false,
        processIncomingMediaStateHint,
      });
      capture(handlers);
      return null;
    }

    act(() => {
      root.render(<Harness />);
    });

    const handlers = capture.mock.calls[0][0] as ReturnType<typeof useDirectCallSignalMediaIngress>;

    act(() => {
      handlers.applyIncomingCallMediaState({
        type: "call.media_state",
        callId: "call-1",
        senderUserId: "peer-1",
        senderDeviceId: "device-1",
        source: "camera",
        state: "on",
        activity: "active",
        seq: 5,
        streamRevision: 2,
        mid: "1",
        changedAt: new Date().toISOString(),
      });
    });

    expect(processIncomingMediaStateHint).toHaveBeenCalledWith(
      "camera",
      {
        signaledStopping: false,
        signaledEnded: false,
        activity: "active",
        reason: null,
        mid: "1",
      },
      "track-camera",
      true
    );
  });
});
