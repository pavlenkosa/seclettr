import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import motionStyles from "@/components/ui/motion/Motion.module.css";
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

  return createPortal(
    <div
      className={`${styles.overlay} ${motionStyles.fadeIn}`}
      onClick={onClose}
      role="presentation"
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <dialog
        open
        aria-modal="true"
        aria-label={t("room.create.title")}
        className={`${styles.surface} ${motionStyles.surfaceIn}`}
        onCancel={(e) => { e.preventDefault(); onClose(); }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.headerTitle}>{t("room.create.title")}</span>
          <button
            type="button"
            className={styles.headerClose}
            onClick={onClose}
            aria-label={t("room.create.closeAria")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>{t("room.create.callTypeLabel")}</label>
            <div className={styles.segments}>
              {(["audio", "video"] as CallType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCallType(type)}
                  className={[
                    styles.segmentButton,
                    callType === type ? styles.segmentButtonActive : "",
                  ].filter(Boolean).join(" ")}
                >
                  {type === "audio" ? t("room.create.callType.audio") : t("room.create.callType.video")}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t("room.create.expiresLabel")}</label>
            <select
              value={expiresInMinutes}
              onChange={(e) => setExpiresInMinutes(Number(e.target.value))}
              className={styles.select}
            >
              {TTL_OPTIONS.map((opt) => (
                <option key={opt.minutes} value={opt.minutes}>
                  {t(opt.key)}
                </option>
              ))}
            </select>
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            onClick={onClose}
            className={`${styles.button} ${styles.secondaryButton}`}
            disabled={isCreating}
          >
            {t("room.create.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            className={`${styles.button} ${styles.primaryButton}`}
            disabled={isCreating}
          >
            {isCreating ? t("room.create.submitting") : t("room.create.submit")}
          </button>
        </div>
      </dialog>
    </div>,
    document.body
  );
}
