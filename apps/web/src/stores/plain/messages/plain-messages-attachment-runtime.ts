import type { StoreApi } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { PLAIN_PROTOCOL_VERSION } from "@seclettr/protocol";
import type { PlainMessage, PlainMessageType, PlainReplyMeta } from "../types";
import {
  cleanupPlainAttachmentOrphan,
  uploadPlainAttachment,
} from "../shared/plain-attachment-upload";
import type { PlainMessagesState } from "./plain-messages-store";
import { mergeIncomingMessage, type WireSendResponse } from "./plain-messages-wire";

/**
 * Attachment-send runtime for plain DM messages.
 *
 * Extracted from the `plain-messages-store.ts` factory closure. Owns the
 * multi-step file/voice/video attachment flow, with the store `set` and
 * identity accessors passed in as explicit dependencies.
 *
 * Behavior is byte-for-byte identical to the previous in-store definition:
 * optimistic insert, init -> upload -> confirm -> send order, XHR progress
 * milestones up to 90/92/96, best-effort orphan DELETE on mid-flight failure,
 * and the delayed `revokeObjectURL` after a successful send. See
 * `plain-messages-attachment.test.ts`.
 */
export interface PlainMessagesAttachmentDeps {
  readonly set: StoreApi<PlainMessagesState>["setState"];
  readonly getMyUserId: () => string | null;
  readonly getMyUsername: () => string | null;
  readonly conversationKeyFor: (otherUserId: string) => string;
}

export interface SendAttachmentOptions {
  kind?: "voice_note" | "video_note" | "file";
  durationMs?: number;
  mediaGroupId?: string;
  caption?: string;
  replyTo?: PlainReplyMeta;
}

export interface PlainMessagesAttachmentRuntime {
  sendAttachment: (
    recipientUserId: string,
    recipientUsername: string,
    file: File,
    opts?: SendAttachmentOptions
  ) => Promise<void>;
}

export function createPlainMessagesAttachmentRuntime(
  deps: PlainMessagesAttachmentDeps
): PlainMessagesAttachmentRuntime {
  const { set, getMyUserId, getMyUsername, conversationKeyFor } = deps;

  async function sendAttachment(
    recipientUserId: string,
    recipientUsername: string,
    file: File,
    opts: SendAttachmentOptions = {}
  ): Promise<void> {
    const myUserId = getMyUserId();
    const myUsername = getMyUsername();
    if (!myUserId || !myUsername) return;

    const kind = opts.kind ?? "file";
    const messageType: PlainMessageType =
      kind === "voice_note" ? "voice_note" : kind === "video_note" ? "video_note" : "attachment";

    const clientId = crypto.randomUUID();
    const key = conversationKeyFor(recipientUserId);
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

    set((state) => ({
      conversations: mergeIncomingMessage(
        state.conversations,
        key,
        optimistic,
        recipientUsername
      ),
    }));

    function setProgress(progress: number) {
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.map((m) =>
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
        logPrefix: "[PlainMsg]",
        onProgress: setProgress,
      });
      const { attachmentId, downloadUrl } = uploadedAttachment;
      uploadedAttachmentId = attachmentId;

      // 4. Send message
      await api.post<WireSendResponse>(
        `/plain/messages/${encodeURIComponent(recipientUserId)}`,
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

      // Update optimistic message with real attachment info and download URL
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.map((m) =>
                m.clientId === clientId
                  ? {
                      ...m,
                      status: "sent" as const,
                      uploadProgress: undefined,
                      attachment: m.attachment
                        ? {
                            ...m.attachment,
                            attachmentId,
                            localUrl: downloadUrl,
                          }
                        : undefined,
                    }
                  : m
              ),
            },
          },
        };
      });

      // Keep the optimistic object URL alive briefly after the message becomes
      // sent. The sender-side player may already have loaded it before the
      // store swaps `localUrl` to the confirmed download URL; revoking it
      // synchronously makes Chrome fail with ERR_FILE_NOT_FOUND until reload.
      window.setTimeout(() => URL.revokeObjectURL(localUrl), 30_000);
      uploadedAttachmentId = null;
    } catch (err) {
      logger.error("[PlainMsg] sendAttachment failed", err);
      if (uploadedAttachmentId) {
        cleanupPlainAttachmentOrphan(uploadedAttachmentId, "[PlainMsg]");
      }
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.map((m) =>
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
