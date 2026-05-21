/**
 * startGroupSfuClient — entry point for the mediasoup SFU session.
 *
 * Bootstraps the full SFU connection:
 *   1. Fetches router RTP capabilities and loads them into a mediasoup Device
 *   2. Creates send and recv transports via HTTP (createSfuHttpClient)
 *   3. Starts createSfuProducerRuntime (local media → SFU)
 *   4. Starts createSfuConsumerRuntime (SFU → remote tracks; WS-authoritative + 30s HTTP poll)
 *
 * Module-level singleton: sfuHttpClient is created once per SFU session and
 * shared by producer/consumer runtimes. It is not retained across sessions.
 *
 * Returns a GroupSfuClient handle with remote media access and a close() method.
 */
import { type types as MediasoupTypes } from "mediasoup-client";
import { Device as MediasoupDevice } from "mediasoup-client";
import { wsClient } from "@/lib/websocket";
import { resolveSfuBaseUrl } from "@/lib/runtime-config";
import type {
  LocalGroupCallMediaKey,
  ReceivedGroupCallMediaKey,
} from "@/calls/group/runtime/media-key/media-key";
import { logGroupCallWarn } from "@/calls/group/runtime/media-key/logger";
import { createSfuHttpClient } from "./http-client";
import { createSfuConsumerRuntime } from "./consumer-runtime";
import { createSfuProducerRuntime } from "./producer-runtime";
import {
  getUnexpectedSfuRtpParameterKeys,
  normalizeSfuRtpParameters,
} from "./rtp-parameters";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/media-key/remote-media";
import type { GroupCallMediaEncryptionMode } from "./types";
import type { SfuProducerSource } from "@seclettr/protocol";

type CallType = "audio" | "video";

const SFU_BASE_URL = resolveSfuBaseUrl();

export type { GroupCallRemoteMedia } from "@/calls/group/runtime/media-key/remote-media";
export type { GroupCallMediaEncryptionMode } from "./types";

export interface GroupSfuClientOptions {
  roomId: string;
  userId: string;
  deviceId: string;
  callType: CallType;
  localStream: MediaStream;
  initialLocalMediaKey?: LocalGroupCallMediaKey | null;
  mediaEncryptionMode?: GroupCallMediaEncryptionMode;
  onRemoteMediaUpdate?: (participants: GroupCallRemoteMedia[]) => void;
  /** Called when the send transport enters a terminal failure state. */
  onTransportFailed?: () => void;
  /** Override SFU base URL (used for guest/room calls where SFU URL comes from the join response). */
  sfuBaseUrl?: string;
  /** Static bearer token for SFU auth (used for guests who have no auth store session). */
  staticToken?: string;
}

export interface GroupSfuClient {
  readonly rtpCapabilities: MediasoupTypes.RtpCapabilities;
  syncRemoteProducers: () => Promise<void>;
  removeParticipantMedia: (userId: string) => void;
  setVideoTrack: (track: MediaStreamTrack | null, source?: SfuProducerSource) => Promise<void>;
  setAudioTrack: (track: MediaStreamTrack) => Promise<void>;
  setLocalMediaKey: (mediaKey: LocalGroupCallMediaKey | null) => void;
  setRemoteMediaKey: (senderDeviceId: string, mediaKey: ReceivedGroupCallMediaKey | null) => void;
  getDebugSnapshot: () => Record<string, unknown>;
  close: () => void;
}

const defaultSfuHttpClient = createSfuHttpClient({
  sfuBaseUrl: SFU_BASE_URL,
});

