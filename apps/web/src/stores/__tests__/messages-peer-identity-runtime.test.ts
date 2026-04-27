import { describe, expect, it } from "vitest";
import {
  createPeerIdentityRuntime,
  PeerIdentityContinuityError,
  type PeerIdentityConversationLike,
} from "@/stores/messages/peer-identity-runtime";

interface TestConversation extends PeerIdentityConversationLike {}

describe("peer identity runtime", () => {
  it("blocks unexpected peer key changes and materializes an explicit alert", () => {
    const cache = new Map<string, string>([["device-peer", "identity-old"]]);
    const runtime = createPeerIdentityRuntime({
      readCachedPeerIdentityKey: (deviceId) => cache.get(deviceId) ?? null,
      writeCachedPeerIdentityKey: (deviceId, identityKey) => {
        cache.set(deviceId, identityKey);
      },
      resolveConversationUsername: (recipientUserId) => `user:${recipientUserId}`,
      now: () => 1234,
    });

    const result = runtime.checkPeerIdentityContinuity<TestConversation>({
      conversations: {},
      recipientUserId: "user-peer",
      deviceId: "device-peer",
      observedIdentityKey: "identity-new",
    });

    expect(result.blocked).toBe(true);
    expect(() => {
      if (result.blocked) {
        throw new PeerIdentityContinuityError("user-peer", "device-peer");
      }
    }).toThrowError(PeerIdentityContinuityError);
    expect(result.nextConversations?.["user-peer"]).toMatchObject({
      userId: "user-peer",
      username: "user:user-peer",
      peerIdentityByDevice: {
        "device-peer": "identity-old",
      },
      peerIdentityAlertsByDevice: {
        "device-peer": {
          deviceId: "device-peer",
          previousIdentityKey: "identity-old",
          currentIdentityKey: "identity-new",
          detectedAt: 1234,
        },
      },
    });
  });

  it("refreshes an existing alert when the newly observed identity changes again", () => {
    const runtime = createPeerIdentityRuntime({
      readCachedPeerIdentityKey: () => null,
      writeCachedPeerIdentityKey: () => {},
      resolveConversationUsername: (recipientUserId) => recipientUserId,
      now: () => 999,
    });

    const conversations: Record<string, TestConversation> = {
      "user-peer": {
        userId: "user-peer",
        username: "user-peer",
        messages: [],
        lastMessageAt: 0,
        unreadCount: 0,
        peerIdentityByDevice: {
          "device-peer": "identity-old",
        },
        peerIdentityAlertsByDevice: {
          "device-peer": {
            deviceId: "device-peer",
            previousIdentityKey: "identity-old",
            currentIdentityKey: "identity-new",
            detectedAt: 1,
          },
        },
      },
    };

    const result = runtime.checkPeerIdentityContinuity({
      conversations,
      recipientUserId: "user-peer",
      deviceId: "device-peer",
      observedIdentityKey: "identity-newer",
    });

    expect(result.blocked).toBe(true);
    expect(result.nextConversations?.["user-peer"]?.peerIdentityAlertsByDevice?.["device-peer"]).toEqual({
      deviceId: "device-peer",
      previousIdentityKey: "identity-old",
      currentIdentityKey: "identity-newer",
      detectedAt: 999,
    });
  });

  it("accepts a pending identity change and promotes the new key into trusted state", () => {
    const cache = new Map<string, string>();
    const runtime = createPeerIdentityRuntime({
      readCachedPeerIdentityKey: (deviceId) => cache.get(deviceId) ?? null,
      writeCachedPeerIdentityKey: (deviceId, identityKey) => {
        cache.set(deviceId, identityKey);
      },
      resolveConversationUsername: (recipientUserId) => recipientUserId,
    });

    const nextConversations = runtime.acceptPeerIdentityChange<TestConversation>({
      conversations: {
        "user-peer": {
          userId: "user-peer",
          username: "user-peer",
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
          peerIdentityKey: "identity-old",
          peerIdentityDeviceId: "device-peer",
          peerIdentityByDevice: {
            "device-peer": "identity-old",
          },
          peerIdentityAlertsByDevice: {
            "device-peer": {
              deviceId: "device-peer",
              previousIdentityKey: "identity-old",
              currentIdentityKey: "identity-new",
              detectedAt: 1,
            },
          },
        },
      },
      recipientUserId: "user-peer",
      deviceId: "device-peer",
    });

    expect(nextConversations?.["user-peer"]).toMatchObject({
      peerIdentityKey: "identity-new",
      peerIdentityDeviceId: "device-peer",
      peerIdentityByDevice: {
        "device-peer": "identity-new",
      },
    });
    expect(nextConversations?.["user-peer"]?.peerIdentityAlertsByDevice).toBeUndefined();
  });
});
