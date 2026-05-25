/**
 * Shared UI feedback barrel.
 *
 * Owns:
 *   - inline status, notice, and delivery/security feedback primitives
 *
 * Does not own:
 *   - feature-specific copy or transport/runtime semantics
 */
export * from "./InlineNotice";
export * from "./LabelPill";
export * from "./MessageDeliveryStatus";
export * from "./SecurityModeBadge";
export * from "./StatusBadge";
