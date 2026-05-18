import styles from "./SecurityModal.module.css";

export function SecurityHeaderIcon() {
  return (
    <span className={styles.headerIcon} aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M9 1.5L15 4.5V9C15 12.75 9 16.5 9 16.5C9 16.5 3 12.75 3 9V4.5L9 1.5Z"
          fill="currentColor"
          opacity="0.2"
        />
        <path
          d="M9 1.5L15 4.5V9C15 12.75 9 16.5 9 16.5C9 16.5 3 12.75 3 9V4.5L9 1.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M6.75 9L8.25 10.5L11.25 7.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
