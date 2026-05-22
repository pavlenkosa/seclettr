/**
 * app-client-runtime-bootstrap — app-level client bridge bootstrap for push/native hooks.
 *
 * Owns:
 *   - attaching the service-worker push action bridge used by plain chat mark-read actions
 *   - initializing native notifications permission/bootstrap hooks
 *   - initializing the native back-button bridge
 *
 * Does not own:
 *   - auth/session restore
 *   - websocket listener attachment
 *   - plain/encrypted store business logic
 */
import { initNativeBackHandler } from "./native-back-handler";
import { initNativeNotifications } from "./native-notifications";
import { initPushActionHandler } from "./push-action-handler";

export function initAppClientRuntime(): void {
  initPushActionHandler();
  void initNativeNotifications();
  initNativeBackHandler();
}
