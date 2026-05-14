import { HeaderBar, IconButton } from "@/components/ui";
import styles from "../SettingsScreen.module.css";

interface SettingsScreenHeaderProps {
  readonly title: string;
  readonly isMobileViewport: boolean;
  readonly mobileDetailOpen: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
  readonly backLabel: string;
  readonly closeLabel: string;
}

export function SettingsScreenHeader({
  title,
  isMobileViewport,
  mobileDetailOpen,
  onBack,
  onClose,
  backLabel,
  closeLabel,
}: Readonly<SettingsScreenHeaderProps>) {
  return (
    <header className={styles.header}>
      <HeaderBar
        as="div"
        className={styles.headerBar}
        leading={isMobileViewport ? (
          <IconButton
            size={38}
            variant="ghost"
            className={styles.headerAction}
            onClick={onBack}
            aria-label={mobileDetailOpen ? backLabel : closeLabel}
          >
            <BackIcon />
          </IconButton>
        ) : null}
        center={<h1 className={styles.title}>{title}</h1>}
        trailing={!isMobileViewport ? (
          <IconButton
            size={38}
            variant="ghost"
            className={styles.headerAction}
            onClick={onClose}
            aria-label={closeLabel}
          >
            <CloseIcon />
          </IconButton>
        ) : null}
      />
    </header>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
