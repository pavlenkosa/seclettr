import { SurfacePanel } from "@/components/ui";
import styles from "../AuthRecoveryPage.module.css";

interface AuthRecoveryExplanationProps {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly tone?: "default" | "accent";
}

export function AuthRecoveryExplanation({
  id,
  title,
  body,
  tone = "default",
}: Readonly<AuthRecoveryExplanationProps>) {
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
