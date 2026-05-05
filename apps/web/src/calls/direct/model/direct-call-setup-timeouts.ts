export { CallSetupTimeoutError as DirectCallSetupTimeoutError, withSetupStageTimeout } from "@/calls/shared/model/call-setup-timeout";

export const DIRECT_CALL_SETUP_TIMEOUTS = {
  /** API call to create the server-side call record. */
  apiCreateCallMs: 10_000,
  /** getUserMedia permission prompt + device acquisition. */
  localMediaMs: 20_000,
  /** Waiting for the remote peer to send an answer after the offer is dispatched.
   *  The ringing timeout (60 s) is the outer bound; this is a tighter guard for
   *  the connecting phase after the callee has picked up but before answer arrives. */
  answerReceiveMs: 45_000,
  /** ICE negotiation to reach "connected" after both descriptions are set. */
  iceConnectedMs: 30_000,
} as const;
