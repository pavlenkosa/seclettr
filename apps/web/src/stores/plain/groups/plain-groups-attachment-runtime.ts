import type { StoreApi } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { PLAIN_PROTOCOL_VERSION } from "@seclettr/protocol";
import type { PlainMessage, PlainMessageType, PlainReplyMeta } from "../types";
import {
  cleanupPlainAttachmentOrphan,
  uploadPlainAttachment,
} from "../shared/plain-attachment-upload";
import type { PlainGroupsState } from "./plain-groups-store";
import { mergeGroupMessage, type WireSendResponse } from "./plain-groups-wire";

/**
 * Attachment-send runtime for plain group messages.
 *
 * Extracted from the `plain-groups-store.ts` closure. Owns the optimistic
 * attachment row, `/plain/attachments/init -> upload -> confirm` sequence,
 * the final `/plain/groups/:id/messages` send, best-effort orphan cleanup,
 * and the delayed `revokeObjectURL`.
 */
export interface PlainGroupsAttachmentDeps {
  readonly set: StoreApi<PlainGroupsState>["setState"];
  readonly getMyUserId: () => string | null;
  readonly getMyUsername: () => string | null;
}

export interface SendGroupAttachmentOptions {
  kind?: "voice_note" | "video_note" | "file";
  durationMs?: number;
  mediaGroupId?: string;
  caption?: string;
  replyTo?: PlainReplyMeta;
}

export interface PlainGroupsAttachmentRuntime {
  sendAttachment: (
    groupId: string,
    file: File,
    opts?: SendGroupAttachmentOptions
  ) => Promise<void>;
}

export function createPlainGroupsAttachmentRuntime(
  deps: PlainGroupsAttachmentDeps
): PlainGroupsAttachmentRuntime {
  const { set, getMyUserId, getMyUsername } = deps;

  async function sendAttachment(
    groupId: string,
    file: File,
    opts: SendGroupAttachmentOptions = {}
  ): Promise<void> {
    const myUserId = getMyUserId();
    const myUsername = getMyUsername();
    if (!myUserId || !myUsername) return;

    const kind = opts.kind ?? "file";
    const messageType: PlainMessageType =
      kind === "voice_note" ? "voice_note" : kind === "video_note" ? "video_note" : "attachment";

    const clientId = crypto.randomUUID();
    const localUrl = URL.createObjectURL(file);

    const optimistic: PlainMessage = {
      id: clientId,
      clientId,
      senderId: myUserId,
      senderName: myUsername,
      content: opts.caption ?? "",
      type: messageType,
      attachment: {
        attachmentId: "",
        contentType: file.type,
        fileName: file.name,
        size: file.size,
        durationMs: opts.durationMs,
        mediaGroupId: opts.mediaGroupId,
        localUrl,
      },
      replyTo: opts.replyTo,
      timestamp: Date.now(),
      isOwn: true,
      status: "sending",
      uploadProgress: 0,
    };

    set((state) => ({ groups: mergeGroupMessage(state.groups, groupId, optimistic) }));

    function setProgress(progress: number) {
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.clientId === clientId ? { ...m, uploadProgress: progress } : m
              ),
            },
          },
        };
      });
    }

    let uploadedAttachmentId: string | null = null;

    try {
      const uploadedAttachment = await uploadPlainAttachment({
        file,
        logPrefix: "[PlainGroups]",
        onProgress: setProgress,
      });
      const { attachmentId, downloadUrl } = uploadedAttachment;
      uploadedAttachmentId = attachmentId;

      await api.post<WireSendResponse>(
        `/plain/groups/${encodeURIComponent(groupId)}/messages`,
        {
          version: PLAIN_PROTOCOL_VERSION,
          clientId,
          content: opts.caption ?? "",
          messageType,
          attachmentId,
          durationMs: opts.durationMs,
          mediaGroupId: opts.mediaGroupId,
          replyToId: opts.replyTo?.id,
        }
      );

      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.clientId === clientId
                  ? {
                      ...m,
                      status: "sent" as const,
                      uploadProgress: undefined,
                      attachment: m.attachment
                        ? { ...m.attachment, attachmentId, localUrl: downloadUrl }
                        : undefined,
                    }
                  : m
              ),
            },
          },
        };
      });

      window.setTimeout(() => URL.revokeObjectURL(localUrl), 30_000);
      uploadedAttachmentId = null;
    } catch (err) {
      logger.error("[PlainGroups] sendAttachment failed", err);
      if (uploadedAttachmentId) {
        cleanupPlainAttachmentOrphan(uploadedAttachmentId, "[PlainGroups]");
      }
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.clientId === clientId
                  ? { ...m, status: "error" as const, uploadProgress: undefined }
                  : m
              ),
            },
          },
        };
      });
    }
  }

  return { sendAttachment };
}
