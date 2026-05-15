/**
 * Transport delivery states shown near outgoing messages.
 */
export type MessageDeliveryStatus = "sending" | "sent" | "delivered" | "read";

/**
 * Props for the delivery status icon renderer.
 */
export interface MessageDeliveryStatusIconProps {
  readonly status: MessageDeliveryStatus;
  readonly size?: number;
}

/**
 * Compact icon set for message delivery states.
 * Choose it only for outgoing message transport states; do not reuse it as a generic status badge or arbitrary timeline indicator.
 */
export function MessageDeliveryStatusIcon({ status, size = 14 }: MessageDeliveryStatusIconProps) {
  if (status === "sending") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 3.8V7L9.2 8.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (status === "sent") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
        <path
          d="M3 7.1L5.2 9.3L10.6 3.9"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 16 14" fill="none">
      <path
        d="M1.8 7.1L4 9.3L9.4 3.9M6.8 7.1L9 9.3L14.4 3.9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