export async function startGroupSfuClient(options: GroupSfuClientOptions): Promise<GroupSfuClient> {
  const sfuHttpClient = (options.sfuBaseUrl || options.staticToken)
    ? createSfuHttpClient({ sfuBaseUrl: options.sfuBaseUrl ?? SFU_BASE_URL, staticToken: options.staticToken })
    : defaultSfuHttpClient;

  const device = new MediasoupDevice();
  const routerRtpCapabilities = await sfuHttpClient.getRouterRtpCapabilities(options.roomId);
  await device.load({ routerRtpCapabilities });

  const [sendTransportResponse, recvTransportResponse] = await Promise.all([
    sfuHttpClient.createTransport({
      roomId: options.roomId,
      userId: options.userId,
      direction: "send",
    }),
    sfuHttpClient.createTransport({
      roomId: options.roomId,
      userId: options.userId,
      direction: "recv",
    }),
  ]);

  const sendTransport = device.createSendTransport(sfuHttpClient.toTransportOptions(sendTransportResponse));
  const recvTransport = device.createRecvTransport(sfuHttpClient.toTransportOptions(recvTransportResponse));
  const mediaEncryptionMode = options.mediaEncryptionMode ?? "best-effort";
  const frameCryptoEnabled = mediaEncryptionMode !== "off";
  const frameCryptoRequired = mediaEncryptionMode === "required";
  let closed = false;

  sendTransport.on("connectionstatechange", (state) => {
    if (!closed && (state === "failed" || state === "closed")) {
      logGroupCallWarn("[group-call] SFU send transport failed", { roomId: options.roomId, state });
      options.onTransportFailed?.();
    }
  });

  const announceLocalProducerState = (
    producerId: string,
    kind: "audio" | "video",
    state: "added" | "removed",
    source?: SfuProducerSource
  ) => {
    wsClient.send(
      {
        type: "group.call.producer_state",
        callId: options.roomId,
        producerId,
        kind,
        source,
        state,
      },
      {
        queueIfDisconnected: true,
        queueKey: `group.call.producer_state:${options.roomId}:${producerId}:${state}`,
        ttlMs: 10_000,
      }
    );
  };

  sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
    sfuHttpClient.connectTransport({
      roomId: options.roomId,
      transportId: sendTransport.id,
      dtlsParameters,
    }).then(callback).catch((error) => {
      errback(error as Error);
    });
  });

  sendTransport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
    const strippedRtpParameterKeys = getUnexpectedSfuRtpParameterKeys(rtpParameters);
    if (strippedRtpParameterKeys.length > 0) {
      logGroupCallWarn("[group-call] stripping unsupported RTP parameter keys before SFU produce", {
        roomId: options.roomId,
        kind,
        keys: strippedRtpParameterKeys,
      });
    }
    sfuHttpClient.produce({
      roomId: options.roomId,
      transportId: sendTransport.id,
      kind,
      source: kind === "video" && appData && typeof appData === "object" && "source" in appData
        ? (appData.source as SfuProducerSource | undefined)
        : undefined,
      rtpParameters: normalizeSfuRtpParameters(rtpParameters),
    }).then((producerId) => {
      callback({ id: producerId });
    }).catch((error) => {
      errback(error as Error);
    });
  });

  recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
    sfuHttpClient.connectTransport({
      roomId: options.roomId,
      transportId: recvTransport.id,
      dtlsParameters,
    }).then(callback).catch((error) => {
      errback(error as Error);
    });
  });

  const producerRuntime = createSfuProducerRuntime({
    roomId: options.roomId,
    deviceId: options.deviceId,
    localStream: options.localStream,
    sendTransport,
    canProduceVideo: device.canProduce("video"),
    mediaEncryptionMode,
    initialLocalMediaKey: options.initialLocalMediaKey ?? null,
    sfuHttpClient,
    announceProducerState: announceLocalProducerState,
  });

  const consumerRuntime = createSfuConsumerRuntime({
    roomId: options.roomId,
    userId: options.userId,
    deviceId: options.deviceId,
    recvTransport,
    rtpCapabilities: device.recvRtpCapabilities,
    mediaEncryptionMode,
    getLocalProducerIds: () => producerRuntime.getLocalProducerIds(),
    onRemoteMediaUpdate: options.onRemoteMediaUpdate,
    sfuHttpClient,
    wsClient,
  });

  await producerRuntime.initializeLocalProducers();

  wsClient.send({
    type: "room.join",
    roomId: options.roomId,
    rtpCapabilities: JSON.stringify(device.recvRtpCapabilities),
  });

  await consumerRuntime.syncRemoteProducers();

  return {
    rtpCapabilities: device.recvRtpCapabilities,
    syncRemoteProducers: consumerRuntime.syncRemoteProducers,
    removeParticipantMedia: consumerRuntime.removeParticipantMedia,
    setVideoTrack: producerRuntime.setVideoTrack,
    setAudioTrack: producerRuntime.setAudioTrack,
    setLocalMediaKey: producerRuntime.setLocalMediaKey,
    setRemoteMediaKey: consumerRuntime.setRemoteMediaKey,
    getDebugSnapshot: () => ({
      roomId: options.roomId,
      userId: options.userId,
      deviceId: options.deviceId,
      mediaEncryptionMode,
      frameCryptoEnabled,
      frameCryptoRequired,
      ...producerRuntime.getDebugSnapshot(),
      ...consumerRuntime.getDebugSnapshot(),
    }),
    close: () => {
      if (closed) {
        return;
      }
      closed = true;

      consumerRuntime.close();
      wsClient.send({ type: "room.leave", roomId: options.roomId });
      sfuHttpClient.leaveRoomPeer(options.roomId, options.userId).catch((error) => {
        logGroupCallWarn("[group-call] failed to close SFU peer", error);
      });
      producerRuntime.close();
      recvTransport.close();
      sendTransport.close();
    },
  };
}
