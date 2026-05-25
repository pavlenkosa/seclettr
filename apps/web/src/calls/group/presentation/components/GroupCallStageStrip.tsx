import { useI18n } from "@/i18n";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";

import { GroupCallMediaTile } from "./GroupCallMediaTile";
import panelStyles from "@/calls/group/presentation/GroupCallPanel.module.css";
import styles from "./GroupCallStageStrip.module.css";

export interface GroupCallStageStripProps {
  readonly stripTiles: GroupCallStageTile[];
  readonly focusHintLabel: string;
  readonly onSelectTile: (tileId: string) => void;
}

export function GroupCallStageStrip({
  stripTiles,
  focusHintLabel,
  onSelectTile,
}: GroupCallStageStripProps) {
  const { t } = useI18n();

  if (stripTiles.length === 0) {
    return null;
  }

  return (
    <div className={styles.stageStripSection}>
      <div className={styles.stageStripBar}>
        <span className={panelStyles.sectionLabel}>{t("group.call.stage.strip")}</span>
        <span className={panelStyles.mediaToolbarHint}>{focusHintLabel}</span>
      </div>
      <div className={styles.mediaStrip}>
        {stripTiles.map((tile) => (
          <GroupCallMediaTile
            key={tile.id}
            label={tile.label}
            stream={tile.stream}
            audioStream={tile.audioStream}
            activityStream={tile.activityStream}
            hasAudio={tile.hasAudio}
            fallbackInitials={tile.fallbackInitials}
            badge={tile.badge}
            muted={tile.isLocal}
            variant="strip"
            videoSource={tile.videoSource}
            onSelect={() => onSelectTile(tile.id)}
            interactiveLabel={focusHintLabel}
          />
        ))}
      </div>
    </div>
  );
}
