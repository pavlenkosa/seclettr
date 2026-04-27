import { useCallback, useRef } from "react";
import { useMessagesStore } from "@/stores/messages";

const TYPING_STOP_DEBOUNCE_MS = 2500;
const TYPING_HEARTBEAT_MS = 2000;

interface UseChatComposerTypingSignalOptions {
  recipientUserId?: string;
  groupId?: string;
}

interface UseChatComposerTypingSignalResult {
  handleTypingState: (nextValue: string) => void;
  stopTyping: () => void;
  cleanupTypingSignal: () => void;
}

export function useChatComposerTypingSignal({
  recipientUserId,
  groupId,
}: UseChatComposerTypingSignalOptions): UseChatComposerTypingSignalResult {
  const sendTypingSignal = useMessagesStore((state) => state.sendTypingSignal);
  const isGroupComposer = typeof groupId === "string" && groupId.length > 0;
  const typingStopTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const lastTypingStartSentAtRef = useRef(0);

  const clearTypingTimer = useCallback(() => {
    if (typingStopTimerRef.current !== null) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  }, []);

  const stopTyping = useCallback(() => {
    clearTypingTimer();
    if (isGroupComposer || !recipientUserId || !typingActiveRef.current) return;
    sendTypingSignal(recipientUserId, false);
    typingActiveRef.current = false;
    lastTypingStartSentAtRef.current = 0;
  }, [clearTypingTimer, isGroupComposer, recipientUserId, sendTypingSignal]);

  const scheduleTypingStop = useCallback(() => {
    clearTypingTimer();
    typingStopTimerRef.current = globalThis.setTimeout(() => {
      stopTyping();
    }, TYPING_STOP_DEBOUNCE_MS) as unknown as number;
  }, [clearTypingTimer, stopTyping]);

  const handleTypingState = useCallback(
    (nextValue: string) => {
      if (isGroupComposer || !recipientUserId) return;
      if (nextValue.length === 0) {
        stopTyping();
        return;
      }
      const now = Date.now();
      if (
        !typingActiveRef.current ||
        now - lastTypingStartSentAtRef.current >= TYPING_HEARTBEAT_MS
      ) {
        sendTypingSignal(recipientUserId, true);
        typingActiveRef.current = true;
        lastTypingStartSentAtRef.current = now;
      }
      scheduleTypingStop();
    },
    [isGroupComposer, recipientUserId, scheduleTypingStop, sendTypingSignal, stopTyping]
  );

  const cleanupTypingSignal = useCallback(() => {
    clearTypingTimer();
    if (!isGroupComposer && recipientUserId && typingActiveRef.current) {
      sendTypingSignal(recipientUserId, false);
      typingActiveRef.current = false;
      lastTypingStartSentAtRef.current = 0;
    }
  }, [clearTypingTimer, isGroupComposer, recipientUserId, sendTypingSignal]);

  return { cleanupTypingSignal, handleTypingState, stopTyping };
}
