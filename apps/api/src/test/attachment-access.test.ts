import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AUTH_PROTOCOL_VERSION,
  GROUPS_PROTOCOL_VERSION,
  MESSAGE_PROTOCOL_VERSION,
} from "@seclettr/protocol";

const BASE_URL = process.env["API_URL"] ?? "http://localhost:3001";

async function apiRequest(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ status: number; body: unknown }> {
  const normalizedPath = path.split("?")[0] ?? path;
  let body = options.body;
  if (
    normalizedPath === "/messages" &&
    typeof body === "string"
  ) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !("version" in parsed)) {
        body = JSON.stringify({
          version: MESSAGE_PROTOCOL_VERSION,
          ...parsed,
        });
      }
    } catch {
      // Keep original body when it's not valid JSON.
    }
  }

  const headers = new Headers(options.headers);
  const isMultipart = typeof FormData !== "undefined" && body instanceof FormData;
  if (
    !isMultipart &&
    !headers.has("Content-Type") &&
    body !== undefined &&
    body !== null
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    ...(body !== undefined ? { body } : {}),
    headers,
  });
  const responseBody = await res.json().catch(() => ({}));
  return { status: res.status, body: responseBody };
}

function buildEncryptedAttachment(size: number) {
  const ciphertext = Buffer.alloc(size, 0x41);
  const encryptedDigest = createHash("sha256").update(ciphertext).digest("base64url");
  return { ciphertext, encryptedDigest };
}

async function initAttachment(
  token: string,
  ciphertext: Buffer,
  contentType = "application/octet-stream"
): Promise<{ attachmentId: string; encryptedDigest: string }> {
  const encryptedDigest = createHash("sha256").update(ciphertext).digest("base64url");
  const initUpload = await apiRequest(
    "/attachments/init-upload",
    {
      method: "POST",
      body: JSON.stringify({
        encryptedSize: ciphertext.length,
        encryptedDigest,
        contentType,
      }),
    },
    token
  );
  expect(initUpload.status).toBe(200);

  return {
    attachmentId: (initUpload.body as { attachmentId: string }).attachmentId,
    encryptedDigest,
  };
}

async function proxyUploadCiphertext(
  attachmentId: string,
  ciphertext: Buffer,
  token: string
): Promise<{ status: number; body: unknown }> {
  const form = new FormData();
  form.append(
    "ciphertext",
    new Blob([ciphertext], { type: "application/octet-stream" }),
    "ciphertext.bin"
  );
  return apiRequest(
    `/attachments/${attachmentId}/upload-ciphertext`,
    {
      method: "POST",
      body: form,
    },
    token
  );
}

async function registerUser(username: string) {
  const fakeKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const fakeSig = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      version: AUTH_PROTOCOL_VERSION,
      username,
      password: "TestPassword123!",
      device: {
        name: "Attachment Test Device",
        identityKeyPublic: fakeKey,
        signingKeyPublic: fakeKey,
        registrationId: Math.floor(Math.random() * 16382) + 1,
        signedPreKey: {
          id: 1,
          publicKey: fakeKey,
          signature: fakeSig,
        },
        oneTimePreKeys: Array.from({ length: 3 }, (_, i) => ({
          id: i + 1,
          publicKey: fakeKey,
        })),
      },
    }),
  });
}

