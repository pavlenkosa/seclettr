import { useI18n } from "@/i18n";
import { Avatar, EntityRow, FieldSection, InlineNotice, PillButton, SurfacePanel } from "@/components/ui";
import { getMemberInitials } from "@/calls/group/presentation/display";
import { AudioOutputSelector } from "@/calls/shared/media/audio-output/AudioOutputSelector";
import { useNativeSpeakerToggle } from "@/calls/shared/media/audio-output/useNativeSpeakerToggle";
import { PhoneIcon, SpeakerIcon } from "@/calls/shared/presentation/CallIcons";
import type { RoomParticipantsResponse } from "@seclettr/protocol";
import styles from "../RoomCallPanel.module.css";

type RoomParticipant = RoomParticipantsResponse["participants"][number];

interface RoomCallParticipantsSectionProps {
  readonly participants: RoomParticipant[];
  readonly isHost: boolean;
  readonly kickingId: string | null;
  readonly onKickGuest: (guestId: string) => void;
  readonly onEndForEveryone: () => void;
}

/**
 * Room-local presentation: participants list, host end-for-everyone action,
 * and per-guest remove action. Kick/end runtime stays in `RoomCallPanel` —
 * this only renders already-shaped participants and reports intent upward.
 */
export function RoomCallParticipantsSection({
  participants,
  isHost,
  kickingId,
  onKickGuest,
  onEndForEveryone,
}: RoomCallParticipantsSectionProps) {
  const { t } = useI18n();
  const { supported: speakerSupported, speakerOn, toggle: toggleSpeaker } = useNativeSpeakerToggle();

  return (
    <>
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
          {isHost ? (
            <SurfacePanel className={styles.hostActions} padding="md" radius="lg">
              <p className={styles.hostActionHint}>{t("group.call.endForEveryoneHint")}</p>
              <PillButton type="button" tone="danger" appearance="soft" size="md" onClick={onEndForEveryone}>
                {t("group.call.endForEveryone")}
              </PillButton>
            </SurfacePanel>
          ) : null}
          {participants.map((p) => (
            <SurfacePanel key={p.id} className={styles.participantCard} padding="none" radius="lg">
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
                    {isHost && p.isGuest ? (
                      <PillButton
                        type="button"
                        tone="danger"
                        appearance="soft"
                        size="sm"
                        onClick={() => onKickGuest(p.id)}
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

      <FieldSection className={styles.sideSection} label={t("call.audioOutput.label")}>
        {speakerSupported ? (
          /* Native Android: earpiece / speaker options with multi-attempt
             backoff earpiece default applied by useNativeSpeakerToggle. */
          <div className={styles.nativeSpeakerCard}>
            <button
              type="button"
              className={[
                styles.nativeSpeakerOption,
                !speakerOn ? styles.nativeSpeakerOptionActive : "",
              ].filter(Boolean).join(" ")}
              onClick={() => { if (speakerOn) toggleSpeaker(); }}
              aria-pressed={!speakerOn}
            >
              <PhoneIcon />
              <span>{t("call.earpiece")}</span>
              {!speakerOn ? <span className={styles.nativeSpeakerCheck} aria-hidden="true">✓</span> : null}
            </button>
            <button
              type="button"
              className={[
                styles.nativeSpeakerOption,
                speakerOn ? styles.nativeSpeakerOptionActive : "",
              ].filter(Boolean).join(" ")}
              onClick={() => { if (!speakerOn) toggleSpeaker(); }}
              aria-pressed={speakerOn}
            >
              <SpeakerIcon speakerOn={speakerOn} />
              <span>{t("call.speaker")}</span>
              {speakerOn ? <span className={styles.nativeSpeakerCheck} aria-hidden="true">✓</span> : null}
            </button>
          </div>
        ) : (
          /* Web / desktop: standard AudioOutputSelector (setSinkId). */
          <AudioOutputSelector />
        )}
      </FieldSection>
    </>
  );
}
