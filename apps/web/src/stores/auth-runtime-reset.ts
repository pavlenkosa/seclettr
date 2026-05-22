/**
 * auth-runtime-reset — auth-triggered cleanup for chat/group/plain runtime state.
 *
 * Owns:
 *   - clearing encrypted message/group runtime state when a session is locked
 *   - clearing encrypted/plain runtime state plus attachment blob cache when a
 *     session is torn down or revoked
 *
 * Does not own:
 *   - auth lifecycle transitions
 *   - websocket teardown
 *   - secure storage wiping
 */
import { clearPlainAttachmentBlobCache } from "@/chats/runtime/plain-attachment-blob-cache";
import { useGroupsStore } from "@/stores/groups";
import { useMessagesStore } from "@/stores/messages";
import { usePlainGroupsStore, usePlainMessagesStore, usePlainPinsStore } from "@/stores/plain";

export function clearEncryptedRuntimeState(): void {
  useMessagesStore.getState().reset();
  useGroupsStore.getState().reset();
}

export function clearFullRuntimeState(): void {
  clearEncryptedRuntimeState();
  usePlainMessagesStore.getState().reset();
  usePlainGroupsStore.getState().reset();
  usePlainPinsStore.getState().reset();
  clearPlainAttachmentBlobCache();
}
