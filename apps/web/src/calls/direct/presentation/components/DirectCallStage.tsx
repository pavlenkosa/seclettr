import type { ReactNode, RefObject } from "react";
import type { DirectCallStageSceneState } from "@/calls/direct/presentation/useDirectCallStagePresentation";
import {
  CallMediaAvatarFallback,
  CallMediaSurface,
} from "@/calls/shared/presentation/CallMediaSurface";
import {
  ExpandIcon,
  ScreenShareIcon,
} from "@/calls/shared/presentation/CallIcons";
import { DirectCallStageViewerDialog } from "./DirectCallStageViewerDialog";
import { InfoStack, IconButton, LabelPill } from "@/components/ui";

import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

interface DirectCallStageProps {
  readonly remoteScreenStream: MediaStream | null;
  readonly remoteVideoRef: RefObject<HTMLVideoElement>;
  readonly remoteVideoCompanionRef: RefObject<HTMLVideoElement>;
  readonly remoteScreenVideoRef: RefObject<HTMLVideoElement>;
  readonly remoteScreenCompanionRef: RefObject<HTMLVideoElement>;
  readonly scene: DirectCallStageSceneState;
  readonly peerDisplayName: string;
  readonly peerInitials: string;
  readonly callStateText: string;
  readonly cameraStageLabel: string;
  readonly screenStageLabel: string;
  readonly enterFullscreenLabel: string;
  readonly exitFullscreenLabel: string;
  readonly closeViewerLabel: string;
  readonly stopWatchingScreenLabel: string;
  readonly screenViewerDialogAriaLabel: string;
  readonly showCameraOnStageLabel: string;
  readonly showScreenOnStageLabel: string;
  readonly peerIsSpeaking: boolean;
}

type StageSource = DirectCallStageSceneState["stageLayout"]["stageSource"];
type CompanionSource = NonNullable<DirectCallStageSceneState["stageLayout"]["companionSource"]>;

function getVisualStageLabel(
  source: "camera" | "screen",
  cameraStageLabel: string,
  screenStageLabel: string
): string {
  return source === "screen" ? screenStageLabel : cameraStageLabel;
}

function getStageClassName(stageSource: StageSource): string {
  if (stageSource === "audio") {
    return `${styles.callStageCompact ?? ""} ${styles.callStageAudio ?? ""}`;
  }
  return stageSource === "screen"
    ? styles.callStageScreen ?? ""
    : styles.callStageCamera ?? "";
}

function StageFallback({
  isAudioOnlyStage,
  peerDisplayName,
  peerInitials,
  peerIsSpeaking,
}: {
  readonly isAudioOnlyStage: boolean;
  readonly peerDisplayName: string;
  readonly peerInitials: string;
  readonly peerIsSpeaking: boolean;
}) {
  if (!isAudioOnlyStage) return null;
  return (
    <CallMediaAvatarFallback
      label={peerDisplayName}
      initials={peerInitials}
      className={styles.stagePlaceholder}
      avatarClassName={styles.audioAvatar}
      pulseClassName={styles.stageAudioPulse}
      pulseActiveClassName={styles.stageAudioPulseActive}
      isSpeaking={peerIsSpeaking}
      speakingVariant="primary-stage"
    />
  );
}

