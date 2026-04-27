import {
  useGroupCallDevDebug,
  type UseGroupCallDevDebugOptions,
} from "@/calls/group/runtime/useGroupCallDevDebug";

export function GroupCallDevDebugBridge(props: UseGroupCallDevDebugOptions) {
  useGroupCallDevDebug(props);
  return null;
}
