import { memo } from "react";
import type { ChatPresence } from "./chat-page-types";
import styles from "../ChatPage.module.css";

export const ChatNotice = memo(function ChatNotice({
  presence,
  noticeText,
}: {
  presence: ChatPresence;
  noticeText: string | null;
}) {
  if (!presence.isMounted) return null;
  return (
    <div
      className={`${styles.chatNotice} ${presence.isClosing ? styles.chatNoticeClosing : ""}`}
      role="alert"
      aria-live="assertive"
    >
      {noticeText}
    </div>
  );
});
