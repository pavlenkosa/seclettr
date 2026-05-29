import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/i18n";
import { CallControlButton } from "@/calls/shared/presentation/CallControlButton";
import { CallControlsDock } from "@/calls/shared/presentation/CallControlsDock";
import { CallDevicePicker, type VideoResolution } from "@/calls/shared/presentation/CallDevicePicker";
import type { InputDeviceOption } from "@/calls/shared/media/input-devices/useCallInputDevices";
import { BluetoothIcon, CameraIcon, HangupIcon, MuteIcon, PhoneIcon, ScreenShareIcon, SpeakerIcon } from "@/calls/shared/presentation/CallIcons";
import { AudioOutputSelector } from "@/calls/shared/media/audio-output/AudioOutputSelector";
import { useOptionalCallAudioOutput } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { useNativeSpeakerToggle } from "@/calls/shared/media/audio-output/useNativeSpeakerToggle";
import { getNativeAudioRoutes, setNativeAudioRoute, type AudioRouteName, type AudioRoutes } from "@/lib/native-audio-route";
import { PillButton } from "@/components/ui";
import { useIsMobileViewport } from "@/lib/hooks/use-is-mobile-viewport";

import styles from "./DirectCallControls.module.css";

interface DirectCallControlsProps {
  readonly callType: "audio" | "video";
  readonly speakerAriaLabel?: string;
  readonly speakerLabel?: string;
  readonly earphoneLabel?: string;
  readonly muted: boolean;
  readonly videoOff: boolean;
  readonly screenSharing: boolean;
  readonly onToggleMute: () => void;
  readonly onToggleVideo: () => void | Promise<void>;
  readonly onToggleScreenShare: () => void | Promise<void>;
  readonly onHangup: () => void;
  readonly hangupButtonRef?: RefObject<HTMLButtonElement>;
  readonly muteAriaLabel: string;
  readonly muteLabel: string;
  readonly cameraAriaLabel: string;
  readonly cameraLabel: string;
  readonly screenShareAriaLabel: string;
  readonly screenShareLabel: string;
  readonly endAriaLabel: string;
  readonly endLabel: string;
  readonly micDevices?: InputDeviceOption[];
  readonly cameraDevices?: InputDeviceOption[];
  readonly selectedMicId?: string | null;
  readonly selectedCameraId?: string | null;
  readonly selectedVideoResolution?: VideoResolution;
  readonly micSectionLabel?: string;
  readonly cameraSectionLabel?: string;
  readonly resolutionSectionLabel?: string;
  readonly micSettingsAriaLabel?: string;
  readonly cameraSettingsAriaLabel?: string;
  readonly selectedScreenResolution?: VideoResolution;
  readonly screenResolutionLabel?: string;
  readonly screenSettingsAriaLabel?: string;
  readonly onSelectMic?: (deviceId: string) => void;
  readonly onSelectCamera?: (deviceId: string) => void;
  readonly onSelectVideoResolution?: (res: VideoResolution) => void;
  readonly onSelectScreenResolution?: (res: VideoResolution) => void;
}

const canScreenShare =
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getDisplayMedia === "function";

function NativeAudioOutputSheet({
  sheetRef, outputSheetOpen, audioOutputLabel, currentRouteLabel,
  isLoadingRoutes, currentRoute, audioRoutes, resolvedEarphoneLabel,
  resolvedBluetoothLabel, resolvedSpeakerLabel, handleSelectRoute, onClose,
}: {
  sheetRef: RefObject<HTMLDivElement>;
  outputSheetOpen: boolean;
  audioOutputLabel: string;
  currentRouteLabel: string;
  isLoadingRoutes: boolean;
  currentRoute: AudioRouteName;
  audioRoutes: AudioRoutes | null;
  resolvedEarphoneLabel: string;
  resolvedBluetoothLabel: string;
  resolvedSpeakerLabel: string;
  handleSelectRoute: (route: AudioRouteName) => void;
  onClose: () => void;
}) {
  if (!outputSheetOpen) return null;
  return (
    <div
      ref={sheetRef}
      className={styles.audioOutputSheet}
      role="dialog"
      aria-modal="true"
      aria-label={audioOutputLabel}
      tabIndex={-1}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className={styles.audioOutputSheetHeader}>
        <span className={styles.audioOutputSheetTitle}>{audioOutputLabel}</span>
        <span className={styles.audioOutputSheetHint}>{currentRouteLabel}</span>
      </div>
      {isLoadingRoutes ? (
        <div className={styles.audioSheetLoading} aria-live="polite" aria-busy="true" />
      ) : (
        <>
          <button
            type="button"
            className={[
              styles.audioSheetOption,
              currentRoute === "earpiece" ? styles.audioSheetOptionActive : "",
            ].filter(Boolean).join(" ")}
            onClick={() => { void handleSelectRoute("earpiece"); }}
          >
            <PhoneIcon />
            <span>{resolvedEarphoneLabel}</span>
            {currentRoute === "earpiece" ? <span className={styles.audioSheetCheck} aria-hidden="true">✓</span> : null}
          </button>
          {audioRoutes?.hasBluetooth ? (
            <button
              type="button"
              className={[
                styles.audioSheetOption,
                currentRoute === "bluetooth" ? styles.audioSheetOptionActive : "",
              ].filter(Boolean).join(" ")}
              onClick={() => { void handleSelectRoute("bluetooth"); }}
            >
              <BluetoothIcon />
              <span>{resolvedBluetoothLabel}</span>
              {currentRoute === "bluetooth" ? <span className={styles.audioSheetCheck} aria-hidden="true">✓</span> : null}
            </button>
          ) : null}
          <button
            type="button"
            className={[
              styles.audioSheetOption,
              currentRoute === "speaker" ? styles.audioSheetOptionActive : "",
            ].filter(Boolean).join(" ")}
            onClick={() => { void handleSelectRoute("speaker"); }}
          >
            <SpeakerIcon speakerOn />
            <span>{resolvedSpeakerLabel}</span>
            {currentRoute === "speaker" ? <span className={styles.audioSheetCheck} aria-hidden="true">✓</span> : null}
          </button>
        </>
      )}
    </div>
  );
}