function StageActionRail({
  canPromoteRemoteScreen,
  scene,
  enterFullscreenLabel,
  showScreenOnStageLabel,
  stopWatchingScreenLabel,
}: {
  readonly canPromoteRemoteScreen: boolean;
  readonly scene: DirectCallStageSceneState;
  readonly enterFullscreenLabel: string;
  readonly showScreenOnStageLabel: string;
  readonly stopWatchingScreenLabel: string;
}) {
  const hasActions = (
    canPromoteRemoteScreen ||
    scene.canOpenScreenViewer ||
    scene.canStopWatchingScreen ||
    scene.canRestoreScreenShare
  );
  if (!hasActions) return null;

  return (
    <div className={styles.stageActionRail}>
      {canPromoteRemoteScreen ? (
        <IconButton
          onClick={() => scene.selectSource("screen")}
          className={styles.stageActionIconBtn}
          size={34}
          variant="glass"
          aria-label={showScreenOnStageLabel}
          title={showScreenOnStageLabel}
        >
          <ScreenShareIcon />
        </IconButton>
      ) : null}
      {scene.canRestoreScreenShare ? (
        <IconButton
          onClick={scene.restoreScreenShare}
          className={styles.stageActionIconBtn}
          size={34}
          variant="glass"
          aria-label={showScreenOnStageLabel}
          title={showScreenOnStageLabel}
        >
          <ScreenShareIcon />
        </IconButton>
      ) : null}
      {scene.canStopWatchingScreen ? (
        <IconButton
          onClick={scene.stopWatchingScreen}
          className={styles.stageActionIconBtn}
          size={34}
          variant="glass"
          aria-label={stopWatchingScreenLabel}
          title={stopWatchingScreenLabel}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </IconButton>
      ) : null}
      {scene.canOpenScreenViewer ? (
        <IconButton
          onClick={scene.openScreenViewer}
          className={styles.stageActionIconBtn}
          size={34}
          variant="glass"
          aria-label={enterFullscreenLabel}
          title={enterFullscreenLabel}
        >
          <ExpandIcon />
        </IconButton>
      ) : null}
    </div>
  );
}

function getStageMediaElement({
  remoteScreenVideoRef,
  remoteVideoRef,
  stageSource,
}: {
  readonly remoteScreenVideoRef: RefObject<HTMLVideoElement>;
  readonly remoteVideoRef: RefObject<HTMLVideoElement>;
  readonly stageSource: StageSource;
}): ReactNode {
  if (stageSource === "camera") {
    return <video ref={remoteVideoRef} className={styles.stageVideo} autoPlay playsInline muted />;
  }
  if (stageSource === "screen") {
    return <video ref={remoteScreenVideoRef} className={styles.stageVideo} autoPlay playsInline muted />;
  }
  return null;
}

function CompanionMediaElement({
  companionSource,
  remoteScreenCompanionRef,
  remoteVideoCompanionRef,
}: {
  readonly companionSource: CompanionSource;
  readonly remoteScreenCompanionRef: RefObject<HTMLVideoElement>;
  readonly remoteVideoCompanionRef: RefObject<HTMLVideoElement>;
}) {
  return companionSource === "screen"
    ? <video ref={remoteScreenCompanionRef} autoPlay playsInline muted />
    : <video ref={remoteVideoCompanionRef} autoPlay playsInline muted />;
}

function DirectCallCompanionPreview({
  companionSource,
  companionAriaLabel,
  companionSourceLabel,
  isDocked,
  peerDisplayName,
  remoteScreenCompanionRef,
  remoteVideoCompanionRef,
  onSelect,
}: {
  readonly companionSource: CompanionSource | null;
  readonly companionAriaLabel: string;
  readonly companionSourceLabel: string;
  readonly isDocked: boolean;
  readonly peerDisplayName: string;
  readonly remoteScreenCompanionRef: RefObject<HTMLVideoElement>;
  readonly remoteVideoCompanionRef: RefObject<HTMLVideoElement>;
  readonly onSelect: () => void;
}) {
  if (!companionSource) return null;
  return (
    <CallMediaSurface
      className={[
        styles.remoteCompanionPreview,
        companionSource === "screen"
          ? styles.remoteCompanionPreviewScreen
          : styles.remoteCompanionPreviewCamera,
        isDocked ? styles.remoteCompanionPreviewDocked : "",
      ].join(" ")}
      media={(
        <CompanionMediaElement
          companionSource={companionSource}
          remoteScreenCompanionRef={remoteScreenCompanionRef}
          remoteVideoCompanionRef={remoteVideoCompanionRef}
        />
      )}
      overlayBottom={(
        <div className={styles.remoteCompanionMeta}>
          <span className={styles.remoteCompanionName}>{peerDisplayName}</span>
          <LabelPill className={styles.remoteCompanionBadge} tone="overlay" size="xs">
            {companionSourceLabel}
          </LabelPill>
        </div>
      )}
      onSelect={onSelect}
      interactiveLabel={companionAriaLabel}
    />
  );
}

