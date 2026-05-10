import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { shouldHydrateUserLabel } from "@/lib/user-labels";
import { useMessagesStore } from "@/stores/messages";
import { usePlainMessagesStore } from "@/stores/plain";
import {
  formatPeerLabel,
} from "@/calls/direct/model/direct-call-ui-utils";
import type {
  CallNotice,
  CallType,
} from "@/calls/direct/model/direct-call-types";

type UseDirectCallUiFeedbackOptions = {
  setNotice: Dispatch<SetStateAction<CallNotice | null>>;
  noticeTimerRef: MutableRefObject<number | null>;
};

type RecordCallEventParams = {
  userId: string;
  fallbackLabel?: string;
  mode: CallType;
  direction: "inbound" | "outbound";
  outcome: "ended" | "declined" | "missed";
  durationSec?: number;
};

export function useDirectCallUiFeedback({
  setNotice,
  noticeTimerRef,
}: UseDirectCallUiFeedbackOptions) {
  const resolvePeerLabel = useCallback((userId: string, fallbackLabel?: string): string => {
    const conversation = useMessagesStore.getState().conversations[userId];
    const knownLabel = conversation?.username?.trim();
    if (knownLabel && !shouldHydrateUserLabel(knownLabel, userId)) {
      return knownLabel;
    }
    if (
      fallbackLabel &&
      fallbackLabel.trim().length > 0 &&
      !shouldHydrateUserLabel(fallbackLabel, userId)
    ) {
      return fallbackLabel.trim();
    }
    return formatPeerLabel(userId);
  }, []);

  const recordCallEvent = useCallback((params: RecordCallEventParams) => {
    const peerLabel = resolvePeerLabel(params.userId, params.fallbackLabel);
    const callData = {
      userId: params.userId,
      username: peerLabel,
      mode: params.mode,
      direction: params.direction,
      outcome: params.outcome,
      durationSec: params.durationSec,
    };
    // Prefer E2EE thread; only use plain if no E2EE conversation exists with this peer.
    const e2eeConversations = useMessagesStore.getState().conversations;
    const plainConversations = usePlainMessagesStore.getState().conversations;
    if (e2eeConversations[params.userId]) {
      useMessagesStore.getState().recordCallEvent(callData);
    } else if (plainConversations[params.userId]) {
      usePlainMessagesStore.getState().recordCallEvent(callData);
    } else {
      useMessagesStore.getState().recordCallEvent(callData);
    }
  }, [resolvePeerLabel]);

  const pushNotice = useCallback((next: CallNotice, timeoutMs = 4500) => {
    setNotice(next);
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = globalThis.window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, timeoutMs);
  }, [noticeTimerRef, setNotice]);

  useEffect(() => {
    const timerRef = noticeTimerRef;
    return () => {
      if (!timerRef.current) {
        return;
      }
      clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [noticeTimerRef]);

  return {
    resolvePeerLabel,
    recordCallEvent,
    pushNotice,
  };
}
