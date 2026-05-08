import { memo, type ReactNode } from "react";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import { useAnimatedPresence } from "@/lib/hooks";
import { ChatMobileShell } from "./ChatMobileShell";
import type { useSidebarResize } from "./useSidebarResize";
import styles from "../ChatPage.module.css";

export const ChatMainLayout = memo(function ChatMainLayout({
  isMobileViewport,
  mobileShowConversation,
  showSettings,
  sidebar,
  threadPane,
  sidebarDock,
  settingsScreen,
  startResize,
  resetWidth,
}: {
  isMobileViewport: boolean;
  mobileShowConversation: boolean;
  showSettings: boolean;
  sidebar: ReactNode;
  threadPane: ReactNode;
  sidebarDock: ReactNode;
  settingsScreen: ReactNode;
  startResize: ReturnType<typeof useSidebarResize>["startResize"];
  resetWidth: ReturnType<typeof useSidebarResize>["resetWidth"];
}) {
  const settingsPresence = useAnimatedPresence({
    isOpen: showSettings,
    durationMs: 180,
  });

  if (isMobileViewport) {
    return (
      <ChatMobileShell
        isConversationVisible={mobileShowConversation}
        isSettingsVisible={showSettings}
        sidebar={sidebar}
        thread={threadPane}
        sidebarDock={sidebarDock}
        settings={settingsScreen}
      />
    );
  }

  return (
    <>
      {sidebar}
      <div
        className={styles.resizer}
        onPointerDown={startResize}
        onDoubleClick={resetWidth}
        aria-hidden="true"
        title="Drag to resize · Double-click to reset"
      />
      <main className={styles.main}>
        {threadPane}
      </main>
      {settingsPresence.isMounted ? (
        <div className={`${styles.settingsOverlay} ${settingsPresence.isClosing ? motionStyles.panelOut : motionStyles.panelIn}`}>
          {settingsScreen}
        </div>
      ) : null}
    </>
  );
});