export function DirectCallStage({
  remoteScreenStream,
  remoteVideoRef,
  remoteVideoCompanionRef,
  remoteScreenVideoRef,
  remoteScreenCompanionRef,
  scene,
  peerDisplayName,
  peerInitials,
  callStateText,
  cameraStageLabel,
  screenStageLabel,
  enterFullscreenLabel,
  exitFullscreenLabel,
  closeViewerLabel,
  stopWatchingScreenLabel,
  screenViewerDialogAriaLabel,
  showCameraOnStageLabel,
  showScreenOnStageLabel,
  peerIsSpeaking,
}: DirectCallStageProps) {
  const { stageLayout } = scene;
  const isAudioOnlyStage = stageLayout.stageSource === "audio";
  const isScreenFocusedWithCameraCompanion = (
    stageLayout.stageSource === "screen" &&
    stageLayout.companionSource === "camera"
  );
  const stageSourceLabel = stageLayout.stageSource === "screen" ? screenStageLabel : cameraStageLabel;
  const companionSourceLabel = getVisualStageLabel(
    stageLayout.companionSource ?? "camera",
    cameraStageLabel,
    screenStageLabel
  );
  const companionAriaLabel = stageLayout.companionSource === "screen"
    ? showScreenOnStageLabel
    : showCameraOnStageLabel;
  const canPromoteRemoteScreen = stageLayout.stageSource !== "screen" && stageLayout.companionSource === "screen";

  const handleCompanionActivate = () => {
    if (!stageLayout.companionSource) return;
    scene.selectSource(stageLayout.companionSource);
  };

  return (
    <div
      className={[
        styles.callSurface,
        isScreenFocusedWithCameraCompanion ? styles.callSurfaceScreenFocused : "",
      ].filter(Boolean).join(" ")}
    >
      <CallMediaSurface
        className={[
          styles.callStage,
          getStageClassName(stageLayout.stageSource),
        ].join(" ")}
        media={getStageMediaElement({
          remoteScreenVideoRef,
          remoteVideoRef,
          stageSource: stageLayout.stageSource,
        })}
        fallback={(
          <StageFallback
            isAudioOnlyStage={isAudioOnlyStage}
            peerDisplayName={peerDisplayName}
            peerInitials={peerInitials}
            peerIsSpeaking={peerIsSpeaking}
          />
        )}
        overlayTopStart={stageLayout.stageSource === "audio" ? null : (
          <LabelPill className={styles.stageVisualBadge} tone="overlay" size="sm">
            {stageSourceLabel}
          </LabelPill>
        )}
        overlayBottom={isAudioOnlyStage ? null : (
          <InfoStack
            className={styles.stageMeta}
            title={peerDisplayName}
            titleClassName={styles.peerName}
          />
        )}
      >
        <StageActionRail
          canPromoteRemoteScreen={canPromoteRemoteScreen}
          enterFullscreenLabel={enterFullscreenLabel}
          scene={scene}
          showScreenOnStageLabel={showScreenOnStageLabel}
          stopWatchingScreenLabel={stopWatchingScreenLabel}
        />
      </CallMediaSurface>

      <DirectCallCompanionPreview
        companionSource={stageLayout.companionSource}
        companionAriaLabel={companionAriaLabel}
        companionSourceLabel={companionSourceLabel}
        isDocked={isScreenFocusedWithCameraCompanion}
        peerDisplayName={peerDisplayName}
        remoteScreenCompanionRef={remoteScreenCompanionRef}
        remoteVideoCompanionRef={remoteVideoCompanionRef}
        onSelect={handleCompanionActivate}
      />

      <DirectCallStageViewerDialog
        isOpen={scene.isScreenViewerOpen}
        stream={remoteScreenStream}
        peerDisplayName={peerDisplayName}
        callStateText={callStateText}
        screenStageLabel={screenStageLabel}
        dialogAriaLabel={screenViewerDialogAriaLabel}
        enterFullscreenLabel={enterFullscreenLabel}
        exitFullscreenLabel={exitFullscreenLabel}
        closeViewerLabel={closeViewerLabel}
        stopWatchingScreenLabel={stopWatchingScreenLabel}
        onClose={scene.closeScreenViewer}
        onStopWatchingScreen={scene.stopWatchingScreen}
      />
    </div>
  );
}
