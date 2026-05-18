import styles from "./SecurityModal.module.css";
import type { SecurityTranslate } from "./security-modal-shared";

export function SecurityQuickGuide({ t }: { readonly t: SecurityTranslate }) {
  return (
    <div className={styles.quickGuide}>
      <div className={styles.quickGuideTitle}>{t("security.quickGuide.title")}</div>
      <ol className={styles.quickGuideList}>
        <li>{t("security.quickGuide.step1")}</li>
        <li>{t("security.quickGuide.step2")}</li>
      </ol>
    </div>
  );
}
