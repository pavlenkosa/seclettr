export const GROUP_CALL_SETUP_TIMEOUTS = {
  /** Initial fetch to check for an existing active call. */
  checkActiveCallMs: 8_000,
  /** API call to create or join the server-side call record. */
  apiCallMs: 10_000,
  /** getUserMedia permission prompt + audio device acquisition. */
  localMediaMs: 20_000,
  /** SFU transport connect for a single attempt. */
  sfuConnectMs: 15_000,
} as const;

export class GroupCallSetupTimeoutError extends Error {
  readonly stage: string;
  constructor(stage: string) {
    super(`Group call setup timed out at stage: ${stage}`);
    this.stage = stage;
  }
}
