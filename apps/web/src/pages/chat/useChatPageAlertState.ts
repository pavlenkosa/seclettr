/**
 * useChatPageAlertState — owns animated notice/call-alert render state for ChatPage.
 *
 * Owns:
 *   - Chat notice presence animation state
 *   - Call alert banner presence animation state
 *   - Snapshot retention while animated banners are closing
 *
 * Does not own the underlying missed-call/group-alert domain state.
 */
import { useRef } from "react";
import { useAnimatedPresence } from "@/lib/hooks";
import type { RenderedCallAlerts, WorkspaceEntryState, WorkspaceUiState } from "./chat-page-types";

interface UseChatPageAlertStateParams {
  workspaceUiState: WorkspaceUiState;
  missedCall: WorkspaceEntryState["missedCall"];
  globalGroupCallAlerts: WorkspaceEntryState["globalGroupCallAlerts"];
  missedDirectCalls: RenderedCallAlerts["missedDirectCalls"];
}

export function useChatPageAlertState(params: UseChatPageAlertStateParams) {
  const {
    workspaceUiState,
    missedCall,
    globalGroupCallAlerts,
    missedDirectCalls,
  } = params;

  const chatNoticePresence = useAnimatedPresence({
    isOpen: Boolean(workspaceUiState.chatNotice),
    durationMs: 200,
  });
  const callAlertsVisible = Boolean(
    missedCall || globalGroupCallAlerts.length > 0 || missedDirectCalls.length > 0
  );
  const callAlertBannersPresence = useAnimatedPresence({
    isOpen: callAlertsVisible,
    durationMs: 200,
  });

  const lastChatNoticeRef = useRef<string | null>(null);
  if (workspaceUiState.chatNotice) {
    lastChatNoticeRef.current = workspaceUiState.chatNotice;
  }

  const callAlertSnapshotRef = useRef<RenderedCallAlerts>({
    missedCall,
    globalGroupCallAlerts,
    missedDirectCalls,
  });
  if (callAlertsVisible) {
    callAlertSnapshotRef.current = {
      missedCall,
      globalGroupCallAlerts,
      missedDirectCalls,
    };
  }

  return {
    chatNoticePresence,
    callAlertBannersPresence,
    callAlertsVisible,
    renderedNoticeText: workspaceUiState.chatNotice ?? lastChatNoticeRef.current,
    renderedCallAlerts: callAlertsVisible
      ? { missedCall, globalGroupCallAlerts, missedDirectCalls }
      : callAlertSnapshotRef.current,
  };
}
