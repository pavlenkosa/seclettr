import { useCallback } from "react";
import { api } from "@/lib/api";
import { useDirectCallFrameCryptoRuntime } from "../useDirectCallFrameCryptoRuntime";
import { useDirectCallIceBatch } from "../useDirectCallIceBatch";
import { useDirectCallRemoteReceiverIngest } from "../media";

/**
 * useDirectCallControllerTransportWiring — direct-call transport composition bundle.
 *
 * Owns:
 *   - ICE batch buffering/flush/reset wiring
 *   - frame-crypto runtime wiring
 *   - TURN credentials getter for peer-connection bootstrap
 *   - remote receiver ingress wiring
 *
 * Does not own peer-connection factory wiring, negotiation order, session
 * teardown, or media control behavior.
 */
type UseDirectCallControllerTransportWiringOptions = {
  outgoingIceBatchRef: Parameters<typeof useDirectCallIceBatch>[0];
  frameCrypto: Parameters<typeof useDirectCallFrameCryptoRuntime>[0];
  remoteReceiverIngress: Omit<
    Parameters<typeof useDirectCallRemoteReceiverIngest>[0],
    "ensureDirectCallReceiverFrameCryptoBound"
  >;
};

export function useDirectCallControllerTransportWiring({
  outgoingIceBatchRef,
  frameCrypto,
  remoteReceiverIngress,
}: UseDirectCallControllerTransportWiringOptions) {
  const {
    flushOutgoingIceBatch,
    resetOutgoingIceBatch,
    enqueueOutgoingIceCandidate,
  } = useDirectCallIceBatch(outgoingIceBatchRef);

  const {
    closeDirectCallFrameCrypto,
    resolveLocalSupportedMediaEncryptionModes,
    ensureDirectCallSenderFrameCryptoBound,
    primeDirectCallSenderFrameCrypto,
    ensureDirectCallReceiverFrameCryptoBound,
    configureDirectCallFrameCrypto,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
  } = useDirectCallFrameCryptoRuntime(frameCrypto);

  const getTurnCredentials = useCallback(async () => {
    return api.get<{
      username: string;
      password: string;
      uris: string[];
    }>("/calls/turn-credentials");
  }, []);

  const {
    ingestRemoteReceiverTrack,
    refreshRemoteVideoTracksFromPeer,
  } = useDirectCallRemoteReceiverIngest({
    ...remoteReceiverIngress,
    ensureDirectCallReceiverFrameCryptoBound,
  });

  return {
    getTurnCredentials,
    flushOutgoingIceBatch,
    resetOutgoingIceBatch,
    enqueueOutgoingIceCandidate,
    closeDirectCallFrameCrypto,
    resolveLocalSupportedMediaEncryptionModes,
    ensureDirectCallSenderFrameCryptoBound,
    primeDirectCallSenderFrameCrypto,
    ensureDirectCallReceiverFrameCryptoBound,
    configureDirectCallFrameCrypto,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
    ingestRemoteReceiverTrack,
    refreshRemoteVideoTracksFromPeer,
  };
}
