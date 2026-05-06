import { useEffect, useState } from "react";
import {
  formatCallDuration,
  resolveCallDurationSeconds,
  type CallDurationClock,
} from "@/calls/shared/model/call-duration";

interface CallDurationTextProps extends Readonly<CallDurationClock> {
  readonly className?: string;
  readonly fallbackText?: string;
}

export function CallDurationText({
  baseSeconds,
  startedAtMs,
  className,
  fallbackText,
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

  if (className) {
    return <span className={className}>{label}</span>;
  }

  return <>{label}</>;
}
