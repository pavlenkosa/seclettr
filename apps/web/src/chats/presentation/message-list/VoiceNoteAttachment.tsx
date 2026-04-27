import { useI18n } from "@/i18n";
import { useSecuritySettings } from "@/ui-settings";
import { useVoiceNoteAttachmentRuntime } from "@/chats/runtime/useVoiceNoteAttachmentRuntime";
import { useUploadProgress } from "@/chats/runtime/useUploadProgress";
import type { Message } from "@/stores/messages";
import { AttachmentUploadRing } from "./AttachmentUploadProgress";
import { MessageStatusIcon } from "./MessageStatusIcon";
import {
  formatAttachmentSize,
  resolveAttachmentErrorMessage,
  type MediaPlaybackProps,
} from "./message-attachment-shared";
import { formatClock, formatTime } from "./message-list-presentation";
import { VoiceDecryptButton } from "./VoiceDecryptButton";
import { VoiceWaveform } from "./VoiceWaveform";
import styles from "../MessageList.module.css";

/**
 * Interactive voice-note attachment renderer with decrypt/playback controls.
 */
export function VoiceNoteAttachment({
  msg,
  isOwn,
  mediaKey,
  activeMediaKey,
  onActiveMediaChange,
}: { msg: Message; isOwn: boolean } & MediaPlaybackProps) {
  const { t, locale } = useI18n();
  const { autoDecryptMedia } = useSecuritySettings();
  const { progress: uploadProgress, cancel: cancelUpload } = useUploadProgress(msg.id);
  const {
    audioRef,
    audioUrl,
    loading,
    errorCause,
    isPlaying,
    currentTime,
    decodedDuration,
    playbackRate,
    setPlaybackRate,
    waveformBars,
    loadAndMaybePlay,
    togglePlayback,
    handleScrub,
  } = useVoiceNoteAttachmentRuntime({
    attachment: msg.attachment,
    messageId: msg.id,
    mediaKey,
    activeMediaKey,
    onActiveMediaChange,
    autoDecrypt: autoDecryptMedia === "on" && uploadProgress === null,
  });

  const totalSeconds = decodedDuration > 0
    ? decodedDuration
    : Math.max(1, Math.round((msg.attachment?.durationMs ?? 0) / 1000));
  const progressRatio = Math.max(0, Math.min(1, currentTime / Math.max(totalSeconds, 1)));
  const playbackRateLabel = playbackRate % 1 === 0
    ? `${Math.trunc(playbackRate)}x`
    : `${playbackRate.toFixed(1)}x`;
  const totalDurationLabel = (msg.attachment?.durationMs
    ? formatClock(Math.round(msg.attachment.durationMs / 1000))
    : "") || formatClock(totalSeconds);
  const progressLabel = currentTime > 0
    ? `${formatClock(currentTime)} / ${formatClock(totalSeconds)}`
    : totalDurationLabel;
  const sizeLabel = formatAttachmentSize(msg.attachment?.size, t);
  const messageTimeLabel = formatTime(msg.timestamp, locale);
  const error = resolveAttachmentErrorMessage("voice", errorCause, t);

  const handlePlaybackRateToggle = () => {
    setPlaybackRate((previous) => {
      const nextRateIfNotOne = previous === 1.5 ? 2 : 1;
      return previous === 1 ? 1.5 : nextRateIfNotOne;
    });
  };

  const voicePlayerControl = audioUrl ? (
    <div className={styles.voicePlayer}>
      <button
        onClick={() => void togglePlayback()}
        className={styles.voicePlayBtn}
        aria-label={isPlaying ? t("message.voice.pauseAria") : t("message.voice.playAria")}
      >
        {isPlaying ? (
          <svg className={styles.voicePauseIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="4.6" y="3.9" width="4.2" height="12.2" rx="1.45" fill="currentColor" />
            <rect x="11.2" y="3.9" width="4.2" height="12.2" rx="1.45" fill="currentColor" />
          </svg>
        ) : (
          <svg className={styles.voicePlayIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M7.1 4.85a1.08 1.08 0 0 1 1.63-.93l7.2 4.47a1.08 1.08 0 0 1 0 1.84l-7.2 4.47a1.08 1.08 0 0 1-1.63-.93V4.85Z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className={styles.voiceBody}>
        <div className={styles.voiceWaveWrap}>
          <VoiceWaveform messageId={msg.id} progressRatio={progressRatio} bars={waveformBars} />

          <input
            type="range"
            min={0}
            max={Math.max(totalSeconds, 1)}
            step={0.05}
            value={Math.min(currentTime, totalSeconds)}
            onChange={(event) => handleScrub(Number(event.currentTarget.value))}
            className={styles.voiceScrubber}
            aria-label={t("message.voice.timelineAria")}
          />
        </div>

        <div className={styles.voiceFooter}>
          <div className={styles.voiceInfoLeft}>
            <span>{progressLabel}</span>
            <span className={styles.voiceDot} aria-hidden="true" />
            <span>{sizeLabel}</span>
          </div>
          <div className={styles.voiceInfoRight}>
            <button
              type="button"
              className={styles.voiceSpeedBtn}
              onClick={handlePlaybackRateToggle}
              aria-label={playbackRateLabel}
              title={playbackRateLabel}
            >
              {playbackRateLabel}
            </button>
            <span className={styles.voiceMessageTime}>{messageTimeLabel}</span>
            {isOwn && <MessageStatusIcon status={msg.status} />}
          </div>
        </div>
      </div>

      <audio ref={audioRef} preload="none" className={styles.voiceAudio} src={audioUrl}><track kind="captions" /></audio>
    </div>
  ) : (
    <>
      <VoiceDecryptButton loading={loading} onDecrypt={() => void loadAndMaybePlay(true)} />
      <div className={styles.voiceFooter}>
        <div className={styles.voiceInfoLeft}>
          <span>{totalDurationLabel}</span>
          <span className={styles.voiceDot} aria-hidden="true" />
          <span>{sizeLabel}</span>
        </div>
        <div className={styles.voiceInfoRight}>
          <span className={styles.voiceMessageTime}>{messageTimeLabel}</span>
          {isOwn && <MessageStatusIcon status={msg.status} />}
        </div>
      </div>
    </>
  );

  return (
    <div className={`${styles.voiceNote} ${isOwn ? styles.voiceOwn : styles.voiceTheirs}`}>
      {uploadProgress === null ? voicePlayerControl : (
        <div className={styles.voicePlayer}>
          <div className={styles.voiceUploadControl}>
            <AttachmentUploadRing
              progress={uploadProgress}
              onCancel={cancelUpload}
              ariaLabel={t("message.upload.cancel")}
              compact
            />
          </div>
          <div className={styles.voiceBody}>
            <div className={styles.voiceUploadState}>
              <span className={styles.voiceUploadTitle}>{t("message.upload.uploading")}</span>
              <span className={styles.voiceUploadPercent}>{Math.round(uploadProgress)}%</span>
            </div>
            <div className={styles.voiceFooter}>
              <div className={styles.voiceInfoLeft}>
                <span>{totalDurationLabel}</span>
                <span className={styles.voiceDot} aria-hidden="true" />
                <span>{sizeLabel}</span>
              </div>
              <div className={styles.voiceInfoRight}>
                <span className={styles.voiceMessageTime}>{messageTimeLabel}</span>
                {isOwn && <MessageStatusIcon status={msg.status} />}
              </div>
            </div>
          </div>
        </div>
      )}

      {error ? <div className={styles.voiceError}>{error}</div> : null}
    </div>
  );
}
