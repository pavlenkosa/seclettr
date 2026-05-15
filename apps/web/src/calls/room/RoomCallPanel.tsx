import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobileViewport } from "@/lib/hooks";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { joinRoomAndStartSfu, type RoomCallSession, type RoomSfuClient } from "./room-call-bootstrap";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import type { RoomParticipantsResponse } from "@seclettr/protocol";

import { GroupCallControls } from "@/calls/group/presentation/components/GroupCallControls";
import { GroupCallDock } from "@/calls/group/presentation/components/GroupCallDock";
import { GroupCallHeader } from "@/calls/group/presentation/components/GroupCallHeader";
import { GroupCallMediaTile } from "@/calls/group/presentation/components/GroupCallMediaTile";
import { GroupCallRemoteAudioTargets } from "@/calls/group/presentation/components/GroupCallRemoteAudioTargets";
import { useGroupCallPanelDock } from "@/calls/group/presentation/useGroupCallPanelDock";
import { useCallInputDevices } from "@/calls/shared/media/input-devices/useCallInputDevices";
import { CallAudioOutputProvider } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { CallControlsDock } from "@/calls/shared/presentation/CallControlsDock";
import { CallDurationText } from "@/calls/shared/presentation/CallDurationText";
import { CallPanelShell } from "@/calls/shared/presentation/CallPanelShell";
import { getMemberInitials, resolveGroupCallDockInlineStyle } from "@/calls/group/presentation/display";
import { Avatar, EntityRow, FieldSection, InlineNotice, PillButton, SurfacePanel } from "@/components/ui";
import { DetailsIcon } from "@/calls/group/presentation/components/GroupCallIcons";

import groupStyles from "@/calls/group/presentation/GroupCallPanel.module.css";
import styles from "./RoomCallPanel.module.css";

interface Props {
  readonly session: RoomCallSession;
  readonly onLeave: () => void;
}

type RoomStatus = "connecting" | "ready" | "error" | "leaving";

function hasEnabledLiveAudioTrack(stream: MediaStream | null): boolean {
  return Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live" && track.enabled));
}