describe("Attachment access control", () => {
  let senderToken = "";
  let senderUserId = "";
  let recipientToken = "";
  let recipientUserId = "";
  let recipientDeviceId = "";
  let strangerToken = "";
  let attachmentId = "";
  let groupId = "";

  beforeAll(async () => {
    const sender = await registerUser(`attach_sender_${Date.now()}`);
    expect(sender.status).toBe(201);
    senderToken = (sender.body as { accessToken: string }).accessToken;
    senderUserId = (sender.body as { userId: string }).userId;

    const recipient = await registerUser(`attach_recipient_${Date.now()}`);
    expect(recipient.status).toBe(201);
    recipientToken = (recipient.body as { accessToken: string }).accessToken;
    recipientUserId = (recipient.body as { userId: string }).userId;

    const stranger = await registerUser(`attach_stranger_${Date.now()}`);
    expect(stranger.status).toBe(201);
    strangerToken = (stranger.body as { accessToken: string }).accessToken;

    const relationship = await apiRequest(
      `/users/${recipientUserId}/direct-relationship`,
      { method: "POST" },
      senderToken
    );
    expect(relationship.status).toBe(200);

    const recipientDevices = await apiRequest(`/users/${recipientUserId}/devices`, {}, senderToken);
    expect(recipientDevices.status).toBe(200);
    recipientDeviceId = (
      recipientDevices.body as { devices: Array<{ deviceId: string }> }
    ).devices[0]!.deviceId;

    const group = await apiRequest(
      "/groups",
      {
        method: "POST",
        body: JSON.stringify({
          version: GROUPS_PROTOCOL_VERSION,
          name: "Attachment Test Group",
          memberUserIds: [recipientUserId],
        }),
      },
      senderToken
    );
    expect(group.status).toBe(201);
    groupId = (group.body as { groupId: string }).groupId;

    const initUpload = await apiRequest(
      "/attachments/init-upload",
      {
        method: "POST",
        body: JSON.stringify({
          encryptedSize: 32,
          encryptedDigest: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          contentType: "audio/webm",
        }),
      },
      senderToken
    );
    expect(initUpload.status).toBe(200);
    attachmentId = (initUpload.body as { attachmentId: string }).attachmentId;

    const messageSend = await apiRequest(
      "/messages",
      {
        method: "POST",
        body: JSON.stringify({
          version: MESSAGE_PROTOCOL_VERSION,
          clientMessageId: crypto.randomUUID(),
          recipientUserId,
          messages: [
            {
              recipientDeviceId,
              ciphertext: "AAAA",
              type: "attachment",
              attachmentId,
            },
          ],
        }),
      },
      senderToken
    );
    expect(messageSend.status).toBe(202);
  });

  it("allows uploader to fetch download URL", async () => {
    const res = await apiRequest(`/attachments/${attachmentId}/download-url`, {}, senderToken);
    expect(res.status).toBe(200);
    expect(typeof (res.body as { downloadUrl?: string }).downloadUrl).toBe("string");
  });

  it("allows recipient device with granted access to fetch download URL", async () => {
    const res = await apiRequest(`/attachments/${attachmentId}/download-url`, {}, recipientToken);
    expect(res.status).toBe(200);
    expect(typeof (res.body as { downloadUrl?: string }).downloadUrl).toBe("string");
  });

  it("denies unrelated authenticated user", async () => {
    const res = await apiRequest(`/attachments/${attachmentId}/download-url`, {}, strangerToken);
    expect(res.status).toBe(404);
  });

  it("rejects attachment messages without attachmentId", async () => {
    const res = await apiRequest(
      "/messages",
      {
        method: "POST",
        body: JSON.stringify({
          clientMessageId: crypto.randomUUID(),
          recipientUserId,
          messages: [
            {
              recipientDeviceId,
              ciphertext: "AAAA",
              type: "attachment",
            },
          ],
        }),
      },
      senderToken
    );
    expect(res.status).toBe(400);
  });

  it("rejects referencing attachment from different owner", async () => {
    const otherInitUpload = await apiRequest(
      "/attachments/init-upload",
      {
        method: "POST",
        body: JSON.stringify({
          encryptedSize: 64,
          encryptedDigest: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          contentType: "audio/webm",
        }),
      },
      strangerToken
    );
    expect(otherInitUpload.status).toBe(200);
    const foreignAttachmentId = (otherInitUpload.body as { attachmentId: string }).attachmentId;

    const res = await apiRequest(
      "/messages",
      {
        method: "POST",
        body: JSON.stringify({
          clientMessageId: crypto.randomUUID(),
          recipientUserId,
          messages: [
            {
              recipientDeviceId,
              ciphertext: "AAAA",
              type: "attachment",
              attachmentId: foreignAttachmentId,
            },
          ],
        }),
      },
      senderToken
    );
    expect(res.status).toBe(403);
  });

  it("does not grant group attachment access from non-attachment messages", async () => {
    const otherInitUpload = await apiRequest(
      "/attachments/init-upload",
      {
        method: "POST",
        body: JSON.stringify({
          encryptedSize: 64,
          encryptedDigest: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
          contentType: "audio/webm",
        }),
      },
      strangerToken
    );
    expect(otherInitUpload.status).toBe(200);
    const foreignAttachmentId = (otherInitUpload.body as { attachmentId: string }).attachmentId;

    const send = await apiRequest(
      `/groups/${groupId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          version: MESSAGE_PROTOCOL_VERSION,
          clientMessageId: crypto.randomUUID(),
          groupId,
          distributionId: crypto.randomUUID(),
          chainId: 0,
          messageId: Math.floor(Math.random() * 1_000_000) + 1,
          ciphertext: "AAAA",
          signature: "BBBB",
          type: "text",
          attachmentId: foreignAttachmentId,
        }),
      },
      senderToken
    );
    expect(send.status).toBe(202);

    const recipientAccess = await apiRequest(
      `/attachments/${foreignAttachmentId}/download-url`,
      {},
      recipientToken
    );
    expect(recipientAccess.status).toBe(404);
  });

  it("allows uploader proxy upload and recipient inline ciphertext fetch", async () => {
    const { ciphertext } = buildEncryptedAttachment(48);
    const { attachmentId: proxiedAttachmentId, encryptedDigest } = await initAttachment(
      senderToken,
      ciphertext,
      "audio/webm"
    );

    const upload = await proxyUploadCiphertext(proxiedAttachmentId, ciphertext, senderToken);
    expect(upload.status).toBe(204);

    const messageSend = await apiRequest(
      "/messages",
      {
        method: "POST",
        body: JSON.stringify({
          clientMessageId: crypto.randomUUID(),
          recipientUserId,
          messages: [
            {
              recipientDeviceId,
              ciphertext: "AAAA",
              type: "attachment",
              attachmentId: proxiedAttachmentId,
            },
          ],
        }),
      },
      senderToken
    );
    expect(messageSend.status).toBe(202);

    const ciphertextRes = await apiRequest(
      `/attachments/${proxiedAttachmentId}/ciphertext`,
      {},
      recipientToken
    );
    expect(ciphertextRes.status).toBe(200);
    expect((ciphertextRes.body as { ciphertext?: string }).ciphertext).toBe(
      ciphertext.toString("base64url")
    );
    expect((ciphertextRes.body as { encryptedDigest?: string }).encryptedDigest).toBe(encryptedDigest);
    expect((ciphertextRes.body as { encryptedSize?: number }).encryptedSize).toBe(ciphertext.length);
  });

  it("returns a transient status while ciphertext is not uploaded yet", async () => {
    const { ciphertext } = buildEncryptedAttachment(36);
    const { attachmentId: pendingAttachmentId } = await initAttachment(
      senderToken,
      ciphertext,
      "image/png"
    );

    const messageSend = await apiRequest(
      "/messages",
      {
        method: "POST",
        body: JSON.stringify({
          clientMessageId: crypto.randomUUID(),
          recipientUserId,
          messages: [
            {
              recipientDeviceId,
              ciphertext: "AAAA",
              type: "attachment",
              attachmentId: pendingAttachmentId,
            },
          ],
        }),
      },
      senderToken
    );
    expect(messageSend.status).toBe(202);

    const ciphertextRes = await apiRequest(
      `/attachments/${pendingAttachmentId}/ciphertext`,
      {},
      recipientToken
    );
    expect(ciphertextRes.status).toBe(409);
    expect((ciphertextRes.body as { error?: string }).error).toBe(
      "Attachment object not ready"
    );
  });

  it("denies proxy upload from a non-uploader device", async () => {
    const { ciphertext } = buildEncryptedAttachment(40);
    const { attachmentId: proxiedAttachmentId } = await initAttachment(senderToken, ciphertext);

    const upload = await proxyUploadCiphertext(proxiedAttachmentId, ciphertext, strangerToken);
    expect(upload.status).toBe(403);
  });

  it("rejects proxy upload when encrypted digest mismatches", async () => {
    const { ciphertext } = buildEncryptedAttachment(56);
    const { attachmentId: proxiedAttachmentId } = await initAttachment(senderToken, ciphertext);
    const mismatchedCiphertext = Buffer.alloc(ciphertext.length, 0x42);

    const upload = await proxyUploadCiphertext(proxiedAttachmentId, mismatchedCiphertext, senderToken);
    expect(upload.status).toBe(400);
    expect((upload.body as { error?: string }).error).toBe("Encrypted digest mismatch");
  });

  it("denies unrelated authenticated user from fetching inline ciphertext", async () => {
    const { ciphertext } = buildEncryptedAttachment(44);
    const { attachmentId: proxiedAttachmentId } = await initAttachment(senderToken, ciphertext);

    const upload = await proxyUploadCiphertext(proxiedAttachmentId, ciphertext, senderToken);
    expect(upload.status).toBe(204);

    const ciphertextRes = await apiRequest(
      `/attachments/${proxiedAttachmentId}/ciphertext`,
      {},
      strangerToken
    );
    expect(ciphertextRes.status).toBe(404);
  });
});
