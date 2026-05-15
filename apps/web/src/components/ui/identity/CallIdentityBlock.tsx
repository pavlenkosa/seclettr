import type { HTMLAttributes, ReactNode } from "react";
import { InfoStack, type InfoStackProps } from "./InfoStack";
import styles from "./CallIdentityBlock.module.css";

type CallIdentityBlockLayout = "inline" | "stacked";

export interface CallIdentityBlockProps extends Readonly<Omit<HTMLAttributes<HTMLDivElement>, "title" | "children">> {
  /** Leading avatar, icon bubble, or other identity marker. */
  readonly leading?: ReactNode;
  /** Main identity label. */
  readonly title: ReactNode;
  /** Optional eyebrow rendered above the title. */
  readonly eyebrow?: ReactNode;
  /** Optional supporting meta content. */
  readonly meta?: ReactNode;
  /** Optional accessory rendered inline with the title. */
  readonly titleAccessory?: ReactNode;
  /** Optional accessory rendered inline with the meta row. */
  readonly metaAccessory?: ReactNode;
  /** Chooses between horizontal or vertically stacked identity layouts. */
  readonly layout?: CallIdentityBlockLayout;
  /** Optional alignment forwarded to the nested info stack. */
  readonly align?: InfoStackProps["align"];
  readonly leadingClassName?: string;
  readonly infoClassName?: string;
  readonly eyebrowClassName?: string;
  readonly titleRowClassName?: string;
  readonly titleClassName?: string;
  readonly metaRowClassName?: string;
  readonly metaClassName?: string;
}

/**
 * Shared identity block for call surfaces that combine an avatar or icon
 * marker with a compact title/meta stack. It supports both stacked incoming
 * layouts and inline notice layouts without duplicating the text structure.
 * Choose it for call-oriented identity composition; prefer AvatarSummaryButton for minimized clickable summaries and InfoStack when only the text hierarchy is needed.
 */
export function CallIdentityBlock({
  leading = null,
  title,
  eyebrow,
  meta = null,
  titleAccessory = null,
  metaAccessory = null,
  layout = "inline",
  align,
  className = "",
  leadingClassName = "",
  infoClassName = "",
  eyebrowClassName = "",
  titleRowClassName = "",
  titleClassName = "",
  metaRowClassName = "",
  metaClassName = "",
  ...props
}: Readonly<CallIdentityBlockProps>) {
  const resolvedAlign = align ?? (layout === "stacked" ? "center" : "start");

  return (
    <div
      {...props}
      className={[
        styles.root,
        layout === "stacked" ? styles.stacked : styles.inline,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {leading ? (
        <div className={[styles.leading, leadingClassName].filter(Boolean).join(" ")}>
          {leading}
        </div>
      ) : null}

      <InfoStack
        className={[styles.info, infoClassName].filter(Boolean).join(" ")}
        align={resolvedAlign}
        eyebrow={eyebrow}
        title={title}
        meta={meta}
        titleAccessory={titleAccessory}
        metaAccessory={metaAccessory}
        eyebrowClassName={eyebrowClassName}
        titleRowClassName={titleRowClassName}
        titleClassName={titleClassName}
        metaRowClassName={metaRowClassName}
        metaClassName={metaClassName}
      />
    </div>
  );
}
