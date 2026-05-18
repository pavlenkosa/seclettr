import type { ComponentProps } from "react";
import { GroupCallDock } from "@/calls/group/presentation/components/GroupCallDock";
import { GroupCallHeader } from "@/calls/group/presentation/components/GroupCallHeader";
import type { GroupCallPanelViewPropsBuildParams } from "@/calls/group/presentation/group-call-panel-view-props-contract";

interface GroupCallPanelChromeViewProps {
  readonly dockProps: ComponentProps<typeof GroupCallDock>;
  readonly headerProps: ComponentProps<typeof GroupCallHeader>;
}

export function buildGroupCallPanelChromeViewProps({
  session,
  isDraggingMinimizedDock,
  minimizedDockRef,
  resolvedDockInlineStyle,
  dockMetaLabel,
  detailsLabel,
  isDetailsOpen,
  presentation,
  runtime,
  handlers,
}: GroupCallPanelViewPropsBuildParams): GroupCallPanelChromeViewProps {
  return {
    dockProps: {
      groupName: session.groupName,
      groupInitials: presentation.groupInitials,
      isDragging: isDraggingMinimizedDock,
      dockRef: minimizedDockRef,
      inlineStyle: resolvedDockInlineStyle,
      dockMetaLabel,
      leaveActionLabel: presentation.leaveActionLabel,
      onRestore: handlers.handleRestore,
      onLeave: runtime.handleLeave,
      onDragStart: handlers.startMinimizedDockDrag,
      onDragMove: handlers.moveMinimizedDock,
      onDragEnd: handlers.stopMinimizedDockDrag,
    },
    headerProps: {
      groupName: session.groupName,
      memberCount: session.members.length,
      title: presentation.title,
      callDurationSeconds: runtime.callDurationSeconds,
      callDurationStartedAtMs: runtime.callDurationStartedAtMs,
      hasVisibleVideo: presentation.hasVisibleVideo,
      hasRemoteScreenShare: presentation.hasRemoteScreenShare,
      heroStatusLabel: presentation.heroStatusLabel,
      heroStatusTone: presentation.heroStatusTone,
      detailsLabel,
      detailsToggleLabel: presentation.detailsToggleLabel,
      isDetailsOpen,
      onToggleDetails: handlers.handleToggleDetails,
      onMinimize: handlers.handleMinimize,
    },
  };
}
