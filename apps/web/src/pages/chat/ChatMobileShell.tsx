import type { ReactNode } from "react";
import { useAnimatedPresence } from "@/lib/hooks";
import styles from "./ChatMobileShell.module.css";

/**
 * Mobile-only chat shell that keeps app navigation and thread surfaces mutually exclusive.
 * This avoids overlay conflicts between the bottom dock and the message composer.
 */
export interface ChatMobileShellProps {
  readonly isConversationVisible: boolean;
  readonly isSettingsVisible: boolean;
  readonly sidebar: ReactNode;
  readonly thread: ReactNode;
  readonly sidebarDock: ReactNode;
  readonly settings: ReactNode;
}

export function ChatMobileShell({
  isConversationVisible,
  isSettingsVisible,
  sidebar,
  thread,
  sidebarDock,
  settings,
}: ChatMobileShellProps) {
  const sidebarPresence = useAnimatedPresence({
    isOpen: !isConversationVisible && !isSettingsVisible,
    durationMs: 220,
  });
  const threadPresence = useAnimatedPresence({
    isOpen: isConversationVisible && !isSettingsVisible,
    durationMs: 220,
  });
  const settingsPresence = useAnimatedPresence({
    isOpen: isSettingsVisible,
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

      {settingsPresence.isMounted ? (
        <div
          className={[
            styles.settingsView,
            settingsPresence.isClosing ? styles.surfaceClosing : "",
          ].filter(Boolean).join(" ")}
        >
          {settings}
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
