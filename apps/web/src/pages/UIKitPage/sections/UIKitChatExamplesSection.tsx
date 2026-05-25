import {
  LabelPill,
  MessageDeliveryStatusIcon,
  SurfacePanel,
} from "@/components/ui";
import { SectionHeader } from "../helpers/uikitDemoBlocks";
import { PaperclipIcon } from "../helpers/uikitDemoIcons";
import styles from "../../UIKitPage.module.css";

export function UIKitChatExamplesSection() {
  return (
    <SurfacePanel as="section" tone="default" padding="lg" radius="xl" className={styles.sectionPanel}>
      <SectionHeader
        eyebrow="Chat examples"
        title="Message bubbles, attachment row, and outgoing status"
        meta={<LabelPill size="sm">Demo-only composition</LabelPill>}
      />

      <div className={styles.chatExample}>
        <div className={`${styles.messageBubble} ${styles.messageBubbleIncoming}`}>
          <p className={styles.messageText}>Updated the UI audit and queued the next migration slice.</p>
          <div className={styles.messageMeta}>
            <span>09:41</span>
          </div>
        </div>

        <div className={`${styles.messageBubble} ${styles.messageBubbleOutgoing}`}>
          <p className={styles.messageText}>UIKit now demonstrates shared controls instead of local copies.</p>
          <div className={styles.attachmentCard}>
            <div className={styles.attachmentIcon}>
              <PaperclipIcon />
            </div>
            <div className={styles.attachmentCopy}>
              <strong>ui-kit-audit.pdf</strong>
              <span>248 KB · attachment row</span>
            </div>
          </div>
          <div className={styles.messageMeta}>
            <span>09:43</span>
            <MessageDeliveryStatusIcon status="read" size={14} />
          </div>
        </div>
      </div>
    </SurfacePanel>
  );
}
