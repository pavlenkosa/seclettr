/**
 * message-list-presentation — row-level timeline projection for chat messages.
 *
 * Owns:
 *   - MessageListRowPresentation / MessageRowPresentationCache projection shapes
 *   - Date/timestamp grouping for rendered rows
 *   - Inline media album grouping into one rendered row
 *   - Call-event and text-preview row projection
 *   - Incremental cache rebuild for append/update-friendly timeline rendering
 *
 * Does not own virtualization, scroll behavior, row rendering, or message-store
 * state changes.
 */
import type { Message } from "@/stores/messages";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export interface MessageCallEventPresentation {
  title: string;
  meta: string;
}

export interface MessageListRowPresentation {
  rowId: string;
  message: Message;
  messageIds: string[];
  senderLabel?: string;
  showTimestamp: boolean;
  showDateSeparator: boolean;
  dateSeparatorLabel: string;
  timeLabel: string;
  callEvent: MessageCallEventPresentation | null;
  textPreview: string | null;
  /** Set when this row represents a media album (2+ inline-media from one batch). */
  mediaGroupMessages?: Message[];
}

interface MessageRowBounds {
  startIndex: number;
  endIndex: number;
}

interface MessageRowBuildState {
  rows: MessageListRowPresentation[];
  rowBounds: MessageRowBounds[];
  rowIndexByMessageId: Map<string, number>;
  rowIdByMessageId: Map<string, string>;
}

interface IncrementalReuseBaseState {
  rows: MessageListRowPresentation[];
  rowBounds: MessageRowBounds[];
  rowIndexByMessageId: Map<string, number>;
  rowIdByMessageId: Map<string, string>;
  rebuildStartIndex: number;
}

type BaseMessagePresentation = Pick<
  MessageListRowPresentation,
  | "senderLabel"
  | "showTimestamp"
  | "showDateSeparator"
  | "dateSeparatorLabel"
  | "timeLabel"
  | "callEvent"
  | "textPreview"
>;

export interface MessageRowPresentationState {
  rows: MessageListRowPresentation[];
  rowIndexByMessageId: Map<string, number>;
  rowIdByMessageId: Map<string, string>;
}

export interface MessageRowPresentationCache extends MessageRowPresentationState {
  sourceMessages: Message[];
  locale: string;
  senderLabels?: Record<string, string>;
  rowBounds: MessageRowBounds[];
}

