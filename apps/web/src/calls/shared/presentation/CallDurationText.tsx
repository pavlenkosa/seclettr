/**
 * CallDurationText — live-updating call duration display.
 *
 * Owns:
 *   - 1-second interval tick to keep `nowMs` current while the call is running
 *   - Duration formatting (seconds → mm:ss) via shared `call-duration` model helpers
 *   - Optional fallback text when no active timer is present
 *   - CSS className forwarding for caller layout control
 *
 * Does not own call lifecycle, timer start/stop logic, or call state.
 * Consumed by both DirectCallActiveOverlay and group call header surfaces.
 */
import { useEffect, useState } from "react";
import {
  formatCallDuration,
  resolveCallDurationSeconds,
  type CallDurationClock,
} from "@/calls/shared/model/call-duration";

interface CallDurationTextProps extends Readonly<CallDurationClock> {
  readonly className?: string;
  readonly fallbackText?: string;
  /**
   * Accessible label for the timer element (e.g. "Call duration").
   * When provided the element renders with `role="timer"` and `aria-label`,
   * which tells screen readers this is a timer without announcing every tick.
   */
  readonly ariaLabel?: string;
}

export function CallDurationText({
  baseSeconds,
  startedAtMs,
  className,
  fallbackText,
  ariaLabel,
}: Readonly<CallDurationTextProps>) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isRunning = startedAtMs !== null && startedAtMs !== undefined;

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    setNowMs(Date.now());
    const timer = globalThis.window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [isRunning, startedAtMs]);

  const label = isRunning
    ? formatCallDuration(resolveCallDurationSeconds({ baseSeconds, startedAtMs }, nowMs))
    : fallbackText ?? formatCallDuration(baseSeconds);

  return (
    <span
      className={className}
      role={ariaLabel ? "timer" : undefined}
      aria-label={ariaLabel}
    >
      {label}
    </span>
  );
}
