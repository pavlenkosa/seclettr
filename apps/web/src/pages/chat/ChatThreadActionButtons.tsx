/**
 * ChatThreadActionButtons — compact action cluster rendered in the chat thread header.
 *
 * Owns:
 *   - Primary call button(s) shown inline (voice + video for direct; voice for group).
 *   - Overflow ⋯ menu with security, search, media, and members entries.
 *   - Per-thread-kind branching (direct / plain-direct / group / plain-group).
 *
 * Does not own call session lifecycle, search/media panel state, or security sheet rendering.
 */
import { useI18n } from "@/i18n";
import { IconButton } from "@/components/ui";
import { IconSearch } from "@/components/ui";
import { PhoneIcon, CameraIcon } from "@/calls/shared/presentation/CallIcons";
import { ThreadActionsDropdown, type ThreadActionsItem } from "./ThreadActionsDropdown";
import styles from "./ChatThreadActions.module.css";

type ChatThreadKind = "direct" | "group" | "plain-direct" | "plain-group" | "saved" | null;

/**
 * Props for the thread-level action button cluster displayed in chat chrome.
 */
export interface ChatThreadActionButtonsProps {
  readonly activeThreadKind: ChatThreadKind;
  readonly groupCallDisabled: boolean;
  readonly isSearchOpen: boolean;
  readonly isMediaPanelOpen: boolean;
  readonly onOpenSecurity: () => void;
  readonly onStartDirectCall: (type: "audio" | "video") => void;
  readonly onStartGroupCall: () => void;
  readonly onOpenGroupMembers: () => void;
  readonly onToggleSearch: () => void;
  readonly onToggleMediaPanel: () => void;
}

// ── Shared SVG icons ──────────────────────────────────────────────────────────

const ShieldIcon = (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <path
      d="M9 1.5L15 4.5V9C15 12.75 9 16.5 9 16.5C9 16.5 3 12.75 3 9V4.5L9 1.5Z"
      stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
    />
    <path
      d="M6.75 9L8.25 10.5L11.25 7.5"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const SearchIconNode = <IconSearch size={15} />;

const MediaIcon = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="4" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="5.5" cy="7" r="1" fill="currentColor" />
    <path d="M1.5 11l3.5-3 2.5 2 3-3.5L14.5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MembersIcon = (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <circle cx="6" cy="6.5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12.2" cy="7.2" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2.6 14.1c.6-1.8 1.9-2.9 3.8-2.9s3.2 1.1 3.8 2.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// Reusable JSX nodes for call buttons — shared across direct/plain-direct/group branches.
const VoiceCallIconNode = <PhoneIcon />;
const VideoCallIconNode = <CameraIcon />;

export function ChatThreadActionButtons({
  activeThreadKind,
  groupCallDisabled,
  isSearchOpen,
  isMediaPanelOpen,
  onOpenSecurity,
  onStartDirectCall,
  onStartGroupCall,
  onOpenGroupMembers,
  onToggleSearch,
  onToggleMediaPanel,
}: ChatThreadActionButtonsProps) {
  const { t } = useI18n();

  const sharedOverflowItems: ThreadActionsItem[] = [
    {
      id: "search",
      labelKey: "chat.search.toggle",
      icon: SearchIconNode,
      onClick: onToggleSearch,
      isActive: isSearchOpen,
    },
    {
      id: "media",
      labelKey: "chat.media.toggle",
      icon: MediaIcon,
      onClick: onToggleMediaPanel,
      isActive: isMediaPanelOpen,
    },
  ];

  if (activeThreadKind === "plain-direct") {
    return (
      <div className={styles.group}>
        <IconButton
          onClick={() => onStartDirectCall("audio")}
          className={styles.iconBtn}
          size={40}
          title={t("chat.voiceCall")}
          aria-label={t("chat.voiceCall")}
        >
          {VoiceCallIconNode}
        </IconButton>
        <IconButton
          onClick={() => onStartDirectCall("video")}
          className={styles.iconBtn}
          size={40}
          title={t("chat.videoCall")}
          aria-label={t("chat.videoCall")}
        >
          {VideoCallIconNode}
        </IconButton>
        <ThreadActionsDropdown items={sharedOverflowItems} disabled={isMediaPanelOpen} />
      </div>
    );
  }

  if (activeThreadKind === "plain-group") {
    const overflowItems: ThreadActionsItem[] = [
      {
        id: "members",
        labelKey: "group.members.open",
        icon: MembersIcon,
        onClick: onOpenGroupMembers,
      },
      ...sharedOverflowItems,
    ];
    return (
      <div className={styles.group}>
        <ThreadActionsDropdown items={overflowItems} disabled={isMediaPanelOpen} />
      </div>
    );
  }

  if (activeThreadKind === "direct") {
    const overflowItems: ThreadActionsItem[] = [
      {
        id: "security",
        labelKey: "chat.verifySecurity",
        icon: ShieldIcon,
        onClick: onOpenSecurity,
      },
      ...sharedOverflowItems,
    ];

    return (
      <div className={styles.group}>
        <IconButton
          onClick={() => onStartDirectCall("audio")}
          className={styles.iconBtn}
          size={40}
          title={t("chat.voiceCall")}
          aria-label={t("chat.voiceCall")}
        >
          {VoiceCallIconNode}
        </IconButton>

        <IconButton
          onClick={() => onStartDirectCall("video")}
          className={styles.iconBtn}
          size={40}
          title={t("chat.videoCall")}
          aria-label={t("chat.videoCall")}
        >
          {VideoCallIconNode}
        </IconButton>

        <ThreadActionsDropdown items={overflowItems} disabled={isMediaPanelOpen} />
      </div>
    );
  }

  if (activeThreadKind === "group") {
    const overflowItems: ThreadActionsItem[] = [
      {
        id: "members",
        labelKey: "group.members.open",
        icon: MembersIcon,
        onClick: onOpenGroupMembers,
      },
      ...sharedOverflowItems,
    ];

    return (
      <div className={styles.group}>
        <IconButton
          onClick={onStartGroupCall}
          className={styles.iconBtn}
          size={40}
          title={t("group.call.launch")}
          aria-label={t("group.call.launch")}
          disabled={groupCallDisabled}
        >
          {VoiceCallIconNode}
        </IconButton>

        <ThreadActionsDropdown items={overflowItems} disabled={isMediaPanelOpen} />
      </div>
    );
  }

  return null;
}
