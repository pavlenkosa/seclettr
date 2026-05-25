/**
 * frame-crypto-capabilities — browser capability detection for encoded-frame transforms.
 *
 * Owns:
 *   - supportsEncodedFrameTransforms — returns true if the browser supports either
 *     the legacy createEncodedStreams API or the modern RTCRtpScriptTransform API,
 *     both of which require WebCrypto, RTCRtpSender/Receiver, and a Window context
 *   - supportsLegacyEncodedFrameTransforms — checks createEncodedStreams on prototypes
 *   - supportsScriptEncodedFrameTransforms — checks RTCRtpScriptTransform constructor
 *     and transform property presence on sender/receiver prototypes
 *
 * Does not own the actual transform binding (see frame-crypto.ts).
 */
interface EncodedStreamsPrototype {
  createEncodedStreams?: () => unknown;
}

type ScriptTransformConstructor = new (worker: Worker, options?: unknown) => unknown;

interface ScriptTransformWindow extends Window {
  RTCRtpScriptTransform?: ScriptTransformConstructor;
}

function hasWebCrypto(): boolean {
  return globalThis.crypto?.subtle !== undefined;
}

function supportsLegacyEncodedFrameTransforms(): boolean {
  if (globalThis.window === undefined) return false;
  if (!hasWebCrypto()) return false;
  if (typeof RTCRtpSender === "undefined" || typeof RTCRtpReceiver === "undefined") return false;
  const senderPrototype = RTCRtpSender.prototype as EncodedStreamsPrototype;
  const receiverPrototype = RTCRtpReceiver.prototype as EncodedStreamsPrototype;
  return (
    typeof senderPrototype.createEncodedStreams === "function" &&
    typeof receiverPrototype.createEncodedStreams === "function"
  );
}

function supportsScriptEncodedFrameTransforms(): boolean {
  if (globalThis.window === undefined) return false;
  if (!hasWebCrypto()) return false;
  if (typeof Worker === "undefined") return false;
  if (typeof RTCRtpSender === "undefined" || typeof RTCRtpReceiver === "undefined") return false;

  const senderPrototype = RTCRtpSender.prototype as { transform?: unknown };
  const receiverPrototype = RTCRtpReceiver.prototype as { transform?: unknown };
  const transformConstructor = (globalThis as unknown as ScriptTransformWindow).RTCRtpScriptTransform;

  return (
    typeof transformConstructor === "function" &&
    "transform" in senderPrototype &&
    "transform" in receiverPrototype
  );
}

export function supportsEncodedFrameTransforms(): boolean {
  return supportsLegacyEncodedFrameTransforms() || supportsScriptEncodedFrameTransforms();
}
