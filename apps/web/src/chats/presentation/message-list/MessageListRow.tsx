import { memo, useCallback, type CSSProperties } from "react";
import { MessageContextMenu, type MessageContextMenuAction } from "../MessageContextMenu";
import type { MessageListRowPresentation } from "./message-list-presentation";
import {
  CallEventRow,
  DateSeparator,
  MessageBubble,
  MessageRowFrame,
  MessageBodyKind,
  MessageListRowMessage,
} from "./MessageListRowComponents";
import {
  isFileAttachment,
  isInlineMedia,
  isVideoNote,
  isVoiceNote,
} from "./MessageListAttachments";

interface Props {
  readonly presentation: MessageListRowPresentation;
  readonly activeMediaKey: string | null;
  readonly onActiveMediaChange: (next: string | null) => void;
  readonly onRetry?: (messageId: string) => void;
  readonly onReply?: (messageId: string) => void;
  readonly onDelete?: (messageId: string) => void;
  readonly onForward?: (messageId: string) => void;
  readonly onScrollToMessage?: (messageId: string) => void;
  readonly isHighlighted: boolean;
  readonly enterDelayMs: number;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly selectionMode?: boolean;
  readonly isSelected?: boolean;
  readonly onToggleSelect?: (messageId: string) => void;
  readonly onEnterSelectionMode?: (messageId: string) => void;
}

interface MessageRowCapabilities {
  canCopy: boolean;
  canDelete: boolean;
  canForward: boolean;
}

interface MessageRowViewModel {
  kind: MessageBodyKind;
  capabilities: MessageRowCapabilities;
  copyText?: string;
}

interface MessageRowContentProps {
  presentation: MessageListRowPresentation;
  viewModel: MessageRowViewModel;
  activeMediaKey: string | null;
  onActiveMediaChange: (next: string | null) => void;
  onRetry?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  isHighlighted: boolean;
  t: Props["t"];
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;
  onEnterSelectionMode?: (messageId: string) => void;
}

function getMessageBodyKind(
  message: MessageListRowMessage,
  hasMediaGroup: boolean
): MessageBodyKind {
  if (isVoiceNote(message)) return "voice";
  if (isVideoNote(message)) return "video";
  if (hasMediaGroup) return "mediaGroup";
  if (isInlineMedia(message)) return "media";
  if (isFileAttachment(message)) return "file";
  return "text";
}

function canCopyMessage(message: MessageListRowMessage, kind: MessageBodyKind): boolean {
  return kind === "text" && Boolean(message.content) && !message.content.startsWith("[");
}

function canForwardMessage(message: MessageListRowMessage, kind: MessageBodyKind): boolean {
  return kind === "text" && Boolean(message.content) && !message.content.startsWith("[");
}

function resolveMessageRowCapabilities(
  message: MessageListRowMessage,
  kind: MessageBodyKind,
  handlers: Pick<Props, "onDelete" | "onForward">
): MessageRowCapabilities {
  return {
    canCopy: canCopyMessage(message, kind),
    canDelete: Boolean(handlers.onDelete) && message.isOwn,
    canForward: Boolean(handlers.onForward) && canForwardMessage(message, kind),
  };
}

function resolveMessageContextCopyText(
  message: MessageListRowMessage,
  capabilities: MessageRowCapabilities
): string | undefined {
  return capabilities.canCopy ? (message.content ?? undefined) : undefined;
}

function resolveMessageRowViewModel(
  message: MessageListRowMessage,
  hasMediaGroup: boolean,
  handlers: Pick<Props, "onDelete" | "onForward">
): MessageRowViewModel {
  const kind = getMessageBodyKind(message, hasMediaGroup);
  const capabilities = resolveMessageRowCapabilities(message, kind, handlers);

  return {
    kind,
    capabilities,
    copyText: resolveMessageContextCopyText(message, capabilities),
  };
}

