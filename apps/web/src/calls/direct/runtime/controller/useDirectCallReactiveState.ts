import { useCallback, useReducer, useRef, type SetStateAction } from "react";
import type { ActiveCall, CallNotice, IncomingCall } from "@/calls/direct/model/direct-call-types";
import { applySetStateAction } from "./set-state-action";

type State = {
  incoming: IncomingCall | null;
  active: ActiveCall | null;
  notice: CallNotice | null;
  isMinimized: boolean;
  isSecurityCardOpen: boolean;
};

type Action =
  | { type: "SET_INCOMING"; value: IncomingCall | null }
  | { type: "SET_ACTIVE"; value: ActiveCall | null }
  | { type: "SET_NOTICE"; value: CallNotice | null }
  | { type: "SET_IS_MINIMIZED"; value: boolean }
  | { type: "SET_IS_SECURITY_CARD_OPEN"; value: boolean };

const initialState: State = {
  incoming: null,
  active: null,
  notice: null,
  isMinimized: false,
  isSecurityCardOpen: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_INCOMING":
      return { ...state, incoming: action.value };
    case "SET_ACTIVE":
      return { ...state, active: action.value };
    case "SET_NOTICE":
      return { ...state, notice: action.value };
    case "SET_IS_MINIMIZED":
      return { ...state, isMinimized: action.value };
    case "SET_IS_SECURITY_CARD_OPEN":
      return { ...state, isSecurityCardOpen: action.value };
  }
}

export function useDirectCallReactiveState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Keep a ref so memoized setters can read the latest state without
  // being re-created on every render (which would break useEffect deps).
  const stateRef = useRef(state);
  stateRef.current = state;

  const setIncoming = useCallback(
    (value: IncomingCall | null) => dispatch({ type: "SET_INCOMING", value }),
    [],
  );

  const setActive = useCallback(
    (value: ActiveCall | null) => dispatch({ type: "SET_ACTIVE", value }),
    [],
  );

  const setNotice = useCallback((action: SetStateAction<CallNotice | null>) => {
    const value = applySetStateAction(stateRef.current.notice, action);
    dispatch({ type: "SET_NOTICE", value });
  }, []);

  const setIsMinimized = useCallback((action: SetStateAction<boolean>) => {
    const value = applySetStateAction(stateRef.current.isMinimized, action);
    dispatch({ type: "SET_IS_MINIMIZED", value });
  }, []);

  const setIsSecurityCardOpen = useCallback((action: SetStateAction<boolean>) => {
    const value = applySetStateAction(stateRef.current.isSecurityCardOpen, action);
    dispatch({ type: "SET_IS_SECURITY_CARD_OPEN", value });
  }, []);

  return {
    state,
    setIncoming,
    setActive,
    setNotice,
    setIsMinimized,
    setIsSecurityCardOpen,
  };
}