function isInlineMediaForGrouping(msg: Message): boolean {
  if (msg.type !== "attachment" || !msg.attachment) return false;
  const { kind, mimeType } = msg.attachment;
  if (kind === "voice_note" || kind === "video_note") return false;
  if (mimeType.startsWith("audio/")) return false;
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

function areSenderLabelsCompatible(
  previousSenderLabels?: Record<string, string>,
  nextSenderLabels?: Record<string, string>
): boolean {
  if (previousSenderLabels === nextSenderLabels) {
    return true;
  }

  if (!previousSenderLabels || !nextSenderLabels) {
    return !previousSenderLabels && !nextSenderLabels;
  }

  return Object.keys(previousSenderLabels).every(
    (key) => previousSenderLabels[key] === nextSenderLabels[key]
  );
}

export function formatTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function formatClock(seconds: number): string {
  const bounded = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mm = Math.floor(bounded / 60).toString().padStart(2, "0");
  const ss = (bounded % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function isSameCalendarDay(a: number, b: number): boolean {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

function getDateSeparatorLabel(
  ms: number,
  locale: string,
  t: TranslateFn
): string {
  const now = Date.now();
  if (isSameCalendarDay(ms, now)) return t("message.dateSeparator.today");
  if (isSameCalendarDay(ms, now - 86_400_000)) return t("message.dateSeparator.yesterday");
  return new Date(ms).toLocaleDateString(locale, { month: "long", day: "numeric" });
}

export function describeCallEvent(
  call: NonNullable<Message["call"]>,
  t: TranslateFn
): MessageCallEventPresentation {
  const directionLabel = call.direction === "outbound"
    ? t("call.log.outbound")
    : t("call.log.inbound");
  const modeLabel = call.mode === "video"
    ? t("call.videoCall")
    : t("call.voiceCall");
  const outcomeLabel = t(`call.log.${call.outcome}`);
  const durationLabel = call.outcome === "ended" && call.durationSec && call.durationSec > 0
    ? formatClock(call.durationSec)
    : "";

  return {
    title: `${directionLabel} ${modeLabel}`,
    meta: durationLabel ? `${outcomeLabel} • ${durationLabel}` : outcomeLabel,
  };
}

export function resolveMessageTextPreview(
  message: Message,
  t: TranslateFn
): string | null {
  if (message.type !== "text" && message.type !== "attachment") {
    return null;
  }

  if (message.type === "attachment" && message.attachment) {
    if (message.content === "[attachment]") return t("conversation.attachmentPreview");
    if (message.content === "[video note]") return t("conversation.videoNotePreview");
    if (message.content === "[invalid attachment]") return t("conversation.invalidAttachmentPreview");
  }

  if (message.content === "[encrypted message]") {
    return t("conversation.encryptedMessagePreview");
  }

  return message.content;
}

function createBaseMessagePresentation(params: {
  message: Message;
  previousMessage: Message | null;
  senderLabels?: Record<string, string>;
  locale: string;
  t: TranslateFn;
}): BaseMessagePresentation {
  const { message, previousMessage, senderLabels, locale, t } = params;
  const showTimestamp = !previousMessage || message.timestamp - previousMessage.timestamp > 300_000;
  const showDateSeparator = !previousMessage
    || !isSameCalendarDay(previousMessage.timestamp, message.timestamp);

  return {
    senderLabel: message.isOwn ? undefined : senderLabels?.[message.id],
    showTimestamp,
    showDateSeparator,
    dateSeparatorLabel: showDateSeparator
      ? getDateSeparatorLabel(message.timestamp, locale, t)
      : "",
    timeLabel: formatTime(message.timestamp, locale),
    callEvent: message.type === "call" && message.call
      ? describeCallEvent(message.call, t)
      : null,
    textPreview: resolveMessageTextPreview(message, t),
  };
}

function collectInlineMediaGroup(params: {
  messages: Message[];
  startIndex: number;
  groupId: string;
  firstMessage: Message;
}): { groupMessages: Message[]; nextIndex: number } {
  const { messages, startIndex, groupId, firstMessage } = params;
  const groupMessages: Message[] = [firstMessage];
  let nextIndex = startIndex + 1;

  while (nextIndex < messages.length) {
    const next = messages[nextIndex]!;
    const belongsToGroup = next.attachment?.mediaGroupId === groupId
      && next.senderId === firstMessage.senderId
      && isInlineMediaForGrouping(next);

    if (!belongsToGroup) {
      break;
    }

    groupMessages.push(next);
    nextIndex += 1;
  }

  return { groupMessages, nextIndex };
}

function createMessageRow(params: {
  message: Message;
  messageIds?: string[];
  basePresentation: BaseMessagePresentation;
  mediaGroupMessages?: Message[];
}): MessageListRowPresentation {
  const { message, messageIds = [message.id], basePresentation, mediaGroupMessages } = params;

  return {
    ...basePresentation,
    rowId: `row:${message.id}`,
    message,
    messageIds,
    mediaGroupMessages,
  };
}

function tryCreateMediaGroupRow(params: {
  messages: Message[];
  startIndex: number;
  message: Message;
  basePresentation: BaseMessagePresentation;
}): { row: MessageListRowPresentation; nextIndex: number } | null {
  const { messages, startIndex, message, basePresentation } = params;
  const groupId = message.attachment?.mediaGroupId;

  if (!groupId || !isInlineMediaForGrouping(message)) {
    return null;
  }

  const { groupMessages, nextIndex } = collectInlineMediaGroup({
    messages,
    startIndex,
    groupId,
    firstMessage: message,
  });

  if (groupMessages.length <= 1) {
    return null;
  }

  return {
    row: createMessageRow({
      message,
      messageIds: groupMessages.map((entry) => entry.id),
      basePresentation,
      mediaGroupMessages: groupMessages,
    }),
    nextIndex,
  };
}

function appendRowToState(
  state: MessageRowBuildState,
  row: MessageListRowPresentation,
  bounds: MessageRowBounds
): void {
  const rowIndex = state.rows.length;
  state.rows.push(row);
  state.rowBounds.push(bounds);
  row.messageIds.forEach((messageId) => {
    state.rowIndexByMessageId.set(messageId, rowIndex);
    state.rowIdByMessageId.set(messageId, row.rowId);
  });
}

function buildMessageRowPresentationCache(params: {
  messages: Message[];
  senderLabels?: Record<string, string>;
  locale: string;
  t: TranslateFn;
  previousState?: MessageRowPresentationCache | null;
}): MessageRowPresentationCache {
  const { messages, senderLabels, locale, t, previousState } = params;

  if (
    previousState?.locale === locale
    && areSenderLabelsCompatible(previousState?.senderLabels, senderLabels)
  ) {
    const incrementalReuseState = resolveIncrementalReuseBaseState({
      previousState,
      nextMessages: messages,
    });

    if (!incrementalReuseState) {
      return previousState;
    }

    return appendMessageRows({
      baseState: incrementalReuseState,
      messages,
      senderLabels,
      locale,
      t,
      startIndex: incrementalReuseState.rebuildStartIndex,
    });
  }

  return appendMessageRows({
    baseState: {
      rows: [],
      rowBounds: [],
      rowIndexByMessageId: new Map<string, number>(),
      rowIdByMessageId: new Map<string, string>(),
    },
    messages,
    senderLabels,
    locale,
    t,
    startIndex: 0,
  });
}

function resolveIncrementalReuseBaseState(params: {
  previousState: MessageRowPresentationCache;
  nextMessages: Message[];
}): IncrementalReuseBaseState | null {
  const { previousState, nextMessages } = params;
  const previousMessages = previousState.sourceMessages;
  const sharedLength = Math.min(previousMessages.length, nextMessages.length);
  let firstChangedIndex = 0;

  while (
    firstChangedIndex < sharedLength
    && previousMessages[firstChangedIndex] === nextMessages[firstChangedIndex]
  ) {
    firstChangedIndex += 1;
  }

  if (firstChangedIndex === previousMessages.length && firstChangedIndex === nextMessages.length) {
    return null;
  }

  const rebuildAnchorIndex = Math.max(0, firstChangedIndex - 1);
  const rebuildAnchorMessage = previousMessages[rebuildAnchorIndex] ?? null;
  const rebuildAnchorRowIndex = rebuildAnchorMessage
    ? previousState.rowIndexByMessageId.get(rebuildAnchorMessage.id) ?? 0
    : 0;
  const rebuildStartIndex = previousState.rowBounds[rebuildAnchorRowIndex]?.startIndex ?? 0;
  const reusableRowCount = rebuildStartIndex > 0 ? rebuildAnchorRowIndex : 0;
  const rows = previousState.rows.slice(0, reusableRowCount);
  const rowBounds = previousState.rowBounds.slice(0, reusableRowCount);
  const rowIndexByMessageId = new Map<string, number>();
  const rowIdByMessageId = new Map<string, string>();

  rows.forEach((row, rowIndex) => {
    row.messageIds.forEach((messageId) => {
      rowIndexByMessageId.set(messageId, rowIndex);
      rowIdByMessageId.set(messageId, row.rowId);
    });
  });

  return {
    rows,
    rowBounds,
    rowIndexByMessageId,
    rowIdByMessageId,
    rebuildStartIndex,
  };
}

function appendMessageRows(params: {
  baseState: MessageRowBuildState;
  messages: Message[];
  senderLabels?: Record<string, string>;
  locale: string;
  t: TranslateFn;
  startIndex: number;
}): MessageRowPresentationCache {
  const {
    baseState,
    messages,
    senderLabels,
    locale,
    t,
    startIndex,
  } = params;

  const state: MessageRowBuildState = {
    rows: [...baseState.rows],
    rowBounds: [...baseState.rowBounds],
    rowIndexByMessageId: new Map(baseState.rowIndexByMessageId),
    rowIdByMessageId: new Map(baseState.rowIdByMessageId),
  };
  let i = startIndex;

  while (i < messages.length) {
    const message = messages[i]!;
    const previousMessage = i > 0 ? messages[i - 1]! : null;
    const basePresentation = createBaseMessagePresentation({
      message,
      previousMessage,
      senderLabels,
      locale,
      t,
    });
    const mediaGroupRow = tryCreateMediaGroupRow({
      messages,
      startIndex: i,
      message,
      basePresentation,
    });

    if (mediaGroupRow) {
      appendRowToState(state, mediaGroupRow.row, {
        startIndex: i,
        endIndex: mediaGroupRow.nextIndex,
      });
      i = mediaGroupRow.nextIndex;
      continue;
    }

    appendRowToState(state, createMessageRow({
      message,
      basePresentation,
    }), { startIndex: i, endIndex: i + 1 });
    i += 1;
  }

  return {
    ...state,
    sourceMessages: messages,
    locale,
    senderLabels,
  };
}

export function buildMessageRowPresentationState(params: {
  messages: Message[];
  senderLabels?: Record<string, string>;
  locale: string;
  t: TranslateFn;
  previousState?: MessageRowPresentationCache | null;
}): MessageRowPresentationCache {
  return buildMessageRowPresentationCache(params);
}

export function buildMessageRowPresentations(params: {
  messages: Message[];
  senderLabels?: Record<string, string>;
  locale: string;
  t: TranslateFn;
}): MessageListRowPresentation[] {
  return buildMessageRowPresentationCache(params).rows;
}
