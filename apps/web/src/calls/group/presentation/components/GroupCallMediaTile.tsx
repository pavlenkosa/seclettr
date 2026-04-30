import { useRef, type ReactNode } from "react";
import { useMediaElementBinding } from "@/calls/shared/media/useMediaElementBinding";
import { useGroupCallAudioActivity } from "@/calls/group/runtime/useGroupCallAudioActivity";
import {
  CallMediaAvatarFallback,
  CallMediaSurface,
} from "@/calls/shared/presentation/CallMediaSurface";
import { LabelPill } from "@/components/ui";
import { useIsTileVisible } from "./useIsTileVisible";

import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

export interface GroupCallMediaTileProps {
  readonly label: string;
  readonly stream: MediaStream | null;
  readonly audioStream?: MediaStream | null;
  readonly fallbackInitials: string;
  readonly badge?: string;
  readonly muted?: boolean;
  readonly variant?: "stage" | "strip" | "viewer";
  readonly className?: string;
  readonly videoSource?: "camera" | "screen" | null;
  readonly onSelect?: () => void;
  readonly onStopWatching?: () => void;
  readonly stopWatchingLabel?: string;
  readonly interactiveLabel?: string;
  readonly children?: ReactNode;
}

function StreamVideo({
  stream,
  className,
  label,
  fallbackInitials,
  isSpeaking,
  speakingVariant,
}: {
  readonly stream: MediaStream | null;
  readonly className?: string;
  readonly label: string;
  readonly fallbackInitials: string;
  readonly isSpeaking: boolean;
  readonly speakingVariant: "primary-stage" | "strip";
}) {
  const { elementRef, isReady } = useMediaElementBinding<HTMLVideoElement>({
    kind: "video",
    stream,
    muted: true,
  });

  return (
    <>
      <video
        ref={elementRef}
        className={[className, isReady ? "" : styles.mediaVideoHidden].join(" ").trim()}
        autoPlay
        playsInline
        muted
      />
      {isReady ? null : (
        <CallMediaAvatarFallback
          label={label}
          initials={fallbackInitials}
          className={styles.mediaVideoFallback}
          avatarClassName={styles.mediaAvatarFallback}
          pulseClassName={styles.mediaAudioPulse}
          pulseActiveClassName={styles.mediaAudioPulseActive}
          isSpeaking={isSpeaking}
          speakingVariant={speakingVariant}
        />
      )}
    </>
  );
}

function StreamAudioSink({ stream }: { readonly stream: MediaStream | null }) {
  const { elementRef } = useMediaElementBinding<HTMLAudioElement>({
    kind: "audio",
    stream,
  });

  return <audio ref={elementRef} className={styles.hiddenAudio} autoPlay><track kind="captions" /></audio>;
}

function getVariantClassName(variant: GroupCallMediaTileProps["variant"]): string {
  if (variant === "viewer") {
    return styles.mediaTileViewer ?? "";
  }

  return variant === "stage"
    ? styles.mediaTileStage ?? ""
    : styles.mediaTileStrip ?? "";
}

function getTileClassName({
  variant,
  videoSource,
  isAudioOnly,
  hasVoiceActivity,
  className,
}: {
  variant: GroupCallMediaTileProps["variant"];
  videoSource: GroupCallMediaTileProps["videoSource"];
  isAudioOnly: boolean;
  hasVoiceActivity: boolean;
  className?: string;
}): string {
  return [
    styles.mediaTile,
    getVariantClassName(variant),
    videoSource === "screen" ? styles.mediaTileScreen : "",
    isAudioOnly ? styles.mediaTileAudioOnly : "",
    hasVoiceActivity ? styles.mediaTileAudioActive : "",
    className ?? "",
  ].join(" ");
}

function getVideoClassName(videoSource: GroupCallMediaTileProps["videoSource"]): string {
  return [
    styles.mediaVideo,
    videoSource === "screen" ? styles.mediaVideoScreen : "",
  ].join(" ").trim();
}

export function GroupCallMediaTile({
  label,
  stream,
  audioStream = null,
  fallbackInitials,
  badge,
  muted = false,
  variant = "strip",
  className,
  videoSource = null,
  onSelect,
  onStopWatching,
  stopWatchingLabel,
  interactiveLabel,
  children,
}: GroupCallMediaTileProps) {
  const hasVideo = Boolean(stream?.getVideoTracks().length);
  const isAudioOnly = !hasVideo;
  const hasVoiceActivity = useGroupCallAudioActivity(audioStream, isAudioOnly && !muted);
  const speakingVariant = variant === "strip" ? "strip" : "primary-stage";

  // Visibility-based video virtualization: suspend <video> rendering when
  // the tile is scrolled out of the viewport. Audio sinks remain active.
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const isVideoVisible = useIsTileVisible(sentinelRef);

  // Show avatar fallback for audio-only tiles OR when the video tile is
  // outside the visible scroll area.
  const showAvatarFallback = isAudioOnly || !isVideoVisible;

  return (
    <CallMediaSurface
      as="article"
      className={getTileClassName({
        variant,
        videoSource,
        isAudioOnly,
        hasVoiceActivity,
        className,
      })}
      interactiveClassName={styles.mediaTileInteractive}
      media={hasVideo && isVideoVisible ? (
        <StreamVideo
          stream={stream}
          className={getVideoClassName(videoSource)}
          label={label}
          fallbackInitials={fallbackInitials}
          isSpeaking={hasVoiceActivity}
          speakingVariant={speakingVariant}
        />
      ) : null}
      fallback={showAvatarFallback ? (
        <CallMediaAvatarFallback
          label={label}
          initials={fallbackInitials}
          className={isAudioOnly ? styles.mediaAudioFallback : styles.mediaVideoFallback}
          avatarClassName={styles.mediaAvatarFallback}
          pulseClassName={styles.mediaAudioPulse}
          pulseActiveClassName={styles.mediaAudioPulseActive}
          isSpeaking={hasVoiceActivity}
          speakingVariant={speakingVariant}
        />
      ) : null}
      overlayBottom={(
        <div className={styles.mediaTileMeta}>
          <span className={styles.mediaTileLabel}>{label}</span>
          {badge ? (
            <LabelPill className={styles.mediaStatusChip} tone="overlay" size="sm">
              {badge}
            </LabelPill>
          ) : null}
        </div>
      )}
      onSelect={onSelect}
      interactiveLabel={interactiveLabel ?? label}
      onSecondaryAction={onStopWatching}
      secondaryActionLabel={stopWatchingLabel}
      secondaryActionClassName={styles.mediaTileActionBtn}
    >
      {children}
      {/* Sentinel fills the tile for IntersectionObserver (tile has position:relative). */}
      <span ref={sentinelRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden />
      {/* Audio sink is always active regardless of visibility. */}
      {audioStream ? <StreamAudioSink stream={audioStream} /> : null}
    </CallMediaSurface>
  );
}
