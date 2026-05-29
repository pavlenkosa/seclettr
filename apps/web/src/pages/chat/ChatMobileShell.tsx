import type { ReactNode } from "react";
import { useAnimatedPresence } from "@/lib/hooks";
import { MOTION_DURATION_MS } from "@/lib/motion";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import styles from "./ChatMobileShell.module.css";

function PresencePanel({
  presence, className, children,
}: {
  presence: { isMounted: boolean; isClosing: boolean };
  className?: string;
  children: ReactNode;
}) {
  if (!presence.isMounted) return null;
  const motionClass = presence.isClosing ? motionStyles.panelOut : motionStyles.panelIn;
  return (
    <div className={`${className} ${motionClass}`} aria-hidden={presence.isClosing ? true : undefined}>
      {children}
    </div>
  );
}

function PresenceDock({
  presence, children,
}: {
  presence: { isMounted: boolean; isClosing: boolean };
  children: ReactNode;
}) {
  if (!presence.isMounted) return null;
  const motionClass = presence.isClosing ? motionStyles.fadeOut : motionStyles.fadeIn;
  return (
    <div className={motionClass} aria-hidden={presence.isClosing ? true : undefined}>
      {children}
    </div>
  );
}

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
      <PresencePanel presence={sidebarPresence} className={styles.sidebarView}>
        {sidebar}
      </PresencePanel>
      <PresencePanel presence={threadPresence} className={styles.threadView}>
        <div className={styles.threadBody}>{thread}</div>
      </PresencePanel>
      <PresencePanel presence={settingsPresence} className={styles.settingsView}>
        {settings}
      </PresencePanel>
      <PresenceDock presence={sidebarPresence}>
        {sidebarDock}
      </PresenceDock>
    </div>
  );
}
