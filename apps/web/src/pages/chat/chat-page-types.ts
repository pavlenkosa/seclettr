import type { useI18n } from "@/i18n";
import type {
  useChatSecurityWorkspace,
  useChatThreadPaneState,
  useChatWorkspaceEntry,
  useChatWorkspaceInteractions,
  useChatWorkspaceUiState,
} from "@/chats";
import type { useDirectMissedCallAlerts } from "@/calls/direct/runtime/session/useDirectMissedCallAlerts";

export type TranslateFn = ReturnType<typeof useI18n>["t"];
export type WorkspaceEntryState = ReturnType<typeof useChatWorkspaceEntry>;
export type WorkspaceUiState = ReturnType<typeof useChatWorkspaceUiState>;
export type WorkspaceInteractions = ReturnType<typeof useChatWorkspaceInteractions>;
export type SecurityWorkspaceState = ReturnType<typeof useChatSecurityWorkspace>;
export type ThreadPaneState = ReturnType<typeof useChatThreadPaneState>;
export type ChatPresence = { isMounted: boolean; isClosing: boolean };
export type RenderedCallAlerts = {
  missedCall: WorkspaceEntryState["missedCall"];
  globalGroupCallAlerts: WorkspaceEntryState["globalGroupCallAlerts"];
  missedDirectCalls: ReturnType<typeof useDirectMissedCallAlerts>["missedDirectCalls"];
};
