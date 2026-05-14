import type { ComponentProps } from "react";
import { createPortal } from "react-dom";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import { CallAudioOutputProvider } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { CallControlsDock } from "@/calls/shared/presentation/CallControlsDock";
import { CallPanelShell } from "@/calls/shared/presentation/CallPanelShell";
import { GroupCallControls } from "@/calls/group/presentation/components/GroupCallControls";
import { GroupCallDetailsDrawer } from "@/calls/group/presentation/components/GroupCallDetailsDrawer";
import { GroupCallHeader } from "@/calls/group/presentation/components/GroupCallHeader";
import { GroupCallMediaSection } from "@/calls/group/presentation/components/GroupCallMediaSection";
import { GroupCallRemoteAudioTargets } from "@/calls/group/presentation/components/GroupCallRemoteAudioTargets";

interface GroupCallPanelShellViewProps {
  readonly remoteMedia: GroupCallRemoteMedia[];
  readonly ariaLabel: string;
  readonly backdropClassName?: string;
  readonly panelClassName?: string;
  readonly bodyClassName?: string;
  readonly mainColumnClassName?: string;
  readonly bottomDockClassName?: string;
  readonly headerProps: ComponentProps<typeof GroupCallHeader>;
  readonly mediaSectionProps: ComponentProps<typeof GroupCallMediaSection>;
  readonly detailsDrawerProps: ComponentProps<typeof GroupCallDetailsDrawer>;
  readonly controlsProps: ComponentProps<typeof GroupCallControls>;
}

export function GroupCallPanelShellView({
  remoteMedia,
  ariaLabel,
  backdropClassName,
  panelClassName,
  bodyClassName,
  mainColumnClassName,
  bottomDockClassName,
  headerProps,
  mediaSectionProps,
  detailsDrawerProps,
  controlsProps,
}: GroupCallPanelShellViewProps) {
  const panelContent = (
    <CallAudioOutputProvider>
      <GroupCallRemoteAudioTargets remoteMedia={remoteMedia} />
      <CallPanelShell
        ariaLabel={ariaLabel}
        backdropClassName={backdropClassName}
        panelClassName={panelClassName}
      >
        <GroupCallHeader {...headerProps} />

        <div className={bodyClassName}>
          <div className={mainColumnClassName}>
            <GroupCallMediaSection {...mediaSectionProps} />
          </div>
        </div>

        <GroupCallDetailsDrawer {...detailsDrawerProps} />

        <CallControlsDock className={bottomDockClassName}>
          <GroupCallControls {...controlsProps} />
        </CallControlsDock>
      </CallPanelShell>
    </CallAudioOutputProvider>
  );

  return createPortal(panelContent, document.body);
}
