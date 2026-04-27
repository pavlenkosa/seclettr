import type { HTMLAttributes, ReactNode } from "react";
import styles from "./InfoStack.module.css";

type InfoStackAlign = "start" | "center";

export interface InfoStackProps extends Readonly<Omit<HTMLAttributes<HTMLDivElement>, "title" | "children">> {
  /** Optional eyebrow rendered above the title row. */
  readonly eyebrow?: ReactNode;
  /** Main title content. */
  readonly title: ReactNode;
  /** Optional accessory rendered inline with the title. */
  readonly titleAccessory?: ReactNode;
  /** Optional supporting meta text rendered below the title row. */
  readonly meta?: ReactNode;
  /** Optional accessory rendered inline with the meta row. */
  readonly metaAccessory?: ReactNode;
  /** Horizontal alignment recipe for the text stack. */
  readonly align?: InfoStackAlign;
  readonly eyebrowClassName?: string;
  readonly titleRowClassName?: string;
  readonly titleClassName?: string;
  readonly metaRowClassName?: string;
  readonly metaClassName?: string;
}

/**
 * Shared eyebrow-title-meta stack used by call surfaces, notices, and other
 * compact UI summaries that need consistent spacing and accessory alignment.
 */
export function InfoStack({
  eyebrow,
  title,
  titleAccessory = null,
  meta = null,
  metaAccessory = null,
  align = "start",
  className = "",
  eyebrowClassName = "",
  titleRowClassName = "",
  titleClassName = "",
  metaRowClassName = "",
  metaClassName = "",
  ...props
}: Readonly<InfoStackProps>) {
  return (
    <div
      {...props}
      className={[
        styles.root,
        align === "center" ? styles.center : styles.start,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {eyebrow ? (
        <div className={[styles.eyebrow, eyebrowClassName].filter(Boolean).join(" ")}>
          {eyebrow}
        </div>
      ) : null}

      <div className={[styles.row, styles.titleRow, titleRowClassName].filter(Boolean).join(" ")}>
        <div className={[styles.title, titleClassName].filter(Boolean).join(" ")}>
          {title}
        </div>
        {titleAccessory}
      </div>

      {meta || metaAccessory ? (
        <div className={[styles.row, styles.metaRow, metaRowClassName].filter(Boolean).join(" ")}>
          {meta ? (
            <div className={[styles.meta, metaClassName].filter(Boolean).join(" ")}>
              {meta}
            </div>
          ) : null}
          {metaAccessory}
        </div>
      ) : null}
    </div>
  );
}
