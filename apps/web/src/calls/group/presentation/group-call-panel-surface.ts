export type GroupCallPanelSurface = "panel" | "dock";

export function resolveGroupCallPanelSurface(isMinimized: boolean): GroupCallPanelSurface {
  return isMinimized ? "dock" : "panel";
}

export function formatGroupCallRoomCode(callId: string): string {
  if (callId.length <= 16) {
    return callId;
  }

  return `${callId.slice(0, 8)}-${callId.slice(-6)}`;
}
