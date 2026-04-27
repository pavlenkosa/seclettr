/**
 * Shared local type aliases used across direct-call runtime hooks.
 *
 * These types mirror the signatures of `useI18n().t` and the `pushNotice`
 * callback returned by `useDirectCallUiFeedback`. They are intentionally kept
 * as structural aliases rather than importing from a concrete module so that
 * the runtime hooks remain decoupled from the i18n and feedback
 * implementation details.
 */

import type { CallNotice } from "@/calls/direct/model/direct-call-types";

export type DirectCallTranslate = (
  key: string,
  params?: Record<string, string | number | undefined>
) => string;

export type DirectCallPushNotice = (next: CallNotice, timeoutMs?: number) => void;

export type DirectCallTerminalAuthority = "hangup" | "reject";

export type DirectCallTerminalReason =
  | "incoming-cancelled"
  | "invalid-call-auth"
  | "local-hangup"
  | "local-reject"
  | "remote-hangup"
  | "remote-reject"
  | "ringing-timeout"
  | "setup-failed"
  | "signal-handler-failed";

export interface DirectCallFinishSessionOptions {
  reason: DirectCallTerminalReason;
  authority?: DirectCallTerminalAuthority | null;
  callId?: string | null;
  notice?: CallNotice;
  onBeforeReset?: () => void;
}

export type DirectCallFinishSession = (opts: DirectCallFinishSessionOptions) => void;
