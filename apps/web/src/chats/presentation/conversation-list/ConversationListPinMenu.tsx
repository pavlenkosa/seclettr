import type { MouseEvent as ReactMouseEvent } from "react";

import type { ConversationEntry } from "./conversation-list-helpers";
import styles from "../ConversationList.module.css";

interface ConversationListPinMenuProps {
  readonly entry: ConversationEntry;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly onTogglePin: (entry: ConversationEntry) => void;
}

export function ConversationListPinMenu({
  entry,
  t,
  onTogglePin,
}: ConversationListPinMenuProps) {
  const handleTogglePin = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onTogglePin(entry);
  };

  return (
    <div className={styles.contextMenu} role="menu" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={styles.contextMenuItem}
        onClick={handleTogglePin}
        role="menuitem"
      >
        {entry.pinnedAt ? t("conversation.unpin") : t("conversation.pin")}
      </button>
    </div>
  );
}
