import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ensureSodium, toBase64Url } from "@seclettr/crypto";
import {
  AUTH_PROTOCOL_VERSION,
  DEVICES_PROTOCOL_VERSION,
  WS_PROTOCOL_VERSION,
} from "@seclettr/protocol";
import {
  buildAnswerCallAuthMaterial,
  buildOfferCallAuthMaterial,
  hashCallSdp,
} from "../services/call-auth.js";

const BASE_URL = process.env["API_URL"] ?? "http://127.0.0.1:3301";
type ReceivedWsMessage = {
  type?: string;
  code?: string;
  callId?: string;
  [key: string]: unknown;
};

const wsMessageQueues = new WeakMap<WebSocket, ReceivedWsMessage[]>();

async function apiRequest(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers(options.headers);
  if (
    !headers.has("Content-Type") &&
    options.body !== undefined &&
    options.body !== null
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const rawBody = await response.text();
  if (rawBody.trim().length === 0) {
    return { status: response.status, body: {} };
  }
  return {
    status: response.status,
    body: JSON.parse(rawBody) as unknown,
  };
}

async function registerUser(
  username: string,
  overrides: Partial<{
    signingKeyPublic: string;
  }> = {}
) {
  const fakeKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const fakeSig =
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      version: AUTH_PROTOCOL_VERSION,
      username,
      password: "TestPassword123!",
      device: {
        name: "Direct Call Sync Device",
        identityKeyPublic: fakeKey,
        signingKeyPublic: overrides.signingKeyPublic ?? fakeKey,
        registrationId: Math.floor(Math.random() * 16382) + 1,
        signedPreKey: {
          id: 1,
          publicKey: fakeKey,
          signature: fakeSig,
        },
        oneTimePreKeys: Array.from({ length: 5 }, (_, index) => ({
          id: index + 1,
          publicKey: fakeKey,
        })),
      },
    }),
  });
}

async function issueWsTicket(accessToken: string): Promise<string> {
  const ticketResponse = await apiRequest(
    "/auth/ws-ticket",
    { method: "POST" },
    accessToken
  );
  expect(ticketResponse.status).toBe(200);
  const wsToken = (ticketResponse.body as { wsToken?: string }).wsToken;
  expect(typeof wsToken).toBe("string");
  return wsToken!;
}

async function openAuthedWebSocket(token: string): Promise<WebSocket> {
  const wsUrl = `${BASE_URL.replace(/^http/, "ws")}/ws`;
  const wsToken = await issueWsTicket(token);
  const ws = new WebSocket(wsUrl, ["seclettr.v1", `seclettr.auth.${wsToken}`]);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("WS open timeout")),
      3000
    );
    ws.once("open", () => {
      clearTimeout(timeout);
      const queue: ReceivedWsMessage[] = [];
      wsMessageQueues.set(ws, queue);
      ws.on("message", (rawData) => {
        try {
          const parsed = JSON.parse(rawData.toString()) as ReceivedWsMessage;
          if (parsed && typeof parsed === "object") {
            queue.push(parsed);
          }
          if (queue.length > 64) {
            queue.shift();
          }
        } catch {
          // Ignore malformed frames in tests.
        }
      });
      ws.once("close", () => {
        wsMessageQueues.delete(ws);
      });
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return ws;
}

function takeQueuedWsMessage(
  ws: WebSocket,
  predicate: (message: ReceivedWsMessage) => boolean
): ReceivedWsMessage | null {
  const queue = wsMessageQueues.get(ws);
  if (!queue) {
    return null;
  }
  const matchIndex = queue.findIndex(predicate);
  if (matchIndex === -1) {
    return null;
  }
  return queue.splice(matchIndex, 1)[0] ?? null;
}

async function waitForWsMessage(
  ws: WebSocket,
  predicate: (message: ReceivedWsMessage) => boolean,
  timeoutMs = 3000
): Promise<ReceivedWsMessage> {
  const immediateMatch = takeQueuedWsMessage(ws, predicate);
  if (immediateMatch) {
    return immediateMatch;
  }

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const interval = setInterval(() => {
      const message = takeQueuedWsMessage(ws, predicate);
      if (message) {
        clearInterval(interval);
        resolve(message);
        return;
      }

      if (Date.now() >= deadline) {
        clearInterval(interval);
        reject(new Error("WS message timeout"));
      }
    }, 25);
  });
}

