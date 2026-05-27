import { createPortal } from "react-dom";
import type { ComponentProps } from "react";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime";
import { CallAudioOutputProvider } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { GroupCallDock } from "@/calls/group/presentation/components/GroupCallDock";
import { GroupCallRemoteAudioTargets } from "@/calls/group/presentation/components/GroupCallRemoteAudioTargets";

interface GroupCallPanelDockBranchProps {
  readonly remoteMedia: GroupCallRemoteMedia[];
  readonly dockProps: ComponentProps<typeof GroupCallDock>;
}

export function GroupCallPanelDockBranch({
  remoteMedia,
  dockProps,
}: GroupCallPanelDockBranchProps) {
  const dockContent = (
    <CallAudioOutputProvider>
      <GroupCallRemoteAudioTargets remoteMedia={remoteMedia} />
      <GroupCallDock {...dockProps} />
    </CallAudioOutputProvider>
  );

  return createPortal(dockContent, document.body);
}
