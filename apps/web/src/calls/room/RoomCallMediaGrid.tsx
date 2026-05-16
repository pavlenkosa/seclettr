import { GroupCallMediaTile } from "@/calls/group/presentation/components/GroupCallMediaTile";

/**
 * One media tile shape consumed by the room-call grid. Built by `RoomCallPanel`
 * from local + remote media; this module only renders it.
 */
export interface RoomCallTile {
  id: string;
  label: string;
  stream: MediaStream | null;
  audioStream: MediaStream | null;
  hasAudio: boolean;
  fallbackInitials: string;
  badge: string | undefined;
  muted: boolean;
  videoSource: "camera" | "screen" | null;
}

interface RoomCallMediaGridProps {
  readonly tiles: RoomCallTile[];
  readonly gridClassName: string;
  readonly tileClassName: string;
}

/**
 * Room-local presentation: the participant media-tile grid.
 * Tile variant follows tile count, matching previous inline behavior.
 */
export function RoomCallMediaGrid({ tiles, gridClassName, tileClassName }: RoomCallMediaGridProps) {
  const variant = tiles.length <= 2 ? "stage" : "strip";
  return (
    <div className={gridClassName}>
      {tiles.map((tile) => (
        <GroupCallMediaTile
          key={tile.id}
          className={tileClassName}
          label={tile.label}
          stream={tile.stream}
          audioStream={tile.audioStream}
          hasAudio={tile.hasAudio}
          fallbackInitials={tile.fallbackInitials}
          badge={tile.badge}
          muted={tile.muted}
          variant={variant}
          videoSource={tile.videoSource}
        />
      ))}
    </div>
  );
}
