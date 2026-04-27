import { ApiError, api } from "./api";

const ACK_RETRY_DELAYS_MS = [250, 750, 1500] as const;
const NON_RETRYABLE_ACK_STATUSES = new Set([400, 401, 403, 404]);

type PostFn = (path: string, body?: unknown) => Promise<unknown>;
type SleepFn = (ms: number) => Promise<void>;
type Logger = Pick<typeof console, "warn" | "debug">;
type AckFailureKind =
  | "already_acked"
  | "terminal_error"
  | "retryable";

export type MessageAckResult =
  | "acked"
  | "already_acked"
  | "terminal_error"
  | "failed";

interface AckMetrics {
  attempts: number;
  retries: number;
  acked: number;
  alreadyAcked: number;
  terminalError: number;
  failed: number;
}

const ackMetrics: AckMetrics = {
  attempts: 0,
  retries: 0,
  acked: 0,
  alreadyAcked: 0,
  terminalError: 0,
  failed: 0,
};

function classifyAckFailure(error: unknown): AckFailureKind {
  if (!(error instanceof ApiError)) {
    return "retryable";
  }

  if (error.status === 409) {
    return "already_acked";
  }

  return NON_RETRYABLE_ACK_STATUSES.has(error.status)
    ? "terminal_error"
    : "retryable";
}

function handleTerminalAckFailure(
  messageId: string,
  error: ApiError,
  logger: Logger
): MessageAckResult {
  ackMetrics.terminalError += 1;
  logger.warn("[ACK] terminal failure", messageId, "status=", error.status);
  return "terminal_error";
}

function handleAckFailure(
  messageId: string,
  error: unknown,
  logger: Logger
): MessageAckResult | null {
  const kind = classifyAckFailure(error);

  if (kind === "already_acked") {
    ackMetrics.alreadyAcked += 1;
    return "already_acked";
  }

  if (kind === "terminal_error" && error instanceof ApiError) {
    return handleTerminalAckFailure(messageId, error, logger);
  }

  return null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getAckMetrics(): AckMetrics {
  return { ...ackMetrics };
}

function resetAckMetrics(): void {
  ackMetrics.attempts = 0;
  ackMetrics.retries = 0;
  ackMetrics.acked = 0;
  ackMetrics.alreadyAcked = 0;
  ackMetrics.terminalError = 0;
  ackMetrics.failed = 0;
}

export const __messageAckTestUtils = {
  getAckMetrics,
  resetAckMetrics,
} as const;

export async function postMessageAck(
  messageId: string,
  options?: {
    post?: PostFn;
    sleep?: SleepFn;
    logger?: Logger;
  }
): Promise<MessageAckResult> {
  const post = options?.post ?? api.post;
  const sleep = options?.sleep ?? wait;
  const logger = options?.logger ?? console;

  const maxAttempts = ACK_RETRY_DELAYS_MS.length + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    ackMetrics.attempts += 1;
    try {
      await post(`/messages/${encodeURIComponent(messageId)}/ack`);
      ackMetrics.acked += 1;
      return "acked";
    } catch (error) {
      const terminalResult = handleAckFailure(messageId, error, logger);
      if (terminalResult) {
        return terminalResult;
      }

      if (attempt >= maxAttempts) {
        ackMetrics.failed += 1;
        logger.warn("[ACK] retries exhausted", messageId, error);
        return "failed";
      }

      ackMetrics.retries += 1;
      const delayMs = ACK_RETRY_DELAYS_MS[attempt - 1]!;
      logger.debug("[ACK] retry scheduled", messageId, "attempt=", attempt + 1, "delayMs=", delayMs);
      await sleep(delayMs);
    }
  }

  ackMetrics.failed += 1;
  return "failed";
}
