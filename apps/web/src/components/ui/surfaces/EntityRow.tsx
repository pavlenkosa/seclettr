import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import styles from "./EntityRow.module.css";

type EntityRowSize = "sm" | "md" | "lg";
type EntityRowAlign = "center" | "start";

interface EntityRowBaseProps {
  /** Shared size preset for result rows, member rows, and compact directory items. */
  readonly size?: EntityRowSize;
  /** Controls vertical alignment when the row contains supporting content. */
  readonly align?: EntityRowAlign;
  /** Optional avatar, icon, or other leading visual. */
  readonly leading?: ReactNode;
  /** Main label rendered in the primary content column. */
  readonly title: ReactNode;
  /** Secondary line rendered under the title when needed. */
  readonly subtitle?: ReactNode;
  /** Extra supporting content, such as badges or meta chips. */
  readonly meta?: ReactNode;
  /** Optional trailing node for inline actions or counters. */
  readonly trailing?: ReactNode;
  /** Optional class applied to the text stack. */
  readonly mainClassName?: string;
  /** Optional class applied to the title wrapper. */
  readonly titleClassName?: string;
  /** Optional class applied to the subtitle wrapper. */
  readonly subtitleClassName?: string;
  /** Optional class applied to the meta wrapper. */
  readonly metaClassName?: string;
}

type EntityRowButtonProps = EntityRowBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    as?: "button";
  };

type EntityRowDivProps = EntityRowBaseProps &
  Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    as: "div";
  };

export type EntityRowProps = EntityRowButtonProps | EntityRowDivProps;

interface EntityRowRenderState {
  classes: string;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  mainClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  metaClassName?: string;
}

function renderEntityRowContent({
  classes,
  leading,
  title,
  subtitle,
  meta,
  trailing,
  mainClassName = "",
  titleClassName = "",
  subtitleClassName = "",
  metaClassName = "",
}: EntityRowRenderState) {
  return {
    classes,
    content: (
      <>
        {leading ? <span className={styles.leading}>{leading}</span> : null}
        <span className={[styles.main, mainClassName].filter(Boolean).join(" ")}>
          <span className={[styles.title, titleClassName].filter(Boolean).join(" ")}>{title}</span>
          {subtitle ? <span className={[styles.subtitle, subtitleClassName].filter(Boolean).join(" ")}>{subtitle}</span> : null}
          {meta ? <span className={[styles.meta, metaClassName].filter(Boolean).join(" ")}>{meta}</span> : null}
        </span>
        {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
      </>
    ),
  };
}

/**
 * Shared directory-style row for user results, member summaries, and compact
 * list entries. It centralizes spacing, typography hierarchy, and interactive
 * hover behavior so entity lists stay visually consistent across the app.
 */
export function EntityRow(props: EntityRowProps) {
  if (props.as === "div") {
    const {
      as: _as,
      size = "md",
      align = "center",
      leading,
      title,
      subtitle,
      meta,
      trailing,
      className = "",
      mainClassName = "",
      titleClassName = "",
      subtitleClassName = "",
      metaClassName = "",
      ...divProps
    } = props;
    const { classes, content } = renderEntityRowContent({
      classes: [
        styles.row,
        styles[size],
        align === "start" ? styles.alignStart : styles.alignCenter,
        trailing ? styles.hasTrailing : "",
        className,
      ]
        .filter(Boolean)
        .join(" "),
      leading,
      title,
      subtitle,
      meta,
      trailing,
      mainClassName,
      titleClassName,
      subtitleClassName,
      metaClassName,
    });

    return (
      <div {...divProps} className={classes}>
        {content}
      </div>
    );
  }

  const {
    as: _as,
    size = "md",
    align = "center",
    leading,
    title,
    subtitle,
    meta,
    trailing,
    className = "",
    mainClassName = "",
    titleClassName = "",
    subtitleClassName = "",
    metaClassName = "",
    ...buttonProps
  } = props;
  const { classes, content } = renderEntityRowContent({
    classes: [
      styles.row,
      styles[size],
      align === "start" ? styles.alignStart : styles.alignCenter,
      styles.interactive,
      trailing ? styles.hasTrailing : "",
      className,
    ]
      .filter(Boolean)
      .join(" "),
    leading,
    title,
    subtitle,
    meta,
    trailing,
    mainClassName,
    titleClassName,
    subtitleClassName,
    metaClassName,
  });

  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      className={classes}
    >
      {content}
    </button>
  );
}
