import { type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n";
import { CallAudioOutputProvider } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
import { CallDurationText } from "@/calls/shared/presentation/CallDurationText";
import { GroupCallDock } from "@/calls/group/presentation/components/GroupCallDock";
import { GroupCallRemoteAudioTargets } from "@/calls/group/presentation/components/GroupCallRemoteAudioTargets";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";

type DockProps = ComponentProps<typeof GroupCallDock>;

interface RoomCallMinimizedDockProps {
  readonly remoteMedia: GroupCallRemoteMedia[];
  readonly callStartMs: number | null;
  readonly leaveLabel: string;
  readonly isDragging: DockProps["isDragging"];
  readonly dockRef: DockProps["dockRef"];
  readonly inlineStyle: DockProps["inlineStyle"];
  readonly onRestore: DockProps["onRestore"];
  readonly onLeave: DockProps["onLeave"];
  readonly onDragStart: DockProps["onDragStart"];
  readonly onDragMove: DockProps["onDragMove"];
  readonly onDragEnd: DockProps["onDragEnd"];
}

/**
 * Room-local presentation: the minimized floating dock, portalled to the body.
 * Dock/drag runtime stays in `RoomCallPanel`; this only wires already-shaped
 * props into the shared group-call dock.
 */
export function RoomCallMinimizedDock({
  remoteMedia,
  callStartMs,
  leaveLabel,
  isDragging,
  dockRef,
  inlineStyle,
  onRestore,
  onLeave,
  onDragStart,
  onDragMove,
  onDragEnd,
}: RoomCallMinimizedDockProps) {
  const { t } = useI18n();
  return createPortal(
    <CallAudioOutputProvider>
      <GroupCallRemoteAudioTargets remoteMedia={remoteMedia} />
      <GroupCallDock
        groupName={t("room.call.title")}
        groupInitials={t("room.call.initials")}
        isDragging={isDragging}
        dockRef={dockRef}
        inlineStyle={inlineStyle}
        dockMetaLabel={<CallDurationText baseSeconds={0} startedAtMs={callStartMs} />}
        leaveActionLabel={leaveLabel}
        onRestore={onRestore}
        onLeave={onLeave}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />
    </CallAudioOutputProvider>,
    document.body
  );
}
