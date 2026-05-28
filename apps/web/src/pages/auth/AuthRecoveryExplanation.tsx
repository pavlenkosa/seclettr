/**
 * AuthRecoveryExplanation — a single numbered step or contextual note on the recovery page.
 *
 * Owns:
 *   - Two rendering modes:
 *       card (web): `SurfacePanel` rounded card, mirrors the auth page card family.
 *       flat (native Capacitor): plain section div — default tone uses a hairline
 *         bottom divider; accent tone keeps a tinted pill for visual distinctiveness.
 *   - `tone` prop: "default" (neutral section) | "accent" (recovery-reason highlight).
 *   - `flat` prop: drives native vs web rendering; set by AuthRecoveryPage via isNativePlatform().
 *
 * Does not own step numbering, recovery state, or navigation.
 */
import { SurfacePanel } from "@/components/ui";
import styles from "../AuthRecoveryPage.module.css";

interface AuthRecoveryExplanationProps {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly tone?: "default" | "accent";
  readonly flat?: boolean;
}

export function AuthRecoveryExplanation({
  id,
  title,
  body,
  tone = "default",
  flat = false,
}: Readonly<AuthRecoveryExplanationProps>) {
  if (flat) {
    return (
      <section
        className={tone === "accent" ? styles.sectionFlatAccent : styles.sectionFlat}
        aria-labelledby={id}
      >
        <h2 id={id} className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionText}>{body}</p>
      </section>
    );
  }

  return (
    <SurfacePanel
      as="section"
      className={styles.section}
      tone={tone}
      padding="md"
      radius="lg"
      aria-labelledby={id}
    >
      <h2 id={id} className={styles.sectionTitle}>{title}</h2>
      <p className={styles.sectionText}>{body}</p>
    </SurfacePanel>
  );
}
