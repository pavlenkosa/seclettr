import {
  type SendGroupMessageResponse,
  type PlaintextSenderKeyDistributionMessage,
} from "@seclettr/protocol";
import {
  postGroupMessagePayloadWithRetry,
} from "./groups-outbound-helpers";
import { createGroupsOutboundAttachmentRuntime } from "./groups-outbound-attachment-runtime";
import { createGroupsOutboundQueueRuntime } from "./groups-outbound-queue-runtime";
import { createGroupsOutboundSenderKeyRuntime } from "./groups-outbound-sender-key-runtime";
import { createGroupsOutboundTextRuntime } from "./groups-outbound-text-runtime";
import {
  type GroupOutboundQueueItem,
} from "./group-outbound-queue";
import type { GetGroupsState, SetGroupsState } from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";

interface CreateGroupsOutboundRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
  sendSenderKeyDistribution: (
    recipientUserId: string,
    payload: PlaintextSenderKeyDistributionMessage,
    options?: {
      prefetchedDevices?: Array<{
        deviceId: string;
        identityKeyPublic: string;
      }>;
    }
  ) => Promise<string[]>;
}

export function createGroupsOutboundRuntime({
  set,
  get,
  shared,
  sendSenderKeyDistribution,
}: CreateGroupsOutboundRuntimeOptions) {
  const pendingGroupOutboundEnvelopes = new Map<string, GroupOutboundQueueItem>();
  const senderKeyRuntime = createGroupsOutboundSenderKeyRuntime({
    getMyUserId: shared.getMyUserId,
    getMyDeviceId: shared.getMyDeviceId,
    getStorageKey: shared.getStorageKey,
    sendSenderKeyDistribution,
  });

  async function deliverQueuedGroupOutboundItem(
    item: GroupOutboundQueueItem
  ): Promise<SendGroupMessageResponse> {
    return postGroupMessagePayloadWithRetry(item.groupId, item.payload);
  }

  let attachmentRuntime!: ReturnType<typeof createGroupsOutboundAttachmentRuntime>;
  const queueRuntime = createGroupsOutboundQueueRuntime({
    set,
    get,
    shared,
    pendingGroupOutboundEnvelopes,
    deliverQueuedGroupOutboundItem,
    getRetryAttachmentUpload: () => attachmentRuntime.retryAttachmentUpload,
  });

  const textRuntime = createGroupsOutboundTextRuntime({
    set,
    get,
    shared,
    pendingGroupOutboundEnvelopes,
    ensureGroupSenderKeys: senderKeyRuntime.ensureGroupSenderKeys,
    deliverQueuedGroupOutboundItem,
    markQueuedMessageSent: queueRuntime.markQueuedMessageSent,
  });
  attachmentRuntime = createGroupsOutboundAttachmentRuntime({
    set,
    get,
    shared,
    pendingGroupOutboundEnvelopes,
    ensureGroupSenderKeys: senderKeyRuntime.ensureGroupSenderKeys,
    deliverQueuedGroupOutboundItem,
    markQueuedMessageSent: queueRuntime.markQueuedMessageSent,
  });

  return {
    resumePendingGroupOutboundMessages: queueRuntime.resumePendingGroupOutboundMessages,
    sendGroupText: textRuntime.sendGroupText,
    retryGroupMessage: queueRuntime.retryGroupMessage,

    sendGroupFileAttachment: async (
      groupId: string,
      file: File,
      mediaGroupId?: string,
      caption?: string
    ) => {
      await attachmentRuntime.uploadAndEncryptGroupAttachment({
        groupId,
        blob: file,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || `attachment-${Date.now()}`,
        kind: "file",
        caption,
        mediaGroupId,
      });
    },

    sendGroupVoiceNote: async (groupId: string, blob: Blob, durationMs: number) => {
      await attachmentRuntime.uploadAndEncryptGroupAttachment({
        groupId,
        blob,
        mimeType: blob.type || "audio/webm",
        fileName: `voice-note-${Date.now()}.webm`,
        kind: "voice_note",
        durationMs,
      });
    },

    sendGroupVideoNote: async (groupId: string, blob: Blob, durationMs: number) => {
      await attachmentRuntime.uploadAndEncryptGroupAttachment({
        groupId,
        blob,
        mimeType: blob.type || "video/webm",
        fileName: `video-note-${Date.now()}.webm`,
        kind: "video_note",
        durationMs,
      });
    },
  };
}
