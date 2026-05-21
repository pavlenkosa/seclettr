import {
  MESSAGE_PROTOCOL_VERSION,
  type SendGroupMessageRequestWire,
  type SendGroupMessageResponse,
} from "@seclettr/protocol";
import { api } from "@/lib/api";
import type { GroupCipherEnvelope } from "@/lib/group-sender-key";

/**
 * Owns pure helper logic for encrypted group outbound send/retry flows.
 * No state mutation or sender-key lifecycle lives here.
 */

export const MAX_GROUP_OUTBOUND_RETRIES = 5;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toSafeBlobChunk(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

export function isUploadAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function parseServerMessageTimestamp(
  createdAt: string,
  fallbackTimestamp: number
): number {
  const timestamp = new Date(createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : fallbackTimestamp;
}

function hasApiErrorStatus(error: unknown, status: number): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidateStatus = (error as { status?: unknown }).status;
  return typeof candidateStatus === "number" && candidateStatus === status;
}

function isSenderKeyConflictError(error: unknown): boolean {
  if (!hasApiErrorStatus(error, 409)) {
    return false;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string"
    && message.includes("group sender-key message id already used");
}

export function createLocalMessageIdentifiers(): {
  optimisticId: string;
  clientMessageId: string;
} {
  const clientMessageId = crypto.randomUUID();
  return {
    optimisticId: `local-${clientMessageId}`,
    clientMessageId,
  };
}

export function clientMessageIdForOptimisticId(optimisticId: string): string {
  const candidate = optimisticId.startsWith("local-")
    ? optimisticId.slice("local-".length)
    : optimisticId;
  return UUID_PATTERN.test(candidate) ? candidate : crypto.randomUUID();
}

export function buildGroupMessagePayload(
  encryptedEnvelope: GroupCipherEnvelope,
  clientMessageId: string,
  type: "text" | "attachment",
  cryptoEpoch: number,
  attachmentId?: string
): SendGroupMessageRequestWire {
  const payload: SendGroupMessageRequestWire = {
    version: MESSAGE_PROTOCOL_VERSION,
    clientMessageId,
    groupId: encryptedEnvelope.groupId,
    distributionId: encryptedEnvelope.distributionId,
    cryptoEpoch,
    chainId: encryptedEnvelope.chainId,
    messageId: encryptedEnvelope.messageId,
    ciphertext: encryptedEnvelope.ciphertext,
    signature: encryptedEnvelope.signature,
    type,
    aeadVersion: encryptedEnvelope.aeadVersion,
  };

  return attachmentId ? { ...payload, attachmentId } : payload;
}

export async function postGroupMessagePayloadWithRetry(
  groupId: string,
  payload: SendGroupMessageRequestWire
): Promise<SendGroupMessageResponse> {
  const postPayload = () =>
    api.post<SendGroupMessageResponse>(
      `/groups/${encodeURIComponent(groupId)}/messages`,
      payload
    );

  try {
    return await postPayload();
  } catch (error) {
    if (!isSenderKeyConflictError(error)) {
      throw error;
    }
    return postPayload();
  }
}
