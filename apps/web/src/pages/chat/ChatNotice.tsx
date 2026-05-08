import { memo } from "react";
import motionStyles from "@/components/ui/motion/Motion.module.css";
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
      className={`${styles.chatNotice} ${presence.isClosing ? motionStyles.fadeOut : motionStyles.fadeIn}`}
      role="alert"
      aria-live="assertive"
    >
      {noticeText}
    </div>
  );
});
