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
