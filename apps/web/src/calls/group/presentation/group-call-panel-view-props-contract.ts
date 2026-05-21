/**
 * group-call-panel-view-props-contract — shared props contract for GroupCallPanel view builders.
 *
 * Owns:
 *   - GroupCallPanelViewPropsBuildParams — the combined build-time input record passed to
 *     buildGroupCallPanelChromeViewProps, buildGroupCallPanelControlsViewProps, and
 *     buildGroupCallPanelMediaDetailsViewProps
 *
 * Does not own any view building logic — this is a pure type contract file.
 * All builders receive the same params object and extract the fields they need.
 */
import type { CSSProperties, ComponentProps, ReactNode, RefObject } from "react";
import type { GroupCallPanelSession } from "@/calls/group/model/entry";
import { GroupCallControls } from "@/calls/group/presentation/components/GroupCallControls";
import { GroupCallDetailsDrawer } from "@/calls/group/presentation/components/GroupCallDetailsDrawer";
import { GroupCallDock } from "@/calls/group/presentation/components/GroupCallDock";
import { GroupCallHeader } from "@/calls/group/presentation/components/GroupCallHeader";
import { GroupCallMediaSection } from "@/calls/group/presentation/components/GroupCallMediaSection";

export interface GroupCallPanelViewPropsBuildParams {
  readonly session: GroupCallPanelSession;
  readonly stageShellRef: RefObject<HTMLDivElement>;
  readonly isDraggingMinimizedDock: boolean;
  readonly minimizedDockRef: RefObject<HTMLDialogElement>;
  readonly resolvedDockInlineStyle: CSSProperties | undefined;
  readonly dockMetaLabel: ReactNode;
  readonly detailsLabel: string;
  readonly isDetailsOpen: boolean;
  readonly isStageViewerOpen: boolean;
  readonly isCompactStagePreview: boolean;
  readonly canToggleStagePresentation: boolean;
  readonly shouldRenderInlineDetails: boolean;
  readonly stageExpandLabel: string;
  readonly closeViewerLabel: string;
  readonly exitFullscreenLabel: string;
  readonly endForEveryoneHint: string;
  readonly presentation: {
    readonly groupInitials: string;
    readonly leaveActionLabel: string;
    readonly title: string;
    readonly hasVisibleVideo: boolean;
    readonly hasRemoteScreenShare: boolean;
    readonly heroStatusLabel: string;
    readonly heroStatusTone: ComponentProps<typeof GroupCallHeader>["heroStatusTone"];
    readonly detailsToggleLabel: string;
    readonly shouldUseStageLayout: boolean;
    readonly stageTile: ComponentProps<typeof GroupCallMediaSection>["stageTile"];
    readonly stripTiles: ComponentProps<typeof GroupCallMediaSection>["stripTiles"];
    readonly galleryTiles: ComponentProps<typeof GroupCallMediaSection>["galleryTiles"];
    readonly hasPinnedStageSelection: boolean;
    readonly isWaitingSoloAudioLayout: boolean;
    readonly isCrowdedGalleryLayout: boolean;
    readonly localVideoStatusLabel: string;
    readonly stageEyebrowLabel: string;
    readonly focusHintLabel: string;
    readonly resetStageFocusLabel: string;
    readonly mediaGridClassName: string | undefined;
    readonly mediaEmptyClassName: string | undefined;
    readonly roomCode: string;
    readonly statusLabel: string;
    readonly mediaKeyStatusLabel: string;
    readonly mediaKeyModeLabel: string;
    readonly mediaModeDowngraded: boolean;
    readonly sortedMembers: ComponentProps<typeof GroupCallDetailsDrawer>["members"];
    readonly activeParticipantSet: ComponentProps<typeof GroupCallDetailsDrawer>["activeParticipantSet"];
    readonly canEndForEveryone: boolean;
    readonly endForEveryoneLabel: string;
    readonly controlRailClassName: string | undefined;
    readonly isLocalVideoEnabled: boolean;
    readonly muteToggleLabel: string;
    readonly videoToggleLabel: string;
    readonly screenShareToggleLabel: string;
  };
  readonly runtime: {
    readonly callDurationSeconds: number;
    readonly callDurationStartedAtMs: number | null;
    readonly remoteMediaCount: number;
    readonly effectiveFrameEncryptionEnabled: boolean;
    readonly sharedMediaKeyDeviceCount: number;
    readonly receivedMediaKeyCount: number;
    readonly error: string | null;
    readonly localStream: MediaStream | null;
    readonly status: ComponentProps<typeof GroupCallControls>["status"];
    readonly isLocalAudioMuted: boolean;
    readonly isLocalScreenSharing: boolean;
    readonly isVideoSwitching: boolean;
    readonly isScreenSwitching: boolean;
    readonly selectedVideoResolution: ComponentProps<typeof GroupCallControls>["selectedVideoResolution"];
    readonly selectedScreenResolution: ComponentProps<typeof GroupCallControls>["selectedScreenResolution"];
    readonly handleLeave: () => void;
    readonly handleEndForEveryone: () => void;
    readonly handleToggleMute: () => void;
    readonly handleToggleVideo: () => void | Promise<void>;
    readonly handleToggleScreenShare: () => void | Promise<void>;
    readonly handleSwitchMic?: ComponentProps<typeof GroupCallControls>["onSelectMic"];
    readonly handleSwitchCamera?: ComponentProps<typeof GroupCallControls>["onSelectCamera"];
    readonly handleSelectVideoResolution?: ComponentProps<typeof GroupCallControls>["onSelectVideoResolution"];
    readonly handleSelectScreenResolution?: ComponentProps<typeof GroupCallControls>["onSelectScreenResolution"];
  };
  readonly devices: {
    readonly micDevices: ComponentProps<typeof GroupCallControls>["micDevices"];
    readonly cameraDevices: ComponentProps<typeof GroupCallControls>["cameraDevices"];
    readonly selectedMicId: ComponentProps<typeof GroupCallControls>["selectedMicId"];
    readonly selectedCameraId: ComponentProps<typeof GroupCallControls>["selectedCameraId"];
  };
  readonly handlers: {
    readonly handleRestore: () => void;
    readonly startMinimizedDockDrag: ComponentProps<typeof GroupCallDock>["onDragStart"];
    readonly moveMinimizedDock: ComponentProps<typeof GroupCallDock>["onDragMove"];
    readonly stopMinimizedDockDrag: ComponentProps<typeof GroupCallDock>["onDragEnd"];
    readonly handleToggleDetails: () => void;
    readonly handleMinimize: () => void;
    readonly handleResetStageFocus: () => void;
    readonly handleStopWatchingStageTile: (tileId: string) => void;
    readonly handleToggleStagePresentation: () => void | Promise<void>;
    readonly handleSelectTile: (tileId: string) => void;
  };
}

export interface GroupCallPanelViewPropsResult {
  readonly dockProps: ComponentProps<typeof GroupCallDock>;
  readonly headerProps: ComponentProps<typeof GroupCallHeader>;
  readonly mediaSectionProps: ComponentProps<typeof GroupCallMediaSection>;
  readonly detailsDrawerProps: ComponentProps<typeof GroupCallDetailsDrawer>;
  readonly controlsProps: ComponentProps<typeof GroupCallControls>;
}
