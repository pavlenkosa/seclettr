export interface PeerIdentityAlert {
  deviceId: string;
  previousIdentityKey: string;
  currentIdentityKey: string;
  detectedAt: number;
}

export interface PeerIdentityConversationLike {
  userId: string;
  username: string;
  messages: unknown[];
  lastMessageAt: number;
  unreadCount: number;
  peerIdentityKey?: string;
  peerIdentityDeviceId?: string;
  peerIdentityByDevice?: Record<string, string>;
  peerIdentityAlertsByDevice?: Record<string, PeerIdentityAlert>;
}

export interface PeerIdentityContinuityCheckResult<T extends PeerIdentityConversationLike> {
  nextConversations: Record<string, T> | null;
  blocked: boolean;
}

interface CreatePeerIdentityRuntimeOptions {
  readCachedPeerIdentityKey: (deviceId: string) => string | null;
  writeCachedPeerIdentityKey: (deviceId: string, identityKey: string) => void;
  resolveConversationUsername: (recipientUserId: string) => string;
  now?: () => number;
}

export class PeerIdentityContinuityError extends Error {
  readonly recipientUserId: string;
  readonly deviceId: string;

  constructor(recipientUserId: string, deviceId: string) {
    super("Peer identity changed and must be re-verified before messaging can continue.");
    this.name = "PeerIdentityContinuityError";
    this.recipientUserId = recipientUserId;
    this.deviceId = deviceId;
  }
}

function createConversationFallback<T extends PeerIdentityConversationLike>(
  recipientUserId: string,
  username: string
): T {
  return {
    userId: recipientUserId,
    username,
    messages: [],
    lastMessageAt: 0,
    unreadCount: 0,
  } as unknown as T;
}

export function createPeerIdentityRuntime(
  options: CreatePeerIdentityRuntimeOptions
) {
  const now = options.now ?? (() => Date.now());

  const getConversationIdentityAlert = (
    conversation: PeerIdentityConversationLike | undefined,
    deviceId: string
  ): PeerIdentityAlert | null => {
    return conversation?.peerIdentityAlertsByDevice?.[deviceId] ?? null;
  };

  const getTrackedPeerIdentityKey = (
    conversation: PeerIdentityConversationLike | undefined,
    deviceId: string
  ): string | null => {
    return conversation?.peerIdentityByDevice?.[deviceId]
      ?? options.readCachedPeerIdentityKey(deviceId);
  };

  const buildAlertedConversations = <T extends PeerIdentityConversationLike>(
    conversations: Record<string, T>,
    params: {
      recipientUserId: string;
      deviceId: string;
      previousIdentityKey: string;
      currentIdentityKey: string;
    }
  ): Record<string, T> => {
    const conversation = conversations[params.recipientUserId]
      ?? createConversationFallback<T>(
        params.recipientUserId,
        options.resolveConversationUsername(params.recipientUserId)
      );

    const peerIdentityByDevice = {
      ...conversation.peerIdentityByDevice,
    };
    if (!peerIdentityByDevice[params.deviceId]) {
      peerIdentityByDevice[params.deviceId] = params.previousIdentityKey;
    }

    return {
      ...conversations,
      [params.recipientUserId]: {
        ...conversation,
        peerIdentityByDevice,
        peerIdentityAlertsByDevice: {
          ...conversation.peerIdentityAlertsByDevice,
          [params.deviceId]: {
            deviceId: params.deviceId,
            previousIdentityKey: params.previousIdentityKey,
            currentIdentityKey: params.currentIdentityKey,
            detectedAt: now(),
          },
        },
      },
    };
  };

  const checkPeerIdentityContinuity = <T extends PeerIdentityConversationLike>(
    params: {
      conversations: Record<string, T>;
      recipientUserId: string;
      deviceId: string;
      observedIdentityKey: string;
    }
  ): PeerIdentityContinuityCheckResult<T> => {
    const conversation = params.conversations[params.recipientUserId];
    const existingAlert = getConversationIdentityAlert(conversation, params.deviceId);

    if (existingAlert) {
      const nextConversations = existingAlert.currentIdentityKey === params.observedIdentityKey
        ? null
        : buildAlertedConversations(params.conversations, {
          recipientUserId: params.recipientUserId,
          deviceId: params.deviceId,
          previousIdentityKey: existingAlert.previousIdentityKey,
          currentIdentityKey: params.observedIdentityKey,
        });
      return {
        nextConversations,
        blocked: true,
      };
    }

    const trackedIdentity = getTrackedPeerIdentityKey(conversation, params.deviceId);
    if (trackedIdentity && trackedIdentity !== params.observedIdentityKey) {
      return {
        nextConversations: buildAlertedConversations(params.conversations, {
          recipientUserId: params.recipientUserId,
          deviceId: params.deviceId,
          previousIdentityKey: trackedIdentity,
          currentIdentityKey: params.observedIdentityKey,
        }),
        blocked: true,
      };
    }

    return {
      nextConversations: null,
      blocked: false,
    };
  };

  const acceptPeerIdentityChange = <T extends PeerIdentityConversationLike>(
    params: {
      conversations: Record<string, T>;
      recipientUserId: string;
      deviceId: string;
    }
  ): Record<string, T> | null => {
    const conversation = params.conversations[params.recipientUserId];
    const alert = getConversationIdentityAlert(conversation, params.deviceId);
    if (!conversation || !alert) {
      return null;
    }

    const nextPeerIdentityByDevice = {
      ...conversation.peerIdentityByDevice,
      [params.deviceId]: alert.currentIdentityKey,
    };
    const nextPeerIdentityAlertsByDevice = {
      ...conversation.peerIdentityAlertsByDevice,
    };
    delete nextPeerIdentityAlertsByDevice[params.deviceId];

    const nextPeerIdentityDeviceId = conversation.peerIdentityDeviceId ?? params.deviceId;
    const nextPeerIdentityKey = nextPeerIdentityByDevice[nextPeerIdentityDeviceId]
      ?? conversation.peerIdentityKey
      ?? alert.currentIdentityKey;

    return {
      ...params.conversations,
      [params.recipientUserId]: {
        ...conversation,
        peerIdentityKey: nextPeerIdentityKey,
        peerIdentityDeviceId: nextPeerIdentityDeviceId,
        peerIdentityByDevice: nextPeerIdentityByDevice,
        peerIdentityAlertsByDevice: Object.keys(nextPeerIdentityAlertsByDevice).length > 0
          ? nextPeerIdentityAlertsByDevice
          : undefined,
      },
    };
  };

  const cachePeerIdentity = (deviceId: string, identityKey: string): void => {
    options.writeCachedPeerIdentityKey(deviceId, identityKey);
  };

  return {
    acceptPeerIdentityChange,
    cachePeerIdentity,
    checkPeerIdentityContinuity,
    getConversationIdentityAlert,
    getTrackedPeerIdentityKey,
  };
}
