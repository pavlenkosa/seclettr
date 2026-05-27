/**
 * ComposerContext — shared state bridge for the MessageComposer subtree.
 *
 * Owns:
 *   - A single React context that carries all derived state, hook results,
 *     callbacks, and labels that were previously drilled through the
 *     39-prop MessageComposerShell interface.
 *   - `ComposerProvider` — wraps the Shell subtree and provides the context.
 *   - `useComposerContext` — safe accessor that throws if called outside a provider.
 *
 * Does not own:
 *   - Any state derivation or business logic (belongs in MessageComposer.tsx).
 *   - Any DOM rendering (belongs in MessageComposerShell.tsx and children).
 */
import { createContext, useContext, type ReactNode, type RefObject } from "react";

import type { MessageReplyMeta } from "@/stores/messages";
import type { RecordMode, ComposerPrimaryAction } from "../../composer/MessageComposerPrimaryActions";
import type { UseMessageComposerDraftResult } from "../../composer/useMessageComposerDraft";
import type { UseMessageComposerEmojiStateResult } from "../../composer/useMessageComposerEmojiState";
import type { UseMediaSendDialogResult } from "../../composer/useMediaSendDialog";
import type { DialogState, RecordingCopy } from "./message-composer-view-model";

export interface ComposerContextValue {
  // ── Reply ───────────────────────────────────────────────────────────────
  readonly replyTo: MessageReplyMeta | undefined;
  readonly onClearReply: (() => void) | undefined;
  readonly clearReplyLabel: string;

  // ── Focus / error ───────────────────────────────────────────────────────
  readonly isTextFocused: boolean;
  readonly composerError: string | null;

  // ── Recording ───────────────────────────────────────────────────────────
  readonly isRecording: boolean;
  readonly isVideoRecording: boolean;
  readonly recordingCopy: RecordingCopy;
  readonly recordingWaveformBars: number[];
  readonly previewVideoRef: RefObject<HTMLVideoElement>;

  // ── Hook-result objects ─────────────────────────────────────────────────
  readonly draft: UseMessageComposerDraftResult;
  readonly emojiState: UseMessageComposerEmojiStateResult;
  readonly mediaSend: UseMediaSendDialogResult;
  readonly emojiPickerId: string;
  readonly dialogState: DialogState;

  // ── Primary action state ────────────────────────────────────────────────
  readonly primaryAction: ComposerPrimaryAction;
  readonly showRecordModeChip: boolean;
  readonly isRecordHintVisible: boolean;
  readonly primaryButtonDisabled: boolean;
  readonly currentRecordMode: RecordMode;

  // ── Callbacks ───────────────────────────────────────────────────────────
  readonly onToggleRecordMode: () => void;
  readonly onCancelRecording: () => void;
  readonly onPrimaryActionClick: () => void;

  // ── Labels (i18n strings) ───────────────────────────────────────────────
  readonly attachTitle: string;
  readonly attachLabel: string;
  readonly pickerCameraLabel: string;
  readonly pickerGalleryLabel: string;
  readonly pickerFileLabel: string;
  readonly pickerCancelLabel: string;
  readonly placeholder: string;
  readonly textareaLabel: string;
  readonly recordHintText: string;
  readonly currentRecordModeLabel: string;
  readonly recordModeToggleAriaLabel: string;
  readonly recordModeToggleTitle: string;
  readonly cancelRecordingAriaLabel: string;
  readonly cancelRecordingTitle: string;
  readonly primaryButtonAriaLabel: string;
  readonly primaryButtonTitle: string;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

interface ComposerProviderProps {
  readonly value: ComposerContextValue;
  readonly children: ReactNode;
}

export function ComposerProvider({ value, children }: ComposerProviderProps) {
  return <ComposerContext.Provider value={value}>{children}</ComposerContext.Provider>;
}

/** Read composer context. Throws if called outside a `<ComposerProvider>`. */
export function useComposerContext(): ComposerContextValue {
  const ctx = useContext(ComposerContext);
  if (!ctx) {
    throw new Error("useComposerContext must be used inside <ComposerProvider>");
  }
  return ctx;
}
