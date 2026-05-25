/**
 * buildGroupCallPanelControlsViewProps — view-props builder for the GroupCallControls rail.
 *
 * Owns:
 *   - buildGroupCallPanelControlsViewProps — maps GroupCallPanelViewPropsBuildParams to
 *     the props consumed by GroupCallControls (mute, video, screen-share, device pickers, labels)
 *
 * Does not own any state or rendering — this is a pure props-mapping function.
 */
import type { ComponentProps } from "react";
import type { GroupCallControls } from "@/calls/group/presentation/components/GroupCallControls";
import type { GroupCallPanelViewPropsBuildParams } from "@/calls/group/presentation/group-call-panel-view-props-contract";

export function buildGroupCallPanelControlsViewProps({
  presentation,
  runtime,
  devices,
}: GroupCallPanelViewPropsBuildParams): ComponentProps<typeof GroupCallControls> {
  return {
    className: presentation.controlRailClassName,
    layout: "inline",
    hasLocalMedia: Boolean(runtime.localStream),
    status: runtime.status,
    isAudioMuted: runtime.isLocalAudioMuted,
    isLocalVideoEnabled: presentation.isLocalVideoEnabled,
    isLocalScreenSharing: runtime.isLocalScreenSharing,
    isVideoSwitching: runtime.isVideoSwitching,
    isScreenSwitching: runtime.isScreenSwitching,
    muteToggleLabel: presentation.muteToggleLabel,
    videoToggleLabel: presentation.videoToggleLabel,
    screenShareToggleLabel: presentation.screenShareToggleLabel,
    leaveActionLabel: presentation.leaveActionLabel,
    micDevices: devices.micDevices,
    cameraDevices: devices.cameraDevices,
    selectedMicId: devices.selectedMicId,
    selectedCameraId: devices.selectedCameraId,
    selectedVideoResolution: runtime.selectedVideoResolution,
    onToggleMute: runtime.handleToggleMute,
    onToggleVideo: runtime.handleToggleVideo,
    onToggleScreenShare: runtime.handleToggleScreenShare,
    onLeave: runtime.handleLeave,
    onSelectMic: runtime.handleSwitchMic,
    onSelectCamera: runtime.handleSwitchCamera,
    onSelectVideoResolution: runtime.handleSelectVideoResolution,
    selectedScreenResolution: runtime.selectedScreenResolution,
    onSelectScreenResolution: runtime.handleSelectScreenResolution,
  };
}
