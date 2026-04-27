function isVideoTransceiver(transceiver: RTCRtpTransceiver): boolean {
  return (
    transceiver.receiver.track.kind === "video" ||
    transceiver.sender.track?.kind === "video"
  );
}

function compareTransceiverMid(left: RTCRtpTransceiver, right: RTCRtpTransceiver): number {
  const leftMid = left.mid;
  const rightMid = right.mid;
  if (leftMid === rightMid) return 0;
  if (leftMid === null) return 1;
  if (rightMid === null) return -1;
  const leftMidNumeric = Number(leftMid);
  const rightMidNumeric = Number(rightMid);
  if (Number.isFinite(leftMidNumeric) && Number.isFinite(rightMidNumeric)) {
    return leftMidNumeric - rightMidNumeric;
  }
  return leftMid.localeCompare(rightMid);
}

function pickVideoTransceiver(
  transceivers: readonly RTCRtpTransceiver[],
  excluded: RTCRtpTransceiver | null
): RTCRtpTransceiver | null {
  for (const transceiver of transceivers) {
    if (transceiver !== excluded) {
      return transceiver;
    }
  }
  return null;
}

interface EnsureDedicatedVideoTransceiversParams {
  pc: RTCPeerConnection;
  currentCameraTransceiver: RTCRtpTransceiver | null;
  currentScreenTransceiver: RTCRtpTransceiver | null;
}

interface DedicatedVideoTransceivers {
  cameraTransceiver: RTCRtpTransceiver;
  screenTransceiver: RTCRtpTransceiver;
}

interface ReconciledDedicatedVideoTransceivers {
  cameraTransceiver: RTCRtpTransceiver | null;
  screenTransceiver: RTCRtpTransceiver | null;
}

export function reconcileDedicatedVideoTransceivers({
  pc,
  currentCameraTransceiver,
  currentScreenTransceiver,
}: EnsureDedicatedVideoTransceiversParams): ReconciledDedicatedVideoTransceivers {
  const videoTransceivers = pc
    .getTransceivers()
    .filter(isVideoTransceiver)
    .sort(compareTransceiverMid);

  const hasVideoTransceiver = (candidate: RTCRtpTransceiver | null): candidate is RTCRtpTransceiver => (
    candidate !== null && videoTransceivers.includes(candidate)
  );

  const cameraTransceiver = hasVideoTransceiver(currentCameraTransceiver)
    ? currentCameraTransceiver
    : (videoTransceivers[0] ?? null);

  const screenTransceiver = hasVideoTransceiver(currentScreenTransceiver) &&
    currentScreenTransceiver !== cameraTransceiver
    ? currentScreenTransceiver
    : (
      videoTransceivers.find((candidate) => candidate !== cameraTransceiver) ??
      null
    );

  return {
    cameraTransceiver,
    screenTransceiver,
  };
}

export function ensureDedicatedVideoTransceivers({
  pc,
  currentCameraTransceiver,
  currentScreenTransceiver,
}: EnsureDedicatedVideoTransceiversParams): DedicatedVideoTransceivers {
  const videoTransceivers = pc
    .getTransceivers()
    .filter(isVideoTransceiver)
    .sort(compareTransceiverMid);

  let { cameraTransceiver, screenTransceiver } = reconcileDedicatedVideoTransceivers({
    pc,
    currentCameraTransceiver,
    currentScreenTransceiver,
  });

  if (!cameraTransceiver) {
    cameraTransceiver = pickVideoTransceiver(videoTransceivers, screenTransceiver);
    if (!cameraTransceiver) {
      cameraTransceiver = pc.addTransceiver("video", { direction: "recvonly" });
      videoTransceivers.push(cameraTransceiver);
    }
  }

  if (!screenTransceiver) {
    screenTransceiver = pickVideoTransceiver(videoTransceivers, cameraTransceiver);
    if (!screenTransceiver) {
      screenTransceiver = pc.addTransceiver("video", { direction: "recvonly" });
      videoTransceivers.push(screenTransceiver);
    }
  }

  return {
    cameraTransceiver,
    screenTransceiver,
  };
}