async function expectNoWsMessage(
  ws: WebSocket,
  predicate: (message: ReceivedWsMessage) => boolean,
  timeoutMs = 750
): Promise<void> {
  const immediateMatch = takeQueuedWsMessage(ws, predicate);
  if (immediateMatch) {
    throw new Error(
      `Unexpected websocket message: ${JSON.stringify(immediateMatch)}`
    );
  }

  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const interval = setInterval(() => {
      const message = takeQueuedWsMessage(ws, predicate);
      if (message) {
        clearInterval(interval);
        reject(
          new Error(`Unexpected websocket message: ${JSON.stringify(message)}`)
        );
        return;
      }

      if (Date.now() >= deadline) {
        clearInterval(interval);
        resolve();
      }
    }, 25);
  });
}

describe("direct-call current-device signing key sync", () => {
  it("accepts direct-call offer and answer proofs that include media-encryption state", async () => {
    const sodium = await ensureSodium();
    const originalSigner = sodium.crypto_sign_keypair();
    const repairedSigner = sodium.crypto_sign_keypair();
    const calleeSigner = sodium.crypto_sign_keypair();
    const repairedIdentity = sodium.crypto_box_keypair();
    const repairedSignedPreKey = sodium.crypto_box_keypair();
    const repairedSignedPreKeySignature = toBase64Url(
      sodium.crypto_sign_detached(
        repairedSignedPreKey.publicKey,
        repairedSigner.privateKey
      )
    );

    const caller = await registerUser(`dc_sync_caller_${Date.now()}`, {
      signingKeyPublic: toBase64Url(originalSigner.publicKey),
    });
    expect(caller.status).toBe(201);
    const callerToken = (caller.body as { accessToken: string }).accessToken;
    const callerUserId = (caller.body as { userId: string }).userId;
    const callerDeviceId = (caller.body as { deviceId: string }).deviceId;

    const callee = await registerUser(`dc_sync_callee_${Date.now()}`, {
      signingKeyPublic: toBase64Url(calleeSigner.publicKey),
    });
    expect(callee.status).toBe(201);
    const calleeToken = (callee.body as { accessToken: string }).accessToken;
    const calleeUserId = (callee.body as { userId: string }).userId;
    const calleeDeviceId = (callee.body as { deviceId: string }).deviceId;

    const syncResponse = await apiRequest(
      "/devices/crypto-material",
      {
        method: "PUT",
        body: JSON.stringify({
          version: DEVICES_PROTOCOL_VERSION,
          identityKeyPublic: toBase64Url(repairedIdentity.publicKey),
          signingKeyPublic: toBase64Url(repairedSigner.publicKey),
          signedPreKey: {
            id: 17,
            publicKey: toBase64Url(repairedSignedPreKey.publicKey),
            signature: repairedSignedPreKeySignature,
          },
        }),
      },
      callerToken
    );
    expect(syncResponse.status).toBe(204);

    const callerDevices = await apiRequest("/devices", {}, callerToken);
    expect(callerDevices.status).toBe(200);
    expect(
      (
        callerDevices.body as {
          devices: Array<{ deviceId: string; signingKeyPublic?: string }>;
        }
      ).devices.some(
        (device) =>
          device.deviceId === callerDeviceId &&
          device.signingKeyPublic === toBase64Url(repairedSigner.publicKey)
      )
    ).toBe(true);

    const callerWs = await openAuthedWebSocket(callerToken);
    const calleeWs = await openAuthedWebSocket(calleeToken);
    const createCallResponse = await apiRequest(
      "/calls",
      {
        method: "POST",
        body: JSON.stringify({
          calleeUserId,
          callType: "video",
        }),
      },
      callerToken
    );
    expect(createCallResponse.status).toBe(200);
    const callId = (createCallResponse.body as { callId: string }).callId;
    const offerMediaEncryption = {
      preferredMode: "transport" as const,
      supportedModes: ["transport"] as const,
    };
    const sdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
    const signedAt = new Date().toISOString();
    const sdpHash = hashCallSdp(sdp);
    const signature = toBase64Url(
      sodium.crypto_sign_detached(
        buildOfferCallAuthMaterial({
          callId,
          senderUserId: callerUserId,
          senderDeviceId: callerDeviceId,
          recipientUserId: calleeUserId,
          callType: "video",
          signedAt,
          sdpHash,
          mediaEncryptionPreferredMode: offerMediaEncryption.preferredMode,
          mediaEncryptionSupportedModesCsv: offerMediaEncryption.supportedModes.join(","),
        }),
        repairedSigner.privateKey
      )
    );

    try {
      callerWs.send(
        JSON.stringify({
          version: WS_PROTOCOL_VERSION,
          type: "call.offer",
          callId,
          targetUserId: calleeUserId,
          callType: "video",
          sdp,
          mediaEncryption: offerMediaEncryption,
          auth: {
            version: 1,
            senderUserId: callerUserId,
            senderDeviceId: callerDeviceId,
            recipientUserId: calleeUserId,
            signedAt,
            sdpHash,
            signature,
          },
        })
      );

      const deliveryOutcome = await Promise.race([
        waitForWsMessage(
          calleeWs,
          (message) => message.type === "call.offer" && message.callId === callId
        ).then((message) => ({ kind: "offer" as const, message })),
        waitForWsMessage(
          callerWs,
          (message) => message.type === "error" || message.type === "call.rejected",
          3500
        ).then((message) => ({ kind: "caller_signal" as const, message })),
      ]);

      if (deliveryOutcome.kind !== "offer") {
        throw new Error(
          `Unexpected caller-side signal: ${JSON.stringify(
            deliveryOutcome.message
          )}`
        );
      }
      expect(deliveryOutcome.message.type).toBe("call.offer");

      const answerMediaEncryption = {
        selectedMode: "transport" as const,
        supportedModes: ["transport"] as const,
      };
      const answerSdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
      const answerSignedAt = new Date().toISOString();
      const answerSdpHash = hashCallSdp(answerSdp);
      const answerSignature = toBase64Url(
        sodium.crypto_sign_detached(
          buildAnswerCallAuthMaterial({
            callId,
            senderUserId: calleeUserId,
            senderDeviceId: calleeDeviceId,
            recipientUserId: callerUserId,
            signedAt: answerSignedAt,
            sdpHash: answerSdpHash,
            mediaEncryptionSelectedMode: answerMediaEncryption.selectedMode,
            mediaEncryptionSupportedModesCsv: answerMediaEncryption.supportedModes.join(","),
          }),
          calleeSigner.privateKey
        )
      );

      calleeWs.send(
        JSON.stringify({
          version: WS_PROTOCOL_VERSION,
          type: "call.answer",
          callId,
          sdp: answerSdp,
          mediaEncryption: answerMediaEncryption,
          auth: {
            version: 1,
            senderUserId: calleeUserId,
            senderDeviceId: calleeDeviceId,
            recipientUserId: callerUserId,
            signedAt: answerSignedAt,
            sdpHash: answerSdpHash,
            signature: answerSignature,
          },
        })
      );

      const answeredMessage = await waitForWsMessage(
        callerWs,
        (message) => message.type === "call.answered" && message.callId === callId
      );
      expect(answeredMessage.type).toBe("call.answered");
    } finally {
      callerWs.close();
      calleeWs.close();
    }
  });

  it("does not stale the caller when offer and initial ICE are sent back-to-back", async () => {
    const sodium = await ensureSodium();
    const callerSigner = sodium.crypto_sign_keypair();
    const calleeSigner = sodium.crypto_sign_keypair();

    const caller = await registerUser(`dcoi_c_${Date.now()}`, {
      signingKeyPublic: toBase64Url(callerSigner.publicKey),
    });
    expect(caller.status).toBe(201);
    const callerToken = (caller.body as { accessToken: string }).accessToken;
    const callerUserId = (caller.body as { userId: string }).userId;
    const callerDeviceId = (caller.body as { deviceId: string }).deviceId;

    const callee = await registerUser(`dcoi_e_${Date.now()}`, {
      signingKeyPublic: toBase64Url(calleeSigner.publicKey),
    });
    expect(callee.status).toBe(201);
    const calleeToken = (callee.body as { accessToken: string }).accessToken;
    const calleeUserId = (callee.body as { userId: string }).userId;
    const calleeDeviceId = (callee.body as { deviceId: string }).deviceId;

    const callerWs = await openAuthedWebSocket(callerToken);
    const calleeWs = await openAuthedWebSocket(calleeToken);
    const createCallResponse = await apiRequest(
      "/calls",
      {
        method: "POST",
        body: JSON.stringify({
          calleeUserId,
          callType: "audio",
        }),
      },
      callerToken
    );
    expect(createCallResponse.status).toBe(200);
    const callId = (createCallResponse.body as { callId: string }).callId;

    const offerMediaEncryption = {
      preferredMode: "transport" as const,
      supportedModes: ["transport"] as const,
    };
    const offerSdp = "v=0\r\no=- 10 10 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
    const offerSignedAt = new Date().toISOString();
    const offerSdpHash = hashCallSdp(offerSdp);
    const offerSignature = toBase64Url(
      sodium.crypto_sign_detached(
        buildOfferCallAuthMaterial({
          callId,
          senderUserId: callerUserId,
          senderDeviceId: callerDeviceId,
          recipientUserId: calleeUserId,
          callType: "audio",
          signedAt: offerSignedAt,
          sdpHash: offerSdpHash,
          mediaEncryptionPreferredMode: offerMediaEncryption.preferredMode,
          mediaEncryptionSupportedModesCsv: offerMediaEncryption.supportedModes.join(","),
        }),
        callerSigner.privateKey
      )
    );

    try {
      callerWs.send(
        JSON.stringify({
          version: WS_PROTOCOL_VERSION,
          type: "call.offer",
          callId,
          targetUserId: calleeUserId,
          callType: "audio",
          sdp: offerSdp,
          mediaEncryption: offerMediaEncryption,
          auth: {
            version: 1,
            senderUserId: callerUserId,
            senderDeviceId: callerDeviceId,
            recipientUserId: calleeUserId,
            signedAt: offerSignedAt,
            sdpHash: offerSdpHash,
            signature: offerSignature,
          },
        })
      );
      callerWs.send(
        JSON.stringify({
          version: WS_PROTOCOL_VERSION,
          type: "call.ice.batch",
          callId,
          candidates: [
            {
              candidate:
                "candidate:1 1 udp 2130706431 127.0.0.1 50000 typ host",
            },
          ],
        })
      );

      const deliveryOutcome = await Promise.race([
        waitForWsMessage(
          calleeWs,
          (message) => message.type === "call.offer" && message.callId === callId
        ).then((message) => ({ kind: "offer" as const, message })),
        waitForWsMessage(
          callerWs,
          (message) => message.type === "error" || message.type === "call.rejected",
          3500
        ).then((message) => ({ kind: "caller_signal" as const, message })),
      ]);

      if (deliveryOutcome.kind !== "offer") {
        throw new Error(
          `Unexpected caller-side signal: ${JSON.stringify(
            deliveryOutcome.message
          )}`
        );
      }
      expect(deliveryOutcome.message.type).toBe("call.offer");

      await expectNoWsMessage(
        callerWs,
        (message) =>
          message.type === "error" &&
          message.code === "CALL_SESSION_STALE" &&
          message.callId === callId,
        1_000
      );

      const answerMediaEncryption = {
        selectedMode: "transport" as const,
        supportedModes: ["transport"] as const,
      };
      const answerSdp = "v=0\r\no=- 11 11 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
      const answerSignedAt = new Date().toISOString();
      const answerSdpHash = hashCallSdp(answerSdp);
      const answerSignature = toBase64Url(
        sodium.crypto_sign_detached(
          buildAnswerCallAuthMaterial({
            callId,
            senderUserId: calleeUserId,
            senderDeviceId: calleeDeviceId,
            recipientUserId: callerUserId,
            signedAt: answerSignedAt,
            sdpHash: answerSdpHash,
            mediaEncryptionSelectedMode: answerMediaEncryption.selectedMode,
            mediaEncryptionSupportedModesCsv: answerMediaEncryption.supportedModes.join(","),
          }),
          calleeSigner.privateKey
        )
      );

      calleeWs.send(
        JSON.stringify({
          version: WS_PROTOCOL_VERSION,
          type: "call.answer",
          callId,
          sdp: answerSdp,
          mediaEncryption: answerMediaEncryption,
          auth: {
            version: 1,
            senderUserId: calleeUserId,
            senderDeviceId: calleeDeviceId,
            recipientUserId: callerUserId,
            signedAt: answerSignedAt,
            sdpHash: answerSdpHash,
            signature: answerSignature,
          },
        })
      );

      const answeredMessage = await waitForWsMessage(
        callerWs,
        (message) => message.type === "call.answered" && message.callId === callId
      );
      expect(answeredMessage.type).toBe("call.answered");

      await expectNoWsMessage(
        callerWs,
        (message) =>
          message.type === "error" &&
          message.code === "CALL_SESSION_STALE" &&
          message.callId === callId,
        1_000
      );
    } finally {
      callerWs.close();
      calleeWs.close();
    }
  });
});
