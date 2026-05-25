import { forwardRef, useImperativeHandle } from "react";
import { CallAudioOutputProvider } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { DirectCallSurfaceRenderer } from "@/calls/direct/presentation/components/DirectCallSurfaceRenderer";
import { useDirectCallSurfaceFocusTrap } from "@/calls/direct/runtime/presentation";
import { useDirectCallController } from "@/calls/direct/runtime";
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
