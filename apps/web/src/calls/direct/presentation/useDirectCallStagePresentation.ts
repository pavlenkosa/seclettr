import { useCallback, useEffect, useMemo, useState } from "react";
import {
  resolveDirectCallStageLayout,
  type DirectCallStageLayout,
  type DirectCallStageVisualSource,
} from "@/calls/direct/model/direct-call-stage-layout";

interface UseDirectCallStagePresentationOptions {
  hasRenderableRemoteCamera: boolean;
  hasRenderableRemoteScreen: boolean;
}

export interface DirectCallStageSceneState {
  stageLayout: DirectCallStageLayout;
  isScreenViewerOpen: boolean;
  canOpenScreenViewer: boolean;
  canStopWatchingScreen: boolean;
  canRestoreScreenShare: boolean;
  selectSource: (source: DirectCallStageVisualSource) => void;
  openScreenViewer: () => void;
  closeScreenViewer: () => void;
  stopWatchingScreen: () => void;
  restoreScreenShare: () => void;
}

export function useDirectCallStagePresentation({
  hasRenderableRemoteCamera,
  hasRenderableRemoteScreen,
}: UseDirectCallStagePresentationOptions): DirectCallStageSceneState {
  const [preferredSource, setPreferredSource] = useState<DirectCallStageVisualSource | null>(null);
  const [isScreenViewerOpen, setIsScreenViewerOpen] = useState(false);
  const [isRemoteScreenSuppressed, setIsRemoteScreenSuppressed] = useState(false);

  const stageLayout = useMemo(() => resolveDirectCallStageLayout({
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
    preferredSource,
    isRemoteScreenSuppressed,
  }), [
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
    isRemoteScreenSuppressed,
    preferredSource,
  ]);

  useEffect(() => {
    if (!hasRenderableRemoteScreen) {
      setIsRemoteScreenSuppressed(false);
      setIsScreenViewerOpen(false);
    }
  }, [hasRenderableRemoteScreen]);

  useEffect(() => {
    if (preferredSource === "camera" && !hasRenderableRemoteCamera) {
      setPreferredSource(null);
      return;
    }

    if (
      preferredSource === "screen" &&
      (!hasRenderableRemoteScreen || isRemoteScreenSuppressed)
    ) {
      setPreferredSource(null);
    }
  }, [
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
    isRemoteScreenSuppressed,
    preferredSource,
  ]);

  useEffect(() => {
    if (stageLayout.stageSource !== "screen" && isScreenViewerOpen) {
      setIsScreenViewerOpen(false);
    }
  }, [isScreenViewerOpen, stageLayout.stageSource]);

  const selectSource = useCallback((source: DirectCallStageVisualSource) => {
    if (source === "screen") {
      setIsRemoteScreenSuppressed(false);
    }
    setPreferredSource(source);
  }, []);

  const closeScreenViewer = useCallback(() => {
    setIsScreenViewerOpen(false);
  }, []);

  const openScreenViewer = useCallback(() => {
    if (!hasRenderableRemoteScreen || isRemoteScreenSuppressed || stageLayout.stageSource !== "screen") {
      return;
    }
    setIsScreenViewerOpen(true);
  }, [hasRenderableRemoteScreen, isRemoteScreenSuppressed, stageLayout.stageSource]);

  const stopWatchingScreen = useCallback(() => {
    setIsScreenViewerOpen(false);
    setIsRemoteScreenSuppressed(true);
    setPreferredSource((current) => current === "screen" ? null : current);
  }, []);

  const restoreScreenShare = useCallback(() => {
    if (!hasRenderableRemoteScreen) {
      return;
    }
    setIsRemoteScreenSuppressed(false);
    setPreferredSource("screen");
  }, [hasRenderableRemoteScreen]);

  const canOpenScreenViewer = stageLayout.stageSource === "screen" && hasRenderableRemoteScreen;
  const canStopWatchingScreen = stageLayout.stageSource === "screen" && hasRenderableRemoteScreen;
  const canRestoreScreenShare = isRemoteScreenSuppressed && hasRenderableRemoteScreen;

  return {
    stageLayout,
    isScreenViewerOpen,
    canOpenScreenViewer,
    canStopWatchingScreen,
    canRestoreScreenShare,
    selectSource,
    openScreenViewer,
    closeScreenViewer,
    stopWatchingScreen,
    restoreScreenShare,
  };
}
