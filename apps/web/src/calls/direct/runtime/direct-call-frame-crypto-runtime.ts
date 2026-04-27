import type { GroupCallFrameCryptoHandle } from "@/calls/shared/crypto/frame-crypto";

export type DirectCallSenderFrameSlot = "audio" | "camera" | "screen";

export interface DirectCallSenderFrameHandleBinding {
  sender: RTCRtpSender | null;
  handle: GroupCallFrameCryptoHandle | null;
}

export interface DirectCallSenderFrameHandles {
  audio: DirectCallSenderFrameHandleBinding;
  camera: DirectCallSenderFrameHandleBinding;
  screen: DirectCallSenderFrameHandleBinding;
}

export type DirectCallSenderFrameHandleAction =
  | "noop"
  | "bind"
  | "refresh"
  | "rebind"
  | "detach";

export function createEmptyDirectCallSenderFrameHandles(): DirectCallSenderFrameHandles {
  return {
    audio: { sender: null, handle: null },
    camera: { sender: null, handle: null },
    screen: { sender: null, handle: null },
  };
}

export function resolveDirectCallSenderFrameHandleAction(
  binding: DirectCallSenderFrameHandleBinding,
  nextSender: RTCRtpSender | null
): DirectCallSenderFrameHandleAction {
  if (!binding.handle && !nextSender) {
    return "noop";
  }
  if (binding.handle && !nextSender) {
    return "detach";
  }
  if (!binding.handle && nextSender) {
    return "bind";
  }
  if (binding.sender === nextSender) {
    return "refresh";
  }
  return "rebind";
}
