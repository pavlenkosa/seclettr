/**
 * useDirectCallControllerSessionWiring — session lifecycle composition bundle.
 *
 * Owns:
 *   - page visibility / beforeunload lifecycle effects
 *   - renegotiation peer capability sync on active call change
 *   - security card reset on call transitions
 *   - UI feedback / notice pushes and peer label resolution
 *   - session teardown callbacks (finishCallSession, resetCallState)
 *   - signal verification and call security state application
 *
 * Does not own peer-connection bootstrap, negotiation ordering, signal ingress,
 * or presentation binding.
 */
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useDirectCallPageLifecycle } from "../session/useDirectCallPageLifecycle";
import { useDirectCallSecurityState } from "../session/useDirectCallSecurityState";
import { useDirectCallUiFeedback } from "../session/useDirectCallUiFeedback";
import { useDirectCallSessionLifecycle } from "../useDirectCallSessionLifecycle";

type UseDirectCallControllerSessionWiringOptions = {
  activeRef: Parameters<typeof useDirectCallPageLifecycle>[0]["activeRef"];
  debugCallMedia: Parameters<typeof useDirectCallPageLifecycle>[0]["debugCallMedia"];
  activeCallId: string | null;
  peerSupportsRenegotiationV1?: boolean;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  setIsSecurityCardOpen: Dispatch<SetStateAction<boolean>>;
  uiFeedback: Parameters<typeof useDirectCallUiFeedback>[0];
  sessionLifecycle: Omit<Parameters<typeof useDirectCallSessionLifecycle>[0], "pushNotice">;
  securityState: Parameters<typeof useDirectCallSecurityState>[0];
};

export function useDirectCallControllerSessionWiring({
  activeRef,
  debugCallMedia,
  activeCallId,
  peerSupportsRenegotiationV1,
  supportsPeerRenegotiationV1Ref,
  setIsSecurityCardOpen,
  uiFeedback,
  sessionLifecycle,
  securityState,
}: UseDirectCallControllerSessionWiringOptions) {
  useDirectCallPageLifecycle({
    activeRef,
    debugCallMedia,
  });

  useEffect(() => {
    supportsPeerRenegotiationV1Ref.current = peerSupportsRenegotiationV1 ?? false;
  }, [peerSupportsRenegotiationV1, supportsPeerRenegotiationV1Ref]);

  useEffect(() => {
    setIsSecurityCardOpen(false);
  }, [activeCallId, setIsSecurityCardOpen]);

  const {
    resolvePeerLabel,
    recordCallEvent,
    pushNotice,
  } = useDirectCallUiFeedback(uiFeedback);

  const {
    finishCallSession,
    resetCallState,
    resetCallStateIfCurrent,
    sendAuthoritativeDirectCallReject,
  } = useDirectCallSessionLifecycle({
    ...sessionLifecycle,
    pushNotice,
  });

  const {
    applySignalVerificationResult,
    applyCallSecurityState,
  } = useDirectCallSecurityState(securityState);

  return {
    resolvePeerLabel,
    recordCallEvent,
    pushNotice,
    finishCallSession,
    resetCallState,
    resetCallStateIfCurrent,
    sendAuthoritativeDirectCallReject,
    applySignalVerificationResult,
    applyCallSecurityState,
  };
}
