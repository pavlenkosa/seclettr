/**
 * Chat history transfer — export encrypted blob to server, import on new device.
 *
 * Encryption: Argon2id (INTERACTIVE) → AES-256-GCM.
 * The server stores only opaque ciphertext, deleted on first download (or after 1 hour).
 * Only DM conversations are transferred; group history is server-side and reloads naturally.
 */

import { ensureSodium } from "@seclettr/crypto";
import { api } from "@/lib/api";
import { useMessagesStore } from "@/stores/messages";
import { persistConversations } from "@/stores/messages/conversation-persistence";
import type { Conversation } from "@/stores/messages/types";

const ARGON_SALT_BYTES = 16;
const AES_IV_BYTES = 12;
const DERIVED_KEY_BYTES = 32;
const TRANSFER_SCHEMA_VERSION = 1;

interface TransferPackage {
  version: typeof TRANSFER_SCHEMA_VERSION;
  conversations: Record<string, Conversation>;
}

async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const sodium = await ensureSodium();
  const passwordBytes = new TextEncoder().encode(password);
  const derived = sodium.crypto_pwhash(
    DERIVED_KEY_BYTES,
    passwordBytes,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
  const buf = new ArrayBuffer(derived.byteLength);
  new Uint8Array(buf).set(derived);
  return crypto.subtle.importKey("raw", buf, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function encrypt(password: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(ARGON_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const key = await deriveAesKey(password, salt);
  const plaintextBuf = plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength) as ArrayBuffer;
  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintextBuf);
  return concatBytes(salt, iv, new Uint8Array(ciphertextBuf));
}

async function decrypt(password: string, blob: Uint8Array): Promise<Uint8Array> {
  if (blob.byteLength < ARGON_SALT_BYTES + AES_IV_BYTES + 1) {
    throw new Error("transfer_blob_too_short");
  }
  const salt = blob.slice(0, ARGON_SALT_BYTES);
  const iv = blob.slice(ARGON_SALT_BYTES, ARGON_SALT_BYTES + AES_IV_BYTES);
  const ciphertext = blob.slice(ARGON_SALT_BYTES + AES_IV_BYTES);
  const key = await deriveAesKey(password, salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new Uint8Array(plain);
  } catch {
    throw new Error("transfer_wrong_password");
  }
}

export type TransferExportProgress =
  | { stage: "serialising" }
  | { stage: "encrypting" }
  | { stage: "uploading" }
  | { stage: "done"; id: string };


export async function exportChatHistory(
  password: string,
  onProgress?: (p: TransferExportProgress) => void
): Promise<string> {
  onProgress?.({ stage: "serialising" });
  const conversations = useMessagesStore.getState().conversations;
  const pkg: TransferPackage = { version: TRANSFER_SCHEMA_VERSION, conversations };
  const plaintext = new TextEncoder().encode(JSON.stringify(pkg));

  onProgress?.({ stage: "encrypting" });
  const encrypted = await encrypt(password, plaintext);

  onProgress?.({ stage: "uploading" });
  let binary = "";
  for (let i = 0; i < encrypted.byteLength; i++) binary += String.fromCodePoint(encrypted[i]!);
  const b64 = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

  const res = await api.post<{ id: string }>("/transfer", { payload: b64 });
  onProgress?.({ stage: "done", id: res.id });
  return res.id;
}

export type TransferImportProgress =
  | { stage: "downloading" }
  | { stage: "decrypting" }
  | { stage: "restoring" }
  | { stage: "done"; conversationCount: number };

export async function importChatHistory(
  transferId: string,
  password: string,
  onProgress?: (p: TransferImportProgress) => void
): Promise<number> {
  onProgress?.({ stage: "downloading" });
  const res = await api.get<{ payload: string }>(`/transfer/${encodeURIComponent(transferId)}`);
  const b64std = res.payload.replaceAll("-", "+").replaceAll("_", "/");
  const raw = Uint8Array.from(atob(b64std), c => c.codePointAt(0)!);

  onProgress?.({ stage: "decrypting" });
  const plain = await decrypt(password, raw);
  const pkg = JSON.parse(new TextDecoder().decode(plain)) as unknown;

  if (
    !pkg ||
    typeof pkg !== "object" ||
    (pkg as { version?: unknown }).version !== TRANSFER_SCHEMA_VERSION
  ) {
    throw new Error("transfer_invalid_package");
  }

  const { conversations } = pkg as TransferPackage;

  onProgress?.({ stage: "restoring" });
  await persistConversations(conversations);
  useMessagesStore.setState((s) => ({
    conversations: { ...conversations, ...s.conversations },
  }));

  const count = Object.keys(conversations).length;
  onProgress?.({ stage: "done", conversationCount: count });
  return count;
}
