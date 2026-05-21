/**
 * useGroupCallPanelUiState — panel-level UI state management for the group call panel.
 *
 * Owns:
 *   - isMinimized / isDetailsOpen / isStageViewerOpen state
 *   - pinnedStageTileId — the currently pinned tile in the stage view
 *   - suppressedStageTileIds — tiles hidden from stage selection by the user
 *   - handleToggleDetails / handleMinimize / handleRestore — panel navigation actions
 *   - handleResetStageFocus — clears pinned tile and suppressed set
 *   - handleStopWatchingStageTile — adds a tile to the suppressed set
 *   - handleSelectTile — pins a tile as the stage focus
 *   - Auto-reset of all state when the session group changes (sessionGroupId dep)
 *
 * Does not own the dock drag behaviour (useGroupCallPanelDock) or any presentation
 * derivation (useGroupCallPanelPresentation).
 */
import { useCallback, useEffect, useState } from "react";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";

interface UseGroupCallPanelUiStateOptions {
  sessionGroupId: string | null;
}

interface UseGroupCallPanelUiStateResult {
  isMinimized: boolean;
  setIsMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isDetailsOpen: boolean;
  setIsDetailsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isStageViewerOpen: boolean;
  setIsStageViewerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pinnedStageTileId: string | null;
  setPinnedStageTileId: React.Dispatch<React.SetStateAction<string | null>>;
  suppressedStageTileIds: ReadonlySet<string>;
  setSuppressedStageTileIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleToggleDetails: () => void;
  handleMinimize: () => void;
  handleRestore: () => void;
  handleResetStageFocus: () => void;
  handleStopWatchingStageTile: (tileId: string) => void;
  handleSelectTile: (tileId: string) => void;
}

export function useGroupCallPanelUiState({
  sessionGroupId,
}: UseGroupCallPanelUiStateOptions): UseGroupCallPanelUiStateResult {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isStageViewerOpen, setIsStageViewerOpen] = useState(false);
  const [pinnedStageTileId, setPinnedStageTileId] = useState<string | null>(null);
  const [suppressedStageTileIds, setSuppressedStageTileIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setIsMinimized(false);
    setIsDetailsOpen(false);
    setIsStageViewerOpen(false);
    setPinnedStageTileId(null);
    setSuppressedStageTileIds(new Set());
  }, [sessionGroupId]);

  const handleToggleDetails = useCallback(() => {
    setIsDetailsOpen((current) => !current);
  }, []);

  const handleMinimize = useCallback(() => {
    setIsDetailsOpen(false);
    setIsMinimized(true);
  }, []);

  const handleRestore = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const handleResetStageFocus = useCallback(() => {
    setPinnedStageTileId(null);
  }, []);

  const handleStopWatchingStageTile = useCallback((tileId: string) => {
    setSuppressedStageTileIds((current) => {
      if (current.has(tileId)) {
        return current;
      }
      const next = new Set(current);
      next.add(tileId);
      return next;
    });
    setPinnedStageTileId(null);
  }, []);

  const handleSelectTile = useCallback((tileId: string) => {
    setSuppressedStageTileIds((current) => {
      if (!current.has(tileId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(tileId);
      return next;
    });
    setPinnedStageTileId(tileId);
  }, []);

  return {
    isMinimized,
    setIsMinimized,
    isDetailsOpen,
    setIsDetailsOpen,
    isStageViewerOpen,
    setIsStageViewerOpen,
    pinnedStageTileId,
    setPinnedStageTileId,
    suppressedStageTileIds,
    setSuppressedStageTileIds,
    handleToggleDetails,
    handleMinimize,
    handleRestore,
    handleResetStageFocus,
    handleStopWatchingStageTile,
    handleSelectTile,
  };
}

interface UseGroupCallPanelUiStateSyncOptions {
  runtimeError: string | null;
  callTiles: GroupCallStageTile[];
  isCompactStagePreview: boolean;
  setSuppressedStageTileIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIsDetailsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStageViewerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useGroupCallPanelUiStateSync({
  runtimeError,
  callTiles,
  isCompactStagePreview,
  setSuppressedStageTileIds,
  setIsDetailsOpen,
  setIsStageViewerOpen,
}: UseGroupCallPanelUiStateSyncOptions): void {
  useEffect(() => {
    if (runtimeError) {
      setIsDetailsOpen(true);
    }
  }, [runtimeError, setIsDetailsOpen]);

  useEffect(() => {
    setSuppressedStageTileIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const visibleTileIds = new Set(callTiles.map((tile) => tile.id));
      let changed = false;
      const next = new Set<string>();
      for (const tileId of current) {
        if (visibleTileIds.has(tileId)) {
          next.add(tileId);
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [callTiles, setSuppressedStageTileIds]);

  useEffect(() => {
    if (!isCompactStagePreview) {
      setIsStageViewerOpen(false);
    }
  }, [isCompactStagePreview, setIsStageViewerOpen]);
}
