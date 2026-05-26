import { forwardRef, useImperativeHandle } from "react";
import { CallAudioOutputProvider } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { DirectCallSurfaceRenderer } from "@/calls/direct/presentation/components/DirectCallSurfaceRenderer";
import { useDirectCallSurfaceFocusTrap } from "@/calls/direct/runtime/presentation";
import { useDirectCallController } from "@/calls/direct/runtime";
import { useNativeBackAction } from "@/lib/hooks";
import type { DirectCallPanelHandle } from "@/calls/direct/model/direct-call-types";

export const DirectCallPanel = forwardRef<DirectCallPanelHandle>(function DirectCallPanel(_, ref) {
  const {
    startCall,
    surface,
    notice,
    focusTrapProps,
    surfaceRendererProps,
  } = useDirectCallController();

  useImperativeHandle(ref, () => ({ startCall }), [startCall]);
  useDirectCallSurfaceFocusTrap(focusTrapProps);

  // CAL-06: Android Back minimizes the call instead of destroying it.
  // Only active when the call is covering the full screen.
  useNativeBackAction(
    () => {
      if (surface === "incoming-fullscreen") surfaceRendererProps.onIncomingMinimize();
      else if (surface === "active-fullscreen") surfaceRendererProps.onActiveMinimize();
    },
    surface === "incoming-fullscreen" || surface === "active-fullscreen",
  );

  if (surface === "hidden" && !notice) {
    return null;
  }

  return (
    <CallAudioOutputProvider>
      <DirectCallSurfaceRenderer {...surfaceRendererProps} />
    </CallAudioOutputProvider>
  );
});

export { type ActiveCall, type DirectCallPanelHandle } from "@/calls/direct/model/direct-call-types";
