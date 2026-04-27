export function canReceiveRemoteMediaOnTransceiver(
  transceiver: Pick<RTCRtpTransceiver, "currentDirection" | "direction"> | null | undefined
): boolean {
  if (!transceiver) {
    return false;
  }

  const effectiveDirection = transceiver.currentDirection ?? transceiver.direction;
  return effectiveDirection === "recvonly" || effectiveDirection === "sendrecv";
}