function WebAudioOutputSheet({
  sheetRef, outputSheetOpen, audioOutputLabel, onClose,
}: {
  sheetRef: RefObject<HTMLDivElement>;
  outputSheetOpen: boolean;
  audioOutputLabel: string;
  onClose: () => void;
}) {
  if (!outputSheetOpen) return null;
  return (
    <div
      ref={sheetRef}
      className={styles.audioOutputSheet}
      role="dialog"
      aria-modal="true"
      aria-label={audioOutputLabel}
      tabIndex={-1}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className={styles.audioOutputSheetHeader}>
        <span className={styles.audioOutputSheetTitle}>{audioOutputLabel}</span>
      </div>
      <AudioOutputSelector compact hideLabel />
    </div>
  );
}

export function DirectCallControls({
  callType,
  speakerAriaLabel,
  speakerLabel,
  earphoneLabel,
  muted,
  videoOff,
  screenSharing,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onHangup,
  hangupButtonRef,
  muteAriaLabel,
  muteLabel,
  cameraAriaLabel,
  cameraLabel,
  screenShareAriaLabel,
  screenShareLabel,
  endAriaLabel,
  endLabel,
  micDevices = [],
  cameraDevices = [],
  selectedMicId = null,
  selectedCameraId = null,
  selectedVideoResolution = "720p",
  micSectionLabel = "Microphone",
  cameraSectionLabel = "Camera",
  resolutionSectionLabel = "Video quality",
  micSettingsAriaLabel = "Microphone settings",
  cameraSettingsAriaLabel = "Camera settings",
  selectedScreenResolution = "720p",
  screenResolutionLabel = "Screen quality",
  screenSettingsAriaLabel = "Screen share settings",
  onSelectMic,
  onSelectCamera,
  onSelectVideoResolution,
  onSelectScreenResolution,
}: DirectCallControlsProps) {
  const { t } = useI18n();
  const { supported: speakerSupported, speakerOn, toggle: toggleSpeaker } = useNativeSpeakerToggle({
    preferredSpeakerOn: callType === "video",
  });
  const audioOutput = useOptionalCallAudioOutput();
  // On narrow viewports keep the direct-call actions in the same compact toolbar
  // family as desktop instead of switching to a separate card/grid language.
  const isMobile = useIsMobileViewport();
  // Bottom-sheet state for web audio output selection on mobile.
  const [outputSheetOpen, setOutputSheetOpen] = useState(false);

  // Audio route state (Bluetooth-aware). Null until queried on first sheet open.
  const [audioRoutes, setAudioRoutes] = useState<AudioRoutes | null>(null);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);

  // Query available routes and current route when the native sheet opens.
  const loadAudioRoutes = useCallback(async () => {
    setIsLoadingRoutes(true);
    try {
      const routes = await getNativeAudioRoutes();
      if (routes) setAudioRoutes(routes);
    } finally {
      setIsLoadingRoutes(false);
    }
  }, []);

  const handleSelectRoute = useCallback(async (route: AudioRouteName) => {
    await setNativeAudioRoute(route);
    setAudioRoutes((prev) => prev ? { ...prev, currentRoute: route } : prev);
    setOutputSheetOpen(false);
  }, []);

  // Refs for sheet focus management (CAL-03).
  // One ref per sheet variant; trigger refs to restore focus on close.
  const nativeSpeakerSheetRef = useRef<HTMLDivElement>(null);
  const webOutputSheetRef = useRef<HTMLDivElement>(null);
  const nativeSpeakerBtnRef = useRef<HTMLButtonElement>(null);
  const webOutputBtnRef = useRef<HTMLButtonElement>(null);

  // Move focus into the active sheet when it opens; return to trigger on close.
  // Also query audio routes when the native sheet opens.
  useEffect(() => {
    if (outputSheetOpen) {
      const sheet = nativeSpeakerSheetRef.current ?? webOutputSheetRef.current;
      sheet?.focus();
      if (speakerSupported) void loadAudioRoutes();
    } else {
      const btn = nativeSpeakerBtnRef.current ?? webOutputBtnRef.current;
      btn?.focus();
    }
  }, [outputSheetOpen, speakerSupported, loadAudioRoutes]);

  const resolvedSpeakerLabel = speakerLabel ?? t("call.speaker");
  const resolvedSpeakerAriaLabel = speakerAriaLabel ?? t("call.speakerAria");
  const resolvedEarphoneLabel = earphoneLabel ?? t("call.earpiece");
  const resolvedBluetoothLabel = t("call.bluetooth");
  const audioOutputLabel = t("call.audioOutput.label");

  // Derive the display-facing current route from live audioRoutes state,
  // falling back to the speakerOn boolean when routes haven't been queried yet.
  const currentRoute: AudioRouteName = audioRoutes?.currentRoute
    ?? (speakerOn ? "speaker" : "earpiece");

  const currentRouteLabel =
    currentRoute === "bluetooth" ? resolvedBluetoothLabel
    : currentRoute === "speaker" ? resolvedSpeakerLabel
    : resolvedEarphoneLabel;

  const currentRouteIcon =
    currentRoute === "bluetooth" ? <BluetoothIcon />
    : currentRoute === "speaker" ? <SpeakerIcon speakerOn />
    : <PhoneIcon />;

  // Web-audio output button is shown on mobile when native speaker toggle is unavailable
  // but the browser supports output selection (or can prompt for it).
  const showWebOutputButton = !speakerSupported && (
    audioOutput?.support === "full" || audioOutput?.canPromptForDevices === true
  );

  if (isMobile) {
    const mobileClass = `${styles.controlBtn} ${styles.mobileToolbarBtn}`;
    const showOutputTrigger = speakerSupported || showWebOutputButton;

    return (
      <>
        {showOutputTrigger ? (
          <div className={styles.mobileAudioOutputBar}>
            <PillButton
              ref={speakerSupported ? nativeSpeakerBtnRef : webOutputBtnRef}
              onClick={() => { setOutputSheetOpen((prev) => !prev); }}
              className={styles.mobileAudioOutputButton}
              tone={outputSheetOpen ? "accent" : "neutral"}
              appearance="soft"
              size="sm"
              leading={speakerSupported ? currentRouteIcon : <SpeakerIcon speakerOn />}
              aria-label={audioOutputLabel}
              aria-expanded={outputSheetOpen}
              aria-haspopup="dialog"
            >
              {speakerSupported ? currentRouteLabel : audioOutputLabel}
            </PillButton>
          </div>
        ) : null}
        <CallControlsDock className={styles.controlsDock}>
          <CallControlButton
            onClick={onToggleMute}
            layout="inline"
            className={mobileClass}
            active={muted}
            icon={<MuteIcon muted={muted} />}
            label={muteLabel}
            collapseLabelOnNarrow
            compactOnNarrow
            aria-label={muteAriaLabel}
            aria-pressed={muted}
          />
          <CallControlButton
            onClick={() => { void onToggleVideo(); }}
            layout="inline"
            className={mobileClass}
            active={videoOff}
            icon={<CameraIcon />}
            label={cameraLabel}
            collapseLabelOnNarrow
            compactOnNarrow
            aria-label={cameraAriaLabel}
            aria-pressed={videoOff}
          />
          {canScreenShare ? (
            <CallControlButton
              onClick={() => { void onToggleScreenShare(); }}
              layout="inline"
              className={mobileClass}
              active={screenSharing}
              icon={<ScreenShareIcon />}
              label={screenShareLabel}
              collapseLabelOnNarrow
              compactOnNarrow
              aria-label={screenShareAriaLabel}
              aria-pressed={screenSharing}
            />
          ) : null}
          <CallControlButton
            ref={hangupButtonRef}
            onClick={onHangup}
            layout="inline"
            className={mobileClass}
            tone="danger"
            icon={<HangupIcon />}
            label={endLabel}
            collapseLabelOnNarrow
            compactOnNarrow
            aria-label={endAriaLabel}
          />
        </CallControlsDock>
        {speakerSupported ? (
          <>
            <div
              className={styles.audioOutputScrim}
              onClick={() => { setOutputSheetOpen(false); }}
              aria-hidden="true"
              hidden={!outputSheetOpen}
            />
            <NativeAudioOutputSheet
              sheetRef={nativeSpeakerSheetRef}
              outputSheetOpen={outputSheetOpen}
              audioOutputLabel={audioOutputLabel}
              currentRouteLabel={currentRouteLabel}
              isLoadingRoutes={isLoadingRoutes}
              currentRoute={currentRoute}
              audioRoutes={audioRoutes}
              resolvedEarphoneLabel={resolvedEarphoneLabel}
              resolvedBluetoothLabel={resolvedBluetoothLabel}
              resolvedSpeakerLabel={resolvedSpeakerLabel}
              handleSelectRoute={handleSelectRoute}
              onClose={() => { setOutputSheetOpen(false); }}
            />
          </>
        ) : showWebOutputButton ? (
          <>
            <div
              className={styles.audioOutputScrim}
              onClick={() => { setOutputSheetOpen(false); }}
              aria-hidden="true"
              hidden={!outputSheetOpen}
            />
            <WebAudioOutputSheet
              sheetRef={webOutputSheetRef}
              outputSheetOpen={outputSheetOpen}
              audioOutputLabel={audioOutputLabel}
              onClose={() => { setOutputSheetOpen(false); }}
            />
          </>
        ) : null}
      </>
    );
  }

  return (
    <CallControlsDock className={styles.controlsDock}>
      <CallDevicePicker
        micDevices={micDevices}
        selectedMicId={selectedMicId}
        micSectionLabel={micSectionLabel}
        onSelectMic={onSelectMic}
        chevronAriaLabel={micSettingsAriaLabel}
        active={muted}
      >
        <CallControlButton
          onClick={onToggleMute}
          className={styles.controlBtn}
          active={muted}
          icon={<MuteIcon muted={muted} />}
          label={muteLabel}
          collapseLabelOnNarrow
          compactOnNarrow
          aria-label={muteAriaLabel}
          aria-pressed={muted}
        />
      </CallDevicePicker>

      <CallDevicePicker
        cameraDevices={cameraDevices}
        selectedCameraId={selectedCameraId}
        cameraSectionLabel={cameraSectionLabel}
        selectedResolution={selectedVideoResolution}
        showResolution={!videoOff}
        resolutionSectionLabel={resolutionSectionLabel}
        onSelectCamera={onSelectCamera}
        onSelectResolution={onSelectVideoResolution}
        chevronAriaLabel={cameraSettingsAriaLabel}
        active={videoOff}
      >
        <CallControlButton
          onClick={() => { void onToggleVideo(); }}
          className={styles.controlBtn}
          active={videoOff}
          icon={<CameraIcon />}
          label={cameraLabel}
          collapseLabelOnNarrow
          compactOnNarrow
          aria-label={cameraAriaLabel}
          aria-pressed={videoOff}
        />
      </CallDevicePicker>

      {canScreenShare ? (
        <CallDevicePicker
          selectedResolution={selectedScreenResolution}
          showResolution={screenSharing}
          resolutionSectionLabel={screenResolutionLabel}
          onSelectResolution={onSelectScreenResolution}
          chevronAriaLabel={screenSettingsAriaLabel}
          active={screenSharing}
        >
          <CallControlButton
            onClick={() => { void onToggleScreenShare(); }}
            className={styles.controlBtn}
            active={screenSharing}
            icon={<ScreenShareIcon />}
            label={screenShareLabel}
            collapseLabelOnNarrow
            compactOnNarrow
            aria-label={screenShareAriaLabel}
            aria-pressed={screenSharing}
          />
        </CallDevicePicker>
      ) : null}

      {speakerSupported ? (
        <CallControlButton
          onClick={toggleSpeaker}
          className={styles.controlBtn}
          active={speakerOn}
          icon={<SpeakerIcon speakerOn={speakerOn} />}
          label={resolvedSpeakerLabel}
          collapseLabelOnNarrow
          compactOnNarrow
          aria-label={resolvedSpeakerAriaLabel}
          aria-pressed={speakerOn}
        />
      ) : null}

      <CallControlButton
        ref={hangupButtonRef}
        onClick={onHangup}
        className={styles.controlBtn}
        tone="danger"
        icon={<HangupIcon />}
        label={endLabel}
        collapseLabelOnNarrow
        compactOnNarrow
        aria-label={endAriaLabel}
      />
    </CallControlsDock>
  );
}
