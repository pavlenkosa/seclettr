import { lazy, Suspense, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import { CallAudioOutputProvider } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { CallControlsDock } from "@/calls/shared/presentation/CallControlsDock";
import { CallPanelShell } from "@/calls/shared/presentation/CallPanelShell";
import { GroupCallControls } from "@/calls/group/presentation/components/GroupCallControls";
import { GroupCallHeader } from "@/calls/group/presentation/components/GroupCallHeader";
import { GroupCallMediaSection } from "@/calls/group/presentation/components/GroupCallMediaSection";
import { GroupCallRemoteAudioTargets } from "@/calls/group/presentation/components/GroupCallRemoteAudioTargets";
import type { GroupCallDetailsDrawerProps } from "@/calls/group/presentation/components/GroupCallDetailsDrawer";

const GroupCallDetailsDrawer = lazy(() =>
  import("@/calls/group/presentation/components/GroupCallDetailsDrawer").then(({ GroupCallDetailsDrawer }) => ({
    default: GroupCallDetailsDrawer,
  }))
);

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
  readonly detailsDrawerProps: GroupCallDetailsDrawerProps;
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

        {detailsDrawerProps.isOpen || detailsDrawerProps.inline ? (
          <Suspense fallback={null}>
            <GroupCallDetailsDrawer {...detailsDrawerProps} />
          </Suspense>
        ) : null}

        <CallControlsDock className={bottomDockClassName}>
          <GroupCallControls {...controlsProps} />
        </CallControlsDock>
      </CallPanelShell>
    </CallAudioOutputProvider>
  );

  return createPortal(panelContent, document.body);
}
