export {
  CameraIcon,
  ExpandIcon,
  HangupIcon,
  MinimizeIcon,
  MuteIcon,
  PhoneIcon,
  ScreenShareIcon,
} from "@/calls/shared/presentation/CallIcons";

export function DetailsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 4.25h10M3 8h10M3 11.75h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="5" cy="4.25" r="1" fill="currentColor" />
      <circle cx="11" cy="8" r="1" fill="currentColor" />
      <circle cx="7" cy="11.75" r="1" fill="currentColor" />
    </svg>
  );
}
