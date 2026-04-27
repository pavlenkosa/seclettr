import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { shouldHydrateUserLabel } from "@/lib/user-labels";
import { useMessagesStore } from "@/stores/messages";
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
    useMessagesStore.getState().recordCallEvent({
      userId: params.userId,
      username: resolvePeerLabel(params.userId, params.fallbackLabel),
      mode: params.mode,
      direction: params.direction,
      outcome: params.outcome,
      durationSec: params.durationSec,
    });
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