function MessageRowContent({
  presentation,
  viewModel,
  activeMediaKey,
  onActiveMediaChange,
  onRetry,
  onReply,
  onDelete,
  onForward,
  onScrollToMessage,
  isHighlighted,
  t,
  selectionMode,
  isSelected,
  onToggleSelect,
  onEnterSelectionMode,
}: MessageRowContentProps) {
  const { message } = presentation;
  const { kind, capabilities, copyText } = viewModel;

  const handleContextAction = useCallback((action: MessageContextMenuAction) => {
    if (action.kind === "reply") {
      onReply?.(message.id);
      return;
    }
    if (action.kind === "forward") {
      onForward?.(message.id);
      return;
    }
    if (action.kind === "select") {
      onEnterSelectionMode?.(message.id);
      return;
    }
    if (action.kind === "delete") {
      onDelete?.(message.id);
    }
  }, [message.id, onDelete, onEnterSelectionMode, onForward, onReply]);

  if (presentation.callEvent) {
    return <CallEventRow presentation={presentation} />;
  }

  if (selectionMode) {
    return (
      <MessageRowFrame
        presentation={presentation}
        selectionMode
        isSelected={isSelected}
        onToggleSelect={() => onToggleSelect?.(message.id)}
      >
        <MessageBubble
          presentation={presentation}
          kind={kind}
          activeMediaKey={activeMediaKey}
          onActiveMediaChange={onActiveMediaChange}
          onScrollToMessage={onScrollToMessage}
          isHighlighted={isHighlighted}
          t={t}
        />
      </MessageRowFrame>
    );
  }

  return (
    <MessageRowFrame presentation={presentation}>
      <MessageContextMenu
        onAction={handleContextAction}
        canCopy={capabilities.canCopy}
        canForward={capabilities.canForward}
        canDelete={capabilities.canDelete}
        canSelect={Boolean(onEnterSelectionMode)}
        copyText={copyText}
      >
        <MessageBubble
          presentation={presentation}
          kind={kind}
          activeMediaKey={activeMediaKey}
          onActiveMediaChange={onActiveMediaChange}
          onRetry={onRetry}
          onScrollToMessage={onScrollToMessage}
          isHighlighted={isHighlighted}
          t={t}
        />
      </MessageContextMenu>
    </MessageRowFrame>
  );
}

export const MessageListRow = memo(function MessageListRow({
  presentation,
  activeMediaKey,
  onActiveMediaChange,
  onRetry,
  onReply,
  onDelete,
  onForward,
  onScrollToMessage,
  isHighlighted,
  enterDelayMs,
  t,
  selectionMode,
  isSelected,
  onToggleSelect,
  onEnterSelectionMode,
}: Props) {
  const { message } = presentation;
  const hasMediaGroup = (presentation.mediaGroupMessages?.length ?? 0) > 1;
  const viewModel = resolveMessageRowViewModel(message, hasMediaGroup, {
    onDelete,
    onForward,
  });
  const entryStyle = {
    "--message-enter-delay": `${Math.min(enterDelayMs, 160)}ms`,
  } as CSSProperties;

  return (
    <div style={entryStyle}>
      <DateSeparator presentation={presentation} />
      <MessageRowContent
        presentation={presentation}
        viewModel={viewModel}
        activeMediaKey={activeMediaKey}
        onActiveMediaChange={onActiveMediaChange}
        onRetry={onRetry}
        onReply={onReply}
        onDelete={onDelete}
        onForward={onForward}
        onScrollToMessage={onScrollToMessage}
        isHighlighted={isHighlighted}
        t={t}
        selectionMode={selectionMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        onEnterSelectionMode={onEnterSelectionMode}
      />
    </div>
  );
}, (prev, next) => {
  return (
    prev.presentation === next.presentation &&
    prev.activeMediaKey === next.activeMediaKey &&
    prev.onActiveMediaChange === next.onActiveMediaChange &&
    prev.onRetry === next.onRetry &&
    prev.onReply === next.onReply &&
    prev.onDelete === next.onDelete &&
    prev.onForward === next.onForward &&
    prev.onScrollToMessage === next.onScrollToMessage &&
    prev.isHighlighted === next.isHighlighted &&
    prev.enterDelayMs === next.enterDelayMs &&
    prev.t === next.t &&
    prev.selectionMode === next.selectionMode &&
    prev.isSelected === next.isSelected &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onEnterSelectionMode === next.onEnterSelectionMode
  );
});
