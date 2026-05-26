import type { ReactNode } from "react";
import { useAnimatedPresence } from "@/lib/hooks";
import { MOTION_DURATION_MS } from "@/lib/motion";
import motionStyles from "@/components/ui/motion/Motion.module.css";
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
    durationMs: MOTION_DURATION_MS.base,
  });
  const threadPresence = useAnimatedPresence({
    isOpen: isConversationVisible && !isSettingsVisible,
    durationMs: MOTION_DURATION_MS.base,
  });
  const settingsPresence = useAnimatedPresence({
    isOpen: isSettingsVisible,
    durationMs: MOTION_DURATION_MS.base,
  });

  return (
    <div className={styles.shell}>
      {sidebarPresence.isMounted ? (
        <div
          className={[
            styles.sidebarView,
            sidebarPresence.isClosing ? motionStyles.panelOut : motionStyles.panelIn,
          ].filter(Boolean).join(" ")}
          aria-hidden={sidebarPresence.isClosing ? true : undefined}
        >
          {sidebar}
        </div>
      ) : null}

      {threadPresence.isMounted ? (
        <div
          className={[
            styles.threadView,
            threadPresence.isClosing ? motionStyles.panelOut : motionStyles.panelIn,
          ].filter(Boolean).join(" ")}
          aria-hidden={threadPresence.isClosing ? true : undefined}
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
            settingsPresence.isClosing ? motionStyles.panelOut : motionStyles.panelIn,
          ].filter(Boolean).join(" ")}
          aria-hidden={settingsPresence.isClosing ? true : undefined}
        >
          {settings}
        </div>
      ) : null}

      {sidebarPresence.isMounted ? (
        <div
          className={sidebarPresence.isClosing ? motionStyles.fadeOut : motionStyles.fadeIn}
          aria-hidden={sidebarPresence.isClosing ? true : undefined}
        >
          {sidebarDock}
        </div>
      ) : null}

    </div>
  );
}
