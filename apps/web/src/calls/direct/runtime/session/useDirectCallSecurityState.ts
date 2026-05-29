import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { CallSignalVerificationResult } from "@/calls/direct/runtime/crypto/call-auth-material";
import { computeCallSecurityCodes } from "@/calls/direct/model/call-security";
import {
  applyComputedSecurityCodesToActiveCall,
  applyMissingSecurityCodesToActiveCall,
  applySignalVerificationToActiveCall,
} from "@/calls/direct/model/direct-call-security-state";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";

type Translate = (key: string, params?: Record<string, string | number | undefined>) => string;

type UseDirectCallSecurityStateOptions = {
  activeRef: MutableRefObject<ActiveCall | null>;
  setActive: Dispatch<SetStateAction<ActiveCall | null>>;
  t: Translate;
};

export function useDirectCallSecurityState({
  activeRef,
  setActive,
  t,
}: UseDirectCallSecurityStateOptions) {
  const applySignalVerificationResult = useCallback((
    callId: string,
    result: CallSignalVerificationResult
  ) => {
    const current = activeRef.current;
    const next = current?.callId === callId
      ? applySignalVerificationToActiveCall(current, result, t("call.error.unableVerifyCode"))
      : current;
    activeRef.current = next;
    setActive(next);
  }, [activeRef, setActive, t]);

  const applyCallSecurityState = useCallback(async (callId: string, pc: RTCPeerConnection): Promise<void> => {
    const localSdp = pc.localDescription?.sdp;
    const remoteSdp = pc.remoteDescription?.sdp;
    if (!localSdp || !remoteSdp) return;

    const codes = await computeCallSecurityCodes(localSdp, remoteSdp);
    if (!codes) {
      const current = activeRef.current;
      const next = current?.callId === callId
        ? applyMissingSecurityCodesToActiveCall(current, t("call.error.unableVerifyCode"))
        : current;
      activeRef.current = next;
      setActive(next);
      return;
    }

    const current = activeRef.current;
    const next = current?.callId === callId
      ? applyComputedSecurityCodesToActiveCall(current, codes)
      : current;
    activeRef.current = next;
    setActive(next);
  }, [activeRef, setActive, t]);

  return {
    applySignalVerificationResult,
    applyCallSecurityState,
  };
}
