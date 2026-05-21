import styles from "./SavedMessagesAvatar.module.css";

interface SavedMessagesAvatarProps {
  readonly size?: number;
}

export function SavedMessagesAvatar({ size = 50 }: SavedMessagesAvatarProps) {
  const iconSize = Math.round(size * 0.46);
  return (
    <span
      className={styles.root}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path
          d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5Z"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
