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

export class DirectCallSetupTimeoutError extends Error {
  readonly stage: string;
  constructor(stage: string) {
    super(`Direct call setup timed out at stage: ${stage}`);
    this.stage = stage;
  }
}

/**
 * Race a setup-stage promise against a deadline.
 * Throws `DirectCallSetupTimeoutError` if the deadline fires first.
 */
export function withSetupStageTimeout<T>(
  promise: Promise<T>,
  ms: number,
  stage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new DirectCallSetupTimeoutError(stage));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err)   => { clearTimeout(timer); reject(err); }
    );
  });
}
