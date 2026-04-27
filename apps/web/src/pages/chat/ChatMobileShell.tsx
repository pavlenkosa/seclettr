import type { ReactNode } from "react";
import { useAnimatedPresence } from "@/lib/hooks";
import styles from "./ChatMobileShell.module.css";

/**
 * Mobile-only chat shell that keeps app navigation and thread surfaces mutually exclusive.
 * This avoids overlay conflicts between the bottom dock and the message composer.
 */
export interface ChatMobileShellProps {
  readonly isConversationVisible: boolean;
  readonly sidebar: ReactNode;
  readonly thread: ReactNode;
  readonly sidebarDock: ReactNode;
}

export function ChatMobileShell({
  isConversationVisible,
  sidebar,
  thread,
  sidebarDock,
}: ChatMobileShellProps) {
  const sidebarPresence = useAnimatedPresence({
    isOpen: !isConversationVisible,
    durationMs: 220,
  });
  const threadPresence = useAnimatedPresence({
    isOpen: isConversationVisible,
    durationMs: 220,
  });

  return (
    <div className={styles.shell}>
      {sidebarPresence.isMounted ? (
        <div
          className={[
            styles.sidebarView,
            sidebarPresence.isClosing ? styles.surfaceClosing : "",
          ].filter(Boolean).join(" ")}
        >
          {sidebar}
        </div>
      ) : null}

      {threadPresence.isMounted ? (
        <div
          className={[
            styles.threadView,
            threadPresence.isClosing ? styles.surfaceClosing : "",
          ].filter(Boolean).join(" ")}
        >
          <div className={styles.threadBody}>
            {thread}
          </div>
        </div>
      ) : null}

      {sidebarPresence.isMounted ? (
        <div className={sidebarPresence.isClosing ? styles.surfaceClosing : ""}>
          {sidebarDock}
        </div>
      ) : null}

    </div>
  );
}
