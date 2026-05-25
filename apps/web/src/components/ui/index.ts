/**
 * Shared UI public surface.
 *
 * Owns:
 *   - the stable export boundary for reusable UI primitives
 *
 * Does not own:
 *   - feature-specific chat/call/settings components
 *   - unstable local experiments that should stay feature-owned
 *
 * Note: explicit file imports enable tree-shaking and
 * prevent unused components from inflating bundles.
 */

export { IconButton } from "./actions/IconButton";
export { IconPill } from "./actions/IconPill";
export { PillButton } from "./actions/PillButton";

export { InlineNotice } from "./feedback/InlineNotice";
export { LabelPill } from "./feedback/LabelPill";
export { MessageDeliveryStatusIcon, type MessageDeliveryStatus, type MessageDeliveryStatusIconProps } from "./feedback/MessageDeliveryStatus";
export { SecurityModeBadge } from "./feedback/SecurityModeBadge";
export { StatusBadge, type StatusBadgeTone } from "./feedback/StatusBadge";

export { FieldSection } from "./forms/FieldSection";
export { InputField } from "./forms/InputField";
export { Listbox } from "./forms/Listbox";
export { SegmentedControl } from "./forms/SegmentedControl";
export { SelectField } from "./forms/SelectField";

export { Avatar } from "./identity/Avatar";
export { AvatarSummaryButton } from "./identity/AvatarSummaryButton";
export { CallIdentityBlock } from "./identity/CallIdentityBlock";
export { InfoStack } from "./identity/InfoStack";

export { IconChevronRight } from "./icons/IconChevronRight";
export { IconClose } from "./icons/IconClose";
export { IconNewGroup } from "./icons/IconNewGroup";
export { IconPlus } from "./icons/IconPlus";
export { IconSearch } from "./icons/IconSearch";
export { IconSettings } from "./icons/IconSettings";
export { IconLock } from "./icons/IconLock";
export { IconLogout } from "./icons/IconLogout";
export { IconEye } from "./icons/IconEye";
export { IconEyeOff } from "./icons/IconEyeOff";
export { IconEncrypted } from "./icons/IconEncrypted";
export { IconPinned } from "./icons/IconPinned";

export { BottomDockSurface } from "./surfaces/BottomDockSurface";
export { EntityRow } from "./surfaces/EntityRow";
export { FloatingDock } from "./surfaces/FloatingDock";
export { HeaderBar } from "./surfaces/HeaderBar";
export { ModalShell } from "./surfaces/ModalShell";
export { SurfacePanel } from "./surfaces/SurfacePanel";
