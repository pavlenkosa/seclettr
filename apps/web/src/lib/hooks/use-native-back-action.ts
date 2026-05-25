import { useEffect, useRef } from "react";
import { pushBackHandler } from "@/lib/native-back-handler";

/**
 * Registers a temporary Android-native back action while the owning surface is active.
 */
export function useNativeBackAction(action: () => void, enabled = true) {
  const actionRef = useRef(action);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  useEffect(() => {
    if (!enabled) return;
    return pushBackHandler(() => {
      actionRef.current();
    });
  }, [enabled]);
}
