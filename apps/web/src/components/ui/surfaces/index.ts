/**
 * Shared UI surfaces barrel.
 *
 * Owns:
 *   - reusable shells for panels, rows, docks, headers, and dialogs
 *
 * Does not own:
 *   - feature-specific fullscreen call shells or page-level routing frames
 */
export * from "./BottomDockSurface";
export * from "./EntityRow";
export * from "./FloatingDock";
export * from "./HeaderBar";
export * from "./ModalShell";
export * from "./SurfacePanel";
