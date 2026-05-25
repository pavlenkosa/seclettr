import type { Message } from "@/stores/messages";
import type { ChatAttachmentErrorCause } from "@/chats/runtime/chat-attachment-runtime-shared";

/**
 * Message-level media playback coordination keys.
 */
export interface MediaPlaybackProps {
  readonly mediaKey: string;
  readonly activeMediaKey: string | null;
  readonly onActiveMediaChange: (key: string | null) => void;
}

export function formatAttachmentSize(
  bytes: number | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (!bytes || bytes <= 0) return t("message.size.zero");
  const kb = bytes / 1024;
  if (kb < 100) return t("message.size.kbPrecise", { value: kb.toFixed(1) });
  if (kb < 1024) return t("message.size.kbRounded", { value: Math.round(kb) });
  return t("message.size.mb", { value: (kb / 1024).toFixed(1) });
}

export function resolveAttachmentErrorMessage(
  kind: "voice" | "video" | "file",
  errorCause: ChatAttachmentErrorCause | null,
  t: (key: string, params?: Record<string, string | number>) => string,
  isPlain: boolean = false
): string | null {
  if (!errorCause) return null;
  if (errorCause === "digestMismatch") return t(`message.${kind}.errorDigestMismatch`);
  if (errorCause === "storagePending") return t(`message.${kind}.errorPending`);
  if (kind === "voice" && errorCause === "playFailed") return t("message.voice.errorPlayFailed");
  // Plain attachments are never encrypted — surface a fetch-style error instead
  // of the misleading "decryption failed" copy.
  return t(`message.${kind}.${isPlain ? "errorLoadFailed" : "errorDecryptFailed"}`);
}

/**
 * Returns true when the attachment should use the voice-note UI shell.
 */
export function isVoiceNote(msg: Message): boolean {
  return (
    msg.type === "attachment" &&
    !!msg.attachment &&
    (msg.attachment.kind === "voice_note" || msg.attachment.mimeType.startsWith("audio/"))
  );
}

/**
 * Returns true when the attachment should use the circular video-note UI shell.
 * Only explicit video_note kind qualifies; regular video/* uploads are inline media.
 */
export function isVideoNote(msg: Message): boolean {
  return (
    msg.type === "attachment" &&
    !!msg.attachment &&
    msg.attachment.kind === "video_note"
  );
}

/**
 * Returns true for image/* or video/* attachments that are neither voice notes
 * nor circular video notes — these render as inline media thumbnails.
 */
export function isInlineMedia(msg: Message): boolean {
  return (
    msg.type === "attachment" &&
    !!msg.attachment &&
    !isVoiceNote(msg) &&
    !isVideoNote(msg) &&
    (msg.attachment.mimeType.startsWith("image/") || msg.attachment.mimeType.startsWith("video/"))
  );
}

/**
 * Returns true for attachments that are neither voice notes, video notes, nor inline media.
 */
export function isFileAttachment(msg: Message): boolean {
  return (
    msg.type === "attachment" &&
    !!msg.attachment &&
    !isVoiceNote(msg) &&
    !isVideoNote(msg) &&
    !isInlineMedia(msg)
  );
}
