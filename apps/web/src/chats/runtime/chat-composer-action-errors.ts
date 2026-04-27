export type ChatComposerActionErrorKey =
  | "sendFailed"
  | "attachmentSendFailed"
  | "voiceSendFailed"
  | "videoSendFailed"
  | "reverifyRequired"
  | "groupSendFailed"
  | "groupMediaUnsupported";

type ChatComposerActionError = Error & {
  composerErrorKey?: ChatComposerActionErrorKey;
};

export function resolveChatComposerActionErrorKey(
  error: unknown,
  fallback: ChatComposerActionErrorKey
): ChatComposerActionErrorKey {
  if (
    error instanceof Error &&
    "composerErrorKey" in error &&
    typeof (error as ChatComposerActionError).composerErrorKey === "string"
  ) {
    return (error as ChatComposerActionError).composerErrorKey ?? fallback;
  }
  if (error instanceof Error && error.name === "PeerIdentityContinuityError") {
    return "reverifyRequired";
  }
  return fallback;
}
