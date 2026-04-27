import type { GroupActiveCall } from "@seclettr/protocol";
import type { CallType } from "./group-call-types";

export type { GroupCallPanelSession } from "./group-call-types";

export function resolveGroupCallLaunchType(
  requestedType: CallType,
  activeCall: Pick<GroupActiveCall, "callType"> | null
): CallType {
  return activeCall?.callType ?? requestedType;
}

export function resolveGroupCallNoticeSurface(options: {
  activeCall: Pick<GroupActiveCall, "callId"> | null;
  hasOpenSession: boolean;
}): "hidden" | "banner" {
  if (!options.activeCall || options.hasOpenSession) {
    return "hidden";
  }

  return "banner";
}
