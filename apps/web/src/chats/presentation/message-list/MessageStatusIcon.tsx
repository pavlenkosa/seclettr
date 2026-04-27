import type { Message } from "@/stores/messages";
import { MessageDeliveryStatusIcon, type MessageDeliveryStatus } from "@/components/ui";
import styles from "../MessageList.module.css";

/**
 * Shared status icon for outgoing message states.
 */
export function MessageStatusIcon({ status }: { readonly status: Message["status"] }) {
  if (status === "error") return <span className={styles.statusError}>!</span>;

  let className: string | undefined;
  if (status === "sending") {
    className = styles.statusSending;
  } else if (status === "sent") {
    className = styles.statusSent;
  } else if (status === "delivered") {
    className = styles.statusDelivered;
  } else {
    className = styles.statusRead;
  }

  let iconSize: number;
  if (status === "sending") {
    iconSize = 13;
  } else if (status === "sent") {
    iconSize = 14;
  } else {
    iconSize = 16;
  }

  return (
    <span className={className} aria-hidden="true">
      <MessageDeliveryStatusIcon status={status as MessageDeliveryStatus} size={iconSize} />
    </span>
  );
}