export function RoomCallPanel({ session, onLeave }: Props) {
  const { t } = useI18n();
  const isMobileViewport = useIsMobileViewport();

  const [isMinimized, setIsMinimized] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(session.callType === "video");
  const [isVideoSwitching, setIsVideoSwitching] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isScreenSwitching, setIsScreenSwitching] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState<GroupCallRemoteMedia[]>([]);
  const [participants, setParticipants] = useState<RoomParticipantsResponse["participants"]>([]);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [callStartMs, setCallStartMs] = useState<number | null>(null);

  const sfuClientRef = useRef<RoomSfuClient | null>(null);
  const abortRef = useRef<AbortController>(new AbortController());
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const {
    isDraggingMinimizedDock,
    minimizedDockRef,
    dockInlineStyle,
    resetMinimizedDock,
    startMinimizedDockDrag,
    moveMinimizedDock,
    stopMinimizedDockDrag,
  } = useGroupCallPanelDock({ isMinimized });

  const { micDevices, cameraDevices, selectedMicId, selectedCameraId } = useCallInputDevices(localStream);

  const handleMinimize = useCallback(() => setIsMinimized(true), []);
  const handleRestore = useCallback(() => setIsMinimized(false), []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const handleLeave = useCallback(() => {
    setStatus("leaving");
    abortRef.current.abort();
    sfuClientRef.current?.close();
    sfuClientRef.current = null;
    stopLocalStream();
    resetMinimizedDock();
    onLeave();
  }, [onLeave, stopLocalStream, resetMinimizedDock]);

  const handleEndForEveryone = useCallback(() => {
    if (!session.isHost) return;
    setStatus("leaving");
    abortRef.current.abort();
    sfuClientRef.current?.close();
    sfuClientRef.current = null;
    stopLocalStream();
    resetMinimizedDock();
    void api.closeRoom(session.callId).catch(() => {});
    onLeave();
  }, [session.isHost, session.callId, onLeave, stopLocalStream, resetMinimizedDock]);

  const handleKickGuest = useCallback(async (guestId: string) => {
    if (!session.isHost || kickingId) return;
    setKickingId(guestId);
    try {
      await api.kickRoomGuest(session.callId, guestId);
      setParticipants((prev) => prev.filter((p) => p.id !== guestId));
    } catch { /* best-effort */ }
    finally { setKickingId(null); }
  }, [session.isHost, session.callId, kickingId]);

  const handleCopyInvite = useCallback(async () => {
    if (!session.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(session.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [session.inviteUrl]);

  const handleToggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !isAudioMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setIsAudioMuted(next);
  }, [isAudioMuted]);

  const handleToggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    const client = sfuClientRef.current?.sfuClient;
    if (!stream || !client || isVideoSwitching || isScreenSwitching || status !== "ready") return;
    setIsVideoSwitching(true);

    const currentTrack = stream.getVideoTracks()[0] ?? null;
    if (currentTrack) {
      try {
        await client.setVideoTrack(null, "camera");
        stream.removeTrack(currentTrack);
        currentTrack.stop();
        setIsVideoEnabled(false);
      } catch { /* ignore */ }
      finally { setIsVideoSwitching(false); }
      return;
    }

    let nextTrack: MediaStreamTrack | null = null;
    try {
      const capture = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      });
      nextTrack = capture.getVideoTracks()[0] ?? null;
      if (!nextTrack) throw new Error("No video track");
      await client.setVideoTrack(nextTrack, "camera");
      stream.addTrack(nextTrack);
      setIsVideoEnabled(true);
    } catch { nextTrack?.stop(); }
    finally { setIsVideoSwitching(false); }
  }, [isVideoSwitching, isScreenSwitching, status]);

  const handleToggleScreenShare = useCallback(async () => {
    const stream = localStreamRef.current;
    const client = sfuClientRef.current?.sfuClient;
    if (!stream || !client || isScreenSwitching || isVideoSwitching || status !== "ready") return;
    setIsScreenSwitching(true);

    if (isScreenSharing) {
      const screenTrack = stream.getVideoTracks().find((t) => t.label.includes("screen") || t.contentHint === "detail") ?? null;
      try {
        await client.setVideoTrack(null, "screen");
        if (screenTrack) { stream.removeTrack(screenTrack); screenTrack.stop(); }
        setIsScreenSharing(false);
      } catch { /* ignore */ }
      finally { setIsScreenSwitching(false); }
      return;
    }

    let nextTrack: MediaStreamTrack | null = null;
    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { frameRate: { ideal: 15, max: 30 } } });
      nextTrack = capture.getVideoTracks()[0] ?? null;
      if (!nextTrack) throw new Error("No screen track");
      await client.setVideoTrack(nextTrack, "screen");
      stream.addTrack(nextTrack);
      setIsScreenSharing(true);
      nextTrack.addEventListener("ended", () => void handleToggleScreenShare(), { once: true });
    } catch { nextTrack?.stop(); }
    finally { setIsScreenSwitching(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScreenSwitching, isVideoSwitching, isScreenSharing, status]);

  const handleSwitchMic = useCallback(async (deviceId: string) => {
    const stream = localStreamRef.current;
    const client = sfuClientRef.current?.sfuClient;
    if (!stream || status !== "ready") return;
    let nextTrack: MediaStreamTrack | null = null;
    try {
      const capture = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
      nextTrack = capture.getAudioTracks()[0] ?? null;
      if (!nextTrack) throw new Error("No audio track");
      const wasMuted = !stream.getAudioTracks()[0]?.enabled;
      nextTrack.enabled = !wasMuted;
      const old = stream.getAudioTracks()[0] ?? null;
      if (old) { stream.removeTrack(old); old.stop(); }
      stream.addTrack(nextTrack);
      if (client) await client.setAudioTrack(nextTrack);
    } catch { nextTrack?.stop(); }
  }, [status]);

  const handleSwitchCamera = useCallback(async (deviceId: string) => {
    const stream = localStreamRef.current;
    const client = sfuClientRef.current?.sfuClient;
    if (!stream || !client || status !== "ready") return;
    let nextTrack: MediaStreamTrack | null = null;
    try {
      const capture = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: deviceId } } });
      nextTrack = capture.getVideoTracks()[0] ?? null;
      if (!nextTrack) throw new Error("No video track");
      const old = stream.getVideoTracks()[0] ?? null;
      if (old) { stream.removeTrack(old); old.stop(); }
      stream.addTrack(nextTrack);
      await client.setVideoTrack(nextTrack, "camera");
    } catch { nextTrack?.stop(); }
  }, [status]);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current = ac;

    const start = async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: session.callType === "video",
        });
        localStreamRef.current = stream;
        setLocalStream(stream);

        if (ac.signal.aborted) { stream.getTracks().forEach((t) => t.stop()); return; }

        const client = await joinRoomAndStartSfu(
          session,
          stream,
          (media) => setRemoteMedia(media),
          () => { if (!ac.signal.aborted) { setStatus("error"); setErrorMessage("Connection lost. Please rejoin."); } },
          ac.signal
        );

        if (ac.signal.aborted) { client.close(); stream.getTracks().forEach((t) => t.stop()); return; }

        sfuClientRef.current = client;
        setCallStartMs(Date.now());
        setStatus("ready");
      } catch (err) {
        if (ac.signal.aborted) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : t("room.call.error.connectFailed"));
        stream?.getTracks().forEach((t) => t.stop());
      }
    };

    void start();
    return () => {
      ac.abort();
      sfuClientRef.current?.close();
      sfuClientRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    let active = true;
    const fetch = async () => {
      try {
        const res = await api.getRoomParticipants(session.callId, session.guestToken ?? undefined);
        if (active) setParticipants(res.participants);
      } catch { /* best-effort */ }
    };
    void fetch();
    const id = setInterval(() => void fetch(), 10_000);
    return () => { active = false; clearInterval(id); };
  }, [status, session.callId, session.guestToken]);

  const isReady = status === "ready";
  const hasLocalMedia = Boolean(localStream);
  const resolvedDockInlineStyle = resolveGroupCallDockInlineStyle(dockInlineStyle);
  const displayInitials = session.displayName.slice(0, 2).toUpperCase();

  const statusLabel =
    status === "connecting" ? t("group.call.starting")
    : status === "leaving" ? t("group.call.leaving")
    : status === "error" ? (errorMessage ?? t("room.call.error.connection"))
    : t("group.call.ready");

  const muteToggleLabel = isAudioMuted ? t("call.unmute") : t("call.mute");
  const videoToggleLabel = isVideoEnabled ? t("group.call.disableVideo") : t("group.call.enableVideo");
  const screenShareToggleLabel = isScreenSharing ? t("group.call.stopScreenShare") : t("group.call.startScreenShare");
  const leaveLabel = t("group.call.leave");
  const endForEveryoneLabel = t("group.call.endForEveryone");

  const participantNameById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant.displayName])),
    [participants]
  );

  const screenShareStream = useMemo(() => {
    if (!isScreenSharing || !localStream) return null;
    const track = localStream.getVideoTracks().find((t) => t.contentHint === "detail" || t.label.toLowerCase().includes("screen")) ?? null;
    if (!track) return null;
    const s = new MediaStream();
    s.addTrack(track);
    return s;
  }, [isScreenSharing, localStream]);

  const allTiles = useMemo(() => {
    const localVideoStream = isVideoEnabled ? localStream : null;
    const localHasAudio = !isAudioMuted && hasEnabledLiveAudioTrack(localStream);
    const localTile = {
      id: "local",
      label: session.displayName,
      stream: localVideoStream,
      audioStream: localStream,
      hasAudio: localHasAudio,
      fallbackInitials: displayInitials,
      badge: isAudioMuted ? t("call.mute") : undefined,
      muted: true as const,
      videoSource: isVideoEnabled ? ("camera" as const) : null,
    };
    const remoteTiles = remoteMedia.map((media) => {
      const displayName = participantNameById.get(media.userId) ?? media.userId.slice(0, 8);
      return {
        id: media.mediaId,
        label: displayName,
        stream: media.videoStream,
        audioStream: media.audioStream,
        hasAudio: media.hasAudio,
        fallbackInitials: getMemberInitials(displayName),
        badge: media.hasVideo
          ? media.videoSource === "screen"
            ? t("group.call.screenSharing")
            : t("group.call.videoOn")
          : t("group.call.audioOnly"),
        muted: false as const,
        videoSource: media.videoSource,
      };
    });
    const screenTile = screenShareStream ? {
      id: "local:screen",
      label: session.displayName,
      stream: screenShareStream,
      audioStream: null,
      hasAudio: false,
      fallbackInitials: displayInitials,
      badge: t("group.call.screenSharing"),
      muted: true as const,
      videoSource: "screen" as const,
    } : null;

    return [localTile, ...(screenTile ? [screenTile] : []), ...remoteTiles];
  }, [
    displayInitials,
    isAudioMuted,
    isVideoEnabled,
    localStream,
    participantNameById,
    remoteMedia,
    screenShareStream,
    session.displayName,
    t,
  ]);
  const shouldRenderRoomSidePanel = isParticipantsOpen && !isMobileViewport;
  const isSoloTile = allTiles.length === 1;
  const isSoloVideoTile = isSoloTile && Boolean(allTiles[0]?.stream?.getVideoTracks().length);
  const mediaGridClassName = [
    groupStyles.mediaGrid,
    isSoloTile ? groupStyles.mediaGridSolo : "",
    isSoloTile ? styles.roomMediaGridSolo : styles.roomMediaGrid,
  ].filter(Boolean).join(" ");
  const mediaTileClassName = [
    styles.roomMediaTile,
    isSoloVideoTile ? styles.roomMediaTileSoloVideo : "",
  ].filter(Boolean).join(" ");

  const inviteCard = session.isHost && session.inviteUrl ? (
    <FieldSection className={styles.sideSection} label={t("room.call.invite.label")}>
      <SurfacePanel className={styles.inviteCard} padding="md" radius="lg">
        <div className={styles.inviteText}>
          <span className={styles.inviteTitle}>{t("room.call.invite.title")}</span>
          <span className={styles.inviteHint}>{t("room.call.invite.hint")}</span>
          <code className={styles.inviteUrl} title={session.inviteUrl}>
            {session.inviteUrl}
          </code>
        </div>
        <PillButton
          type="button"
          onClick={() => void handleCopyInvite()}
          tone={copied ? "accent" : "neutral"}
          appearance="soft"
          size="sm"
          aria-label={copied ? t("room.call.invite.copiedAriaLabel") : t("room.call.invite.copyAriaLabel")}
          leading={<DetailsIcon />}
        >
          {copied ? t("room.call.invite.copied") : t("room.call.invite.copy")}
        </PillButton>
      </SurfacePanel>
    </FieldSection>
  ) : null;

  const participantsPanel = (
    <FieldSection
      className={styles.sideSection}
      label={t("room.call.participants.label", { count: participants.length })}
    >
      <div className={styles.participantsList}>
        {participants.length === 0 ? (
          <InlineNotice className={styles.participantsEmpty} tone="info" size="sm">
            {t("room.call.participants.empty")}
          </InlineNotice>
        ) : null}
        {session.isHost ? (
          <SurfacePanel className={styles.hostActions} padding="md" radius="lg">
            <p className={styles.hostActionHint}>{t("group.call.endForEveryoneHint")}</p>
            <PillButton
              type="button"
              tone="danger"
              appearance="soft"
              size="md"
              onClick={handleEndForEveryone}
            >
              {endForEveryoneLabel}
            </PillButton>
          </SurfacePanel>
        ) : null}
        {participants.map((p) => (
          <SurfacePanel
            key={p.id}
            className={styles.participantCard}
            padding="none"
            radius="lg"
          >
            <EntityRow
              as="div"
              size="sm"
              className={styles.participantRow}
              leading={(
                <Avatar
                  label={p.displayName}
                  initials={getMemberInitials(p.displayName)}
                  className={styles.participantAvatar}
                  ariaHidden
                />
              )}
              title={p.displayName}
              titleClassName={styles.participantName}
              trailing={(
                <div className={styles.participantActions}>
                  {!p.isGuest ? (
                    <span className={styles.hostBadge}>{t("room.call.participant.host")}</span>
                  ) : null}
                  {session.isHost && p.isGuest ? (
                    <PillButton
                      type="button"
                      tone="danger"
                      appearance="soft"
                      size="sm"
                      onClick={() => void handleKickGuest(p.id)}
                      disabled={kickingId === p.id}
                    >
                      {kickingId === p.id
                        ? t("room.call.participant.removing")
                        : t("room.call.participant.remove")}
                    </PillButton>
                  ) : null}
                </div>
              )}
            />
          </SurfacePanel>
        ))}
      </div>
    </FieldSection>
  );

  const connectingState = status === "connecting" ? (
    <SurfacePanel className={styles.centeredState} padding="lg" radius="xl">
      <p className={styles.mutedText}>{t("group.call.starting")}</p>
    </SurfacePanel>
  ) : null;

  const errorState = status === "error" ? (
    <SurfacePanel className={styles.centeredState} padding="lg" radius="xl">
      <InlineNotice className={styles.errorNotice} tone="error" size="md" role="alert">
        {errorMessage ?? t("room.call.error.connection")}
      </InlineNotice>
      <div className={styles.stateActions}>
        <PillButton
          type="button"
          tone="danger"
          appearance="soft"
          size="md"
          onClick={handleLeave}
        >
          {leaveLabel}
        </PillButton>
      </div>
    </SurfacePanel>
  ) : null;

  const bodyClassName = [
    groupStyles.body,
    shouldRenderRoomSidePanel ? groupStyles.bodyWithSidePanel : "",
  ].filter(Boolean).join(" ");

  // ── Dock (minimized) ─────────────────────────────────────────────────────────
  if (isMinimized) {
    const dockContent = (
      <CallAudioOutputProvider>
        <GroupCallRemoteAudioTargets remoteMedia={remoteMedia} />
        <GroupCallDock
          groupName={t("room.call.title")}
          groupInitials={t("room.call.initials")}
          isDragging={isDraggingMinimizedDock}
          dockRef={minimizedDockRef}
          inlineStyle={resolvedDockInlineStyle}
          dockMetaLabel={(
            <CallDurationText baseSeconds={0} startedAtMs={callStartMs} />
          )}
          leaveActionLabel={leaveLabel}
          onRestore={handleRestore}
          onLeave={handleLeave}
          onDragStart={startMinimizedDockDrag}
          onDragMove={moveMinimizedDock}
          onDragEnd={stopMinimizedDockDrag}
        />
      </CallAudioOutputProvider>
    );
    return createPortal(dockContent, document.body);
  }

  // ── Full panel ───────────────────────────────────────────────────────────────
  const panelDialog = (
    <CallPanelShell
      ariaLabel={t("room.call.title")}
      backdropClassName={groupStyles.backdrop}
      panelClassName={groupStyles.panel}
    >
        <GroupCallHeader
          groupName={t("room.call.title")}
          memberCount={participants.length}
          title={isReady ? t(participants.length === 1 ? "room.call.status.participants.one" : "room.call.status.participants.other", { count: participants.length }) : statusLabel}
          callDurationSeconds={0}
          callDurationStartedAtMs={callStartMs}
          hasVisibleVideo={isVideoEnabled}
          hasRemoteScreenShare={false}
          heroStatusLabel={statusLabel}
          heroStatusTone={status === "error" ? "danger" : isReady ? "success" : "neutral"}
          detailsLabel={t("group.call.detailsTab")}
          detailsToggleLabel={t("group.call.detailsTab")}
          isDetailsOpen={isParticipantsOpen}
          onToggleDetails={() => setIsParticipantsOpen((v) => !v)}
          onMinimize={handleMinimize}
        />

        <div className={bodyClassName}>
          <div className={groupStyles.mainColumn}>
            {!shouldRenderRoomSidePanel ? inviteCard : null}

            {errorState}

            {connectingState}

            {/* Media tiles grid */}
            {isReady && (
              <div className={mediaGridClassName}>
                {allTiles.map((tile) => (
                  <GroupCallMediaTile
                    key={tile.id}
                    className={mediaTileClassName}
                    label={tile.label}
                    stream={tile.stream}
                    audioStream={tile.audioStream}
                    hasAudio={tile.hasAudio}
                    fallbackInitials={tile.fallbackInitials}
                    badge={tile.badge}
                    muted={tile.muted}
                    variant={allTiles.length <= 2 ? "stage" : "strip"}
                    videoSource={tile.videoSource}
                  />
                ))}
              </div>
            )}

            {/* Participants list */}
            {isParticipantsOpen && !shouldRenderRoomSidePanel ? participantsPanel : null}
          </div>
          {shouldRenderRoomSidePanel ? (
            <aside className={styles.roomSidePanel}>
              {inviteCard}
              {participantsPanel}
            </aside>
          ) : null}
        </div>

        <CallControlsDock className={groupStyles.bottomDock}>
          <GroupCallControls
            className={groupStyles.controlRail}
            layout="inline"
            hasLocalMedia={hasLocalMedia}
            status={isReady ? "ready" : "starting"}
            isAudioMuted={isAudioMuted}
            isLocalVideoEnabled={isVideoEnabled}
            isLocalScreenSharing={isScreenSharing}
            isVideoSwitching={isVideoSwitching}
            isScreenSwitching={isScreenSwitching}
            muteToggleLabel={muteToggleLabel}
            videoToggleLabel={videoToggleLabel}
            screenShareToggleLabel={screenShareToggleLabel}
            leaveActionLabel={leaveLabel}
            micDevices={micDevices}
            cameraDevices={cameraDevices}
            selectedMicId={selectedMicId}
            selectedCameraId={selectedCameraId}
            onToggleMute={handleToggleMute}
            onToggleVideo={() => void handleToggleVideo()}
            onToggleScreenShare={() => void handleToggleScreenShare()}
            onLeave={handleLeave}
            onSelectMic={(id) => void handleSwitchMic(id)}
            onSelectCamera={(id) => void handleSwitchCamera(id)}
          />
        </CallControlsDock>
    </CallPanelShell>
  );

  return createPortal(
    <CallAudioOutputProvider>
      <GroupCallRemoteAudioTargets remoteMedia={remoteMedia} />
      {panelDialog}
    </CallAudioOutputProvider>,
    document.body
  );
}
