import type { StoreApi } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { PLAIN_PROTOCOL_VERSION } from "@seclettr/protocol";
import type { PlainMessage, PlainMessageType, PlainReplyMeta } from "./types";
import type { PlainMessagesState } from "./plain-messages-store";
import {
  mergeIncomingMessage,
  type WireConfirmUploadResponse,
  type WireInitUploadResponse,
  type WireSendResponse,
} from "./plain-messages-wire";

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

    // Tracked across try/catch so a failure mid-flight can release the
    // server-side stub via DELETE /plain/attachments/:id instead of leaving
    // it for the 7-day retention sweep.
    let initializedAttachmentId: string | null = null;

    try {
      // 1. Init upload
      const initResp = await api.post<WireInitUploadResponse>("/plain/attachments/init", {
        size: file.size,
        contentType: file.type,
        fileName: file.name,
      });
      const { attachmentId, uploadUrl, uploadFields } = initResp;
      initializedAttachmentId = attachmentId;

      // 2. Upload to S3
      if (uploadFields && Object.keys(uploadFields).length > 0) {
        const formData = new FormData();
        for (const [k, v] of Object.entries(uploadFields)) {
          formData.append(k, v);
        }
        formData.append("file", file);
        const xhr = new XMLHttpRequest();
        await new Promise<void>((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`S3 upload failed: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("S3 upload network error"));
          xhr.open("POST", uploadUrl);
          xhr.send(formData);
        });
      } else {
        // Direct PUT
        const xhr = new XMLHttpRequest();
        await new Promise<void>((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("Upload network error"));
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });
      }

      setProgress(92);

      // 3. Confirm
      const confirmResp = await api.post<WireConfirmUploadResponse>(
        `/plain/attachments/${encodeURIComponent(attachmentId)}/confirm`
      );

      setProgress(96);

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
                            localUrl: confirmResp.downloadUrl,
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
      initializedAttachmentId = null;
    } catch (err) {
      logger.error("[PlainMsg] sendAttachment failed", err);
      if (initializedAttachmentId) {
        // Best-effort cleanup so the orphan row + S3 object don't wait for
        // the retention sweep. A failure here is non-fatal — the sweep is
        // the safety net.
        api.delete(`/plain/attachments/${encodeURIComponent(initializedAttachmentId)}`)
          .catch((cleanupErr) => logger.warn("[PlainMsg] cancel orphan attachment failed", cleanupErr));
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
