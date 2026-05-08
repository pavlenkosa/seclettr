import { memo } from "react";
import type { GroupActiveCallEntry } from "@seclettr/protocol";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import type { useDirectMissedCallAlerts } from "@/calls/direct/runtime/useDirectMissedCallAlerts";
import type {
  ChatPresence,
  RenderedCallAlerts,
  TranslateFn,
  WorkspaceEntryState,
} from "./chat-page-types";
import styles from "../ChatPage.module.css";

export const ChatCallAlertBanners = memo(function ChatCallAlertBanners({
  presence,
  chatNoticeMounted,
  renderedCallAlerts,
  clearMissedCall,
  groupEntries,
  handleSelectThread,
  dismissMissedDirectCall,
  t,
}: {
  presence: ChatPresence;
  chatNoticeMounted: boolean;
  renderedCallAlerts: RenderedCallAlerts;
  clearMissedCall: WorkspaceEntryState["clearMissedCall"];
  groupEntries: WorkspaceEntryState["groupEntries"];
  handleSelectThread: WorkspaceEntryState["handleSelectThread"];
  dismissMissedDirectCall: ReturnType<typeof useDirectMissedCallAlerts>["dismissMissedDirectCall"];
  t: TranslateFn;
}) {
  if (!presence.isMounted) return null;
  return (
    <div
      className={`${styles.callAlertBanners} ${
        chatNoticeMounted ? styles.callAlertBannersBelowNotice : ""
      } ${presence.isClosing ? motionStyles.fadeOut : motionStyles.fadeIn}`}
    >
      {renderedCallAlerts.missedCall ? (
        <div className={`${styles.callAlertBanner} ${styles.callAlertBannerMissed}`} role="alert">
          <span className={styles.callAlertBannerText}>
            {t("group.call.missed.notice")}
          </span>
          <div className={styles.callAlertBannerActions}>
            <button className={styles.callAlertBannerDismiss} onClick={clearMissedCall}>
              {t("group.call.missed.dismiss")}
            </button>
          </div>
        </div>
      ) : null}
      {renderedCallAlerts.globalGroupCallAlerts.map((alert: GroupActiveCallEntry) => {
        const groupName = groupEntries.find((entry) => entry.groupId === alert.groupId)?.name;
        return (
          <div key={alert.callId} className={styles.callAlertBanner} role="alert">
            <span className={styles.callAlertBannerText}>
              {t("group.call.alert.otherGroup", { group: groupName ?? alert.groupId })}
            </span>
            <div className={styles.callAlertBannerActions}>
              <button
                className={styles.callAlertBannerBtn}
                onClick={() => { handleSelectThread({ kind: "group", id: alert.groupId }); }}
              >
                {t("group.call.alert.go")}
              </button>
            </div>
          </div>
        );
      })}
      {renderedCallAlerts.missedDirectCalls.map((missed) => (
        <div key={missed.callId} className={`${styles.callAlertBanner} ${styles.callAlertBannerMissed}`} role="alert">
          <span className={styles.callAlertBannerText}>
            {t("call.missed.directNotice", { caller: missed.callerUsername })}
          </span>
          <div className={styles.callAlertBannerActions}>
            <button
              className={styles.callAlertBannerDismiss}
              onClick={() => dismissMissedDirectCall(missed.callId)}
            >
              {t("call.missed.dismiss")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});
