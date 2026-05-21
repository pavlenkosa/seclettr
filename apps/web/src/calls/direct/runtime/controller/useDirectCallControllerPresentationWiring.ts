/**
 * useDirectCallControllerPresentationWiring — presentation-facing composition bundle.
 *
 * Owns:
 *   - callback assembly: maps raw action primitives (setIsMinimized, hangup, etc.)
 *     and implementation-named drag handlers (startMinimizedDockDrag, etc.) to
 *     the onXxx interface consumed by useDirectCallPresentationBindings
 *   - presentation surface, focus trap, and renderer prop construction
 *
 * Does not own negotiation, signaling, media setup, session teardown, or
 * peer-connection bootstrap. Receives all computed media state from the media
 * wiring bundle and all drag state from the controller state bag.
 */
import { type Dispatch, type SetStateAction, type PointerEventHandler } from "react";
import { useDirectCallPresentationBindings } from "../presentation";
import type { VideoResolution } from "@/calls/shared/presentation/CallDevicePicker";

type BindingOptions = Parameters<typeof useDirectCallPresentationBindings>[0];

type DroppedCallbacks =
  | "onExpandMinimized" | "onHangup" | "onReject" | "onIncomingMinimize" | "onAccept"
  | "onStartMinimizedDockDrag" | "onMoveMinimizedDock" | "onStopMinimizedDockDrag"
  | "onOpenIncomingDetails" | "onOpenActiveDetails"
  | "onToggleMute" | "onActiveMinimize" | "onToggleSecurityCard"
  | "onStartLocalPreviewDrag" | "onMoveLocalPreview" | "onStopLocalPreviewDrag"
  | "onStartLocalPreviewResize" | "onMoveLocalPreviewResize" | "onStopLocalPreviewResize"
  | "onStartLocalScreenPreviewDrag" | "onMoveLocalScreenPreview" | "onStopLocalScreenPreviewDrag"
  | "onSwitchCamera" | "onToggleVideo" | "onToggleScreenShare" | "onSelectScreenResolution";

type PresentationActions = {
  setIsMinimized: Dispatch<SetStateAction<boolean>>;
  setIsSecurityCardOpen: Dispatch<SetStateAction<boolean>>;
  rejectCall: () => void;
  acceptCall: () => void | Promise<void>;
  toggleMute: () => void;
  hangup: () => void;
  switchCamera: () => void | Promise<void>;
  toggleVideo: () => void | Promise<void>;
  toggleScreenShare: () => void | Promise<void>;
  handleSelectScreenResolution: (res: VideoResolution) => void;
  startMinimizedDockDrag: PointerEventHandler<HTMLButtonElement>;
  moveMinimizedDock: PointerEventHandler<HTMLButtonElement>;
  stopMinimizedDockDrag: PointerEventHandler<HTMLButtonElement>;
  startLocalPreviewDrag: PointerEventHandler<HTMLDivElement>;
  moveLocalPreview: PointerEventHandler<HTMLDivElement>;
  stopLocalPreviewDrag: PointerEventHandler<HTMLDivElement>;
  startLocalPreviewResize: PointerEventHandler<HTMLButtonElement>;
  moveLocalPreviewResize: PointerEventHandler<HTMLButtonElement>;
  stopLocalPreviewResize: PointerEventHandler<HTMLButtonElement>;
  startLocalScreenPreviewDrag: PointerEventHandler<HTMLDivElement>;
  moveLocalScreenPreview: PointerEventHandler<HTMLDivElement>;
  stopLocalScreenPreviewDrag: PointerEventHandler<HTMLDivElement>;
};

export type UseDirectCallControllerPresentationWiringOptions =
  Omit<BindingOptions, DroppedCallbacks> & PresentationActions;

export function useDirectCallControllerPresentationWiring({
  setIsMinimized,
  setIsSecurityCardOpen,
  rejectCall,
  acceptCall,
  toggleMute,
  hangup,
  switchCamera,
  toggleVideo,
  toggleScreenShare,
  handleSelectScreenResolution,
  startMinimizedDockDrag,
  moveMinimizedDock,
  stopMinimizedDockDrag,
  startLocalPreviewDrag,
  moveLocalPreview,
  stopLocalPreviewDrag,
  startLocalPreviewResize,
  moveLocalPreviewResize,
  stopLocalPreviewResize,
  startLocalScreenPreviewDrag,
  moveLocalScreenPreview,
  stopLocalScreenPreviewDrag,
  ...passThrough
}: UseDirectCallControllerPresentationWiringOptions) {
  return useDirectCallPresentationBindings({
    ...passThrough,
    onExpandMinimized: () => setIsMinimized(false),
    onIncomingMinimize: () => setIsMinimized(true),
    onActiveMinimize: () => setIsMinimized(true),
    onOpenIncomingDetails: () => setIsMinimized(false),
    onOpenActiveDetails: () => setIsMinimized(false),
    onToggleSecurityCard: () => setIsSecurityCardOpen((prev) => !prev),
    onReject: rejectCall,
    onAccept: acceptCall,
    onToggleMute: toggleMute,
    onHangup: hangup,
    onSwitchCamera: switchCamera,
    onToggleVideo: toggleVideo,
    onToggleScreenShare: toggleScreenShare,
    onSelectScreenResolution: handleSelectScreenResolution,
    onStartMinimizedDockDrag: startMinimizedDockDrag,
    onMoveMinimizedDock: moveMinimizedDock,
    onStopMinimizedDockDrag: stopMinimizedDockDrag,
    onStartLocalPreviewDrag: startLocalPreviewDrag,
    onMoveLocalPreview: moveLocalPreview,
    onStopLocalPreviewDrag: stopLocalPreviewDrag,
    onStartLocalPreviewResize: startLocalPreviewResize,
    onMoveLocalPreviewResize: moveLocalPreviewResize,
    onStopLocalPreviewResize: stopLocalPreviewResize,
    onStartLocalScreenPreviewDrag: startLocalScreenPreviewDrag,
    onMoveLocalScreenPreview: moveLocalScreenPreview,
    onStopLocalScreenPreviewDrag: stopLocalScreenPreviewDrag,
  });
}
