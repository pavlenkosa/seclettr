import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { useAnimatedClose } from "@/lib/hooks";
import { ModalShell, PillButton, SegmentedControl, SelectField } from "@/components/ui";
import type { RoomCreateResponse } from "@seclettr/protocol";
import styles from "./CreateRoomDialog.module.css";

interface Props {
  readonly onClose: () => void;
  readonly onRoomCreated: (result: RoomCreateResponse, callType: "audio" | "video") => void;
}

type CallType = "audio" | "video";

const TTL_OPTIONS: { key: string; minutes: number }[] = [
  { key: "room.create.ttl.minutes15", minutes: 15 },
  { key: "room.create.ttl.hours1", minutes: 60 },
  { key: "room.create.ttl.hours4", minutes: 240 },
  { key: "room.create.ttl.hours24", minutes: 1440 },
  { key: "room.create.ttl.days7", minutes: 10080 },
];

export function CreateRoomDialog({ onClose, onRoomCreated }: Props) {
  const { t } = useI18n();
  const { isClosing, requestClose } = useAnimatedClose(onClose);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [callType, setCallType] = useState<CallType>("audio");
  const [expiresInMinutes, setExpiresInMinutes] = useState(60);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await api.createRoom({ callType, expiresInMinutes });
      onRoomCreated(res, callType);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("room.create.error.createFailed"));
      setIsCreating(false);
    }
  }, [callType, expiresInMinutes, onRoomCreated, t]);

  const callTypeOptions: { value: CallType; label: string }[] = [
    { value: "audio", label: t("room.create.callType.audio") },
    { value: "video", label: t("room.create.callType.video") },
  ];

  return (
    <ModalShell
      ref={null}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("room.create.title")}
      closeAriaLabel={t("room.create.closeAria")}
      closeButtonRef={closeButtonRef}
      title={t("room.create.title")}
      bodyClassName={styles.body}
      footer={
        <div className={styles.footer}>
          <PillButton
            type="button"
            tone="neutral"
            appearance="soft"
            size="md"
            onClick={requestClose}
            disabled={isCreating}
          >
            {t("room.create.cancel")}
          </PillButton>
          <PillButton
            type="button"
            tone="accent"
            appearance="strong"
            size="md"
            onClick={() => { void handleCreate(); }}
            disabled={isCreating}
          >
            {isCreating ? t("room.create.submitting") : t("room.create.submit")}
          </PillButton>
        </div>
      }
    >
      <div className={styles.field}>
        <span className={styles.label}>{t("room.create.callTypeLabel")}</span>
        <SegmentedControl
          value={callType}
          onChange={setCallType}
          ariaLabel={t("room.create.callTypeLabel")}
          options={callTypeOptions}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>{t("room.create.expiresLabel")}</label>
        <SelectField
          aria-label={t("room.create.expiresLabel")}
          value={expiresInMinutes}
          onChange={(e) => setExpiresInMinutes(Number(e.target.value))}
          size="md"
        >
          {TTL_OPTIONS.map((opt) => (
            <option key={opt.minutes} value={opt.minutes}>
              {t(opt.key)}
            </option>
          ))}
        </SelectField>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
    </ModalShell>
  );
}
