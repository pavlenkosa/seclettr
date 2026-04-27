import { describe, expect, it } from "vitest";
import {
  createEmptyDirectCallSenderFrameHandles,
  resolveDirectCallSenderFrameHandleAction,
} from "@/calls/direct/runtime/direct-call-frame-crypto-runtime";

describe("direct call frame crypto runtime helpers", () => {
  it("creates empty sender frame handle slots", () => {
    expect(createEmptyDirectCallSenderFrameHandles()).toEqual({
      audio: { sender: null, handle: null },
      camera: { sender: null, handle: null },
      screen: { sender: null, handle: null },
    });
  });

  it("returns noop when no sender and no handle exist", () => {
    const handles = createEmptyDirectCallSenderFrameHandles();
    expect(resolveDirectCallSenderFrameHandleAction(handles.audio, null)).toBe("noop");
  });

  it("binds when a sender appears for an empty slot", () => {
    const handles = createEmptyDirectCallSenderFrameHandles();
    const sender = { track: { kind: "audio" } } as unknown as RTCRtpSender;
    expect(resolveDirectCallSenderFrameHandleAction(handles.audio, sender)).toBe("bind");
  });

  it("refreshes when the sender stays stable", () => {
    const sender = { track: { kind: "video" } } as unknown as RTCRtpSender;
    const handle = { supported: true, failed: false, setKeyBytes: () => undefined, setKeyContexts: () => undefined, close: () => undefined };
    expect(resolveDirectCallSenderFrameHandleAction({ sender, handle }, sender)).toBe("refresh");
  });

  it("rebinds when the slot points to a different sender instance", () => {
    const currentSender = { track: { kind: "video" } } as unknown as RTCRtpSender;
    const nextSender = { track: { kind: "video" } } as unknown as RTCRtpSender;
    const handle = { supported: true, failed: false, setKeyBytes: () => undefined, setKeyContexts: () => undefined, close: () => undefined };
    expect(resolveDirectCallSenderFrameHandleAction({ sender: currentSender, handle }, nextSender)).toBe("rebind");
  });

  it("detaches when a previously bound sender disappears", () => {
    const sender = { track: { kind: "video" } } as unknown as RTCRtpSender;
    const handle = { supported: true, failed: false, setKeyBytes: () => undefined, setKeyContexts: () => undefined, close: () => undefined };
    expect(resolveDirectCallSenderFrameHandleAction({ sender, handle }, null)).toBe("detach");
  });
});
