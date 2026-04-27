import { memo, type ReactNode } from "react";
import { ChatMobileShell } from "./ChatMobileShell";
import type { useSidebarResize } from "./useSidebarResize";
import styles from "../ChatPage.module.css";

export const ChatMainLayout = memo(function ChatMainLayout({
  isMobileViewport,
  mobileShowConversation,
  sidebar,
  threadPane,
  sidebarDock,
  startResize,
  resetWidth,
}: {
  isMobileViewport: boolean;
  mobileShowConversation: boolean;
  sidebar: ReactNode;
  threadPane: ReactNode;
  sidebarDock: ReactNode;
  startResize: ReturnType<typeof useSidebarResize>["startResize"];
  resetWidth: ReturnType<typeof useSidebarResize>["resetWidth"];
}) {
  return isMobileViewport ? (
    <ChatMobileShell
      isConversationVisible={mobileShowConversation}
      sidebar={sidebar}
      thread={threadPane}
      sidebarDock={sidebarDock}
    />
  ) : (
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
    </>
  );
});
