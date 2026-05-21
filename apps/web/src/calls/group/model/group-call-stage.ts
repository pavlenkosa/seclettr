/**
 * group-call-stage — stage tile selection logic for the group call panel.
 *
 * Owns:
 *   - GroupCallStageTileCandidate type
 *   - resolveGroupCallStageTileId — selects the active stage tile from a candidate list,
 *     honouring pinnedTileId and applying a preference order:
 *     remote screen-share → local screen-share → remote camera → local camera → first tile
 *
 * Does not own tile construction or panel layout (see group-call-panel-tiles.ts).
 */
import type { SfuProducerSource } from "@seclettr/protocol";

export interface GroupCallStageTileCandidate {
  id: string;
  isLocal: boolean;
  hasVideo: boolean;
  videoSource: SfuProducerSource | null;
}

export function resolveGroupCallStageTileId(
  tiles: GroupCallStageTileCandidate[],
  pinnedTileId: string | null
): string | null {
  if (tiles.length === 0) {
    return null;
  }

  if (pinnedTileId && tiles.some((tile) => tile.id === pinnedTileId)) {
    return pinnedTileId;
  }

  const preferredOrder = [
    tiles.find((tile) => !tile.isLocal && tile.hasVideo && tile.videoSource === "screen"),
    tiles.find((tile) => tile.isLocal && tile.hasVideo && tile.videoSource === "screen"),
    tiles.find((tile) => !tile.isLocal && tile.hasVideo),
    tiles.find((tile) => tile.isLocal && tile.hasVideo),
    tiles[0],
  ];

  return preferredOrder.find((tile): tile is GroupCallStageTileCandidate => Boolean(tile))?.id ?? null;
}
