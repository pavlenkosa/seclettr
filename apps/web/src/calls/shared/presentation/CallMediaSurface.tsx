/**
 * CallMediaSurface — generic media tile wrapper for call participant slots.
 *
 * Owns:
 *   - Polymorphic container element (`div` or `article`)
 *   - Optional interactive role (button semantics, keyboard Enter/Space handling)
 *   - Optional secondary action button rendered inside the tile
 *   - Slot regions: media, fallback, overlayTopStart, overlayBottom, children
 *
 * CallMediaAvatarFallback — avatar placeholder shown when no video track is present.
 *
 * Owns:
 *   - Avatar with initials and aria-hidden wrapper
 *   - Speaking pulse ring (data-driven via `isSpeaking` and variant props)
 *   - Data-attribute surface for CSS speaking/audio state hooks
 *
 * Does not own media track binding, speaking detection, call state, or call lifecycle.
 * Consumed by both direct and group call tile and stage layouts.
 */
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Avatar } from "@/components/ui";

type CallMediaSurfaceTag = "article" | "div";
export type CallMediaSpeakingVariant = "primary-stage" | "tile" | "strip";

interface CallMediaSurfaceProps {
  readonly as?: CallMediaSurfaceTag;
  readonly className?: string;
  readonly interactiveClassName?: string;
  readonly media?: ReactNode;
  readonly fallback?: ReactNode;
  readonly overlayTopStart?: ReactNode;
  readonly overlayBottom?: ReactNode;
  readonly children?: ReactNode;
  readonly onSelect?: () => void;
  readonly interactiveLabel?: string;
  readonly onSecondaryAction?: () => void;
  readonly secondaryActionLabel?: string;
  readonly secondaryActionContent?: ReactNode;
  readonly secondaryActionClassName?: string;
  readonly secondaryActionDisabled?: boolean;
}

interface CallMediaAvatarFallbackProps {
  readonly label: string;
  readonly initials: string;
  readonly className?: string;
  readonly avatarClassName?: string;
  readonly pulseClassName?: string;
  readonly pulseActiveClassName?: string;
  readonly hasAudio?: boolean;
  readonly isSpeaking?: boolean;
  readonly speakingVariant?: CallMediaSpeakingVariant;
}

export function CallMediaSurface({
  as = "div",
  className,
  interactiveClassName,
  media,
  fallback,
  overlayTopStart,
  overlayBottom,
  children,
  onSelect,
  interactiveLabel,
  onSecondaryAction,
  secondaryActionLabel,
  secondaryActionContent,
  secondaryActionClassName,
  secondaryActionDisabled = false,
}: CallMediaSurfaceProps) {
  const Component = as;
  const isInteractive = typeof onSelect === "function";

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isInteractive) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  };

  const handleSecondaryActionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onSecondaryAction?.();
  };

  return (
    <Component
      className={[
        className ?? "",
        isInteractive && interactiveClassName ? interactiveClassName : "",
      ].filter(Boolean).join(" ")}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      aria-label={isInteractive ? interactiveLabel : undefined}
    >
      {onSecondaryAction && secondaryActionLabel ? (
        <button
          type="button"
          className={secondaryActionClassName}
          onClick={handleSecondaryActionClick}
          aria-label={secondaryActionLabel}
          disabled={secondaryActionDisabled}
        >
          {secondaryActionContent ?? secondaryActionLabel}
        </button>
      ) : null}
      {media ?? fallback ?? null}
      {children}
      {overlayTopStart}
      {overlayBottom}
    </Component>
  );
}

export function CallMediaAvatarFallback({
  label,
  initials,
  className,
  avatarClassName,
  pulseClassName,
  pulseActiveClassName,
  hasAudio = false,
  isSpeaking = false,
  speakingVariant = "tile",
}: CallMediaAvatarFallbackProps) {
  return (
    <div
      className={className}
      aria-hidden="true"
      data-audio-present={hasAudio ? "true" : "false"}
      data-speaking-variant={speakingVariant}
      data-speaking={isSpeaking ? "true" : "false"}
    >
      {isSpeaking && pulseClassName ? (
        <span
          className={[
            pulseClassName,
            isSpeaking && pulseActiveClassName ? pulseActiveClassName : "",
          ].filter(Boolean).join(" ")}
        />
      ) : null}
      <Avatar
        label={label}
        initials={initials}
        className={avatarClassName}
        ariaHidden
      />
    </div>
  );
}
