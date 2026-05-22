/**
 * SavedMessagesAvatar — themed bookmark avatar used for the Saved Messages thread entry.
 *
 * Owns:
 *   - Rendering a bookmark/ribbon SVG glyph inside a styled circular container.
 *   - Scaling the icon proportionally to the `size` prop.
 *   - Marking the element `aria-hidden` since the parent row provides the accessible label.
 *
 * Does not own saved-messages store access, routing, or list-row layout.
 */
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
