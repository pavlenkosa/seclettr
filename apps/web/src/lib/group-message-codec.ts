import { fromBase64Url, toBase64Url } from "@seclettr/crypto";

export const GROUP_MESSAGE_UNREADABLE = "[encrypted message]";
export const GROUP_EMPTY_SIGNATURE_B64 = toBase64Url(new Uint8Array(64));

export interface GroupTextContent {
  text: string;
  replyToId?: string;
  replySnippet?: string;
}

interface GroupTextPayloadV1 {
  v: 1;
  type: "text";
  text: string;
  replyToId?: string;
  replySnippet?: string;
}

function isGroupTextPayload(value: unknown): value is GroupTextPayloadV1 {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Partial<GroupTextPayloadV1>;
  return payload.v === 1 && payload.type === "text" && typeof payload.text === "string";
}

export function encodeGroupTextCiphertext(text: string): string {
  const payload: GroupTextPayloadV1 = { v: 1, type: "text", text };
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeGroupTextCiphertext(ciphertext: string): GroupTextContent | null {
  try {
    const raw = fromBase64Url(ciphertext);
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as unknown;
    if (!isGroupTextPayload(parsed)) return null;
    return {
      text: parsed.text,
      replyToId: parsed.replyToId,
      replySnippet: parsed.replySnippet,
    };
  } catch {
    return null;
  }
}
