/**
 * Shared UI public surface.
 *
 * Owns:
 *   - the stable export boundary for reusable UI primitives
 *
 * Does not own:
 *   - feature-specific chat/call/settings components
 *   - unstable local experiments that should stay feature-owned
 */
export * from "./actions";
export * from "./feedback";
export * from "./forms";
export * from "./identity";
export * from "./icons";
export * from "./surfaces";
