import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { InputDeviceOption } from "@/calls/shared/media/input-devices/useCallInputDevices";
import styles from "./CallDevicePicker.module.css";

export type VideoResolution = "360p" | "480p" | "720p" | "1080p";

export const VIDEO_RESOLUTIONS: { value: VideoResolution; label: string }[] = [
  { value: "360p", label: "360p" },
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p (HD)" },
  { value: "1080p", label: "1080p (Full HD)" },
];

function ChevronDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface DeviceSectionProps {
  label: string;
  devices: InputDeviceOption[];
  selectedId: string | null;
  onSelect: (deviceId: string) => void;
}

function DeviceSection({ label, devices, selectedId, onSelect }: DeviceSectionProps) {
  if (devices.length === 0) return null;
  return (
    <div className={styles.menuSection}>
      <div className={styles.sectionLabel}>{label}</div>
      {devices.map((device) => {
        const isSelected = device.deviceId === selectedId;
        return (
          <button
            key={device.deviceId}
            type="button"
            className={[styles.menuItem, isSelected ? styles.selected : ""].filter(Boolean).join(" ")}
            onClick={() => onSelect(device.deviceId)}
            aria-pressed={isSelected}
          >
            {isSelected
              ? <span className={styles.checkmark}><CheckIcon /></span>
              : <span className={styles.checkmarkPlaceholder} />}
            <span className={styles.deviceLabel}>{device.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ResolutionSectionProps {
  selectedResolution: VideoResolution;
  onSelectResolution: (res: VideoResolution) => void;
  resolutionLabel: string;
}

function ResolutionSection({ selectedResolution, onSelectResolution, resolutionLabel }: ResolutionSectionProps) {
  return (
    <div className={styles.resolutionSection}>
      <div className={styles.sectionLabel}>{resolutionLabel}</div>
      {VIDEO_RESOLUTIONS.map((res) => {
        const isSelected = res.value === selectedResolution;
        return (
          <button
            key={res.value}
            type="button"
            className={[styles.menuItem, isSelected ? styles.selected : ""].filter(Boolean).join(" ")}
            onClick={() => onSelectResolution(res.value)}
            aria-pressed={isSelected}
          >
            {isSelected
              ? <span className={styles.checkmark}><CheckIcon /></span>
              : <span className={styles.checkmarkPlaceholder} />}
            <span className={styles.deviceLabel}>{res.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface CallDevicePickerProps {
  readonly children: ReactNode;
  readonly micDevices?: InputDeviceOption[];
  readonly cameraDevices?: InputDeviceOption[];
  readonly selectedMicId?: string | null;
  readonly selectedCameraId?: string | null;
  readonly selectedResolution?: VideoResolution;
  readonly micSectionLabel?: string;
  readonly cameraSectionLabel?: string;
  readonly resolutionSectionLabel?: string;
  readonly showResolution?: boolean;
  readonly disabled?: boolean;
  readonly chevronAriaLabel?: string;
  /** Mirror the active state of the wrapped button so the pill shell reflects it. */
  readonly active?: boolean;
  /** Mirror the tone of the wrapped button so the pill shell reflects it. */
  readonly tone?: "default" | "danger";
  readonly onSelectMic?: (deviceId: string) => void;
  readonly onSelectCamera?: (deviceId: string) => void;
  readonly onSelectResolution?: (res: VideoResolution) => void;
}

export function CallDevicePicker({
  children,
  micDevices = [],
  cameraDevices = [],
  selectedMicId = null,
  selectedCameraId = null,
  selectedResolution = "720p",
  micSectionLabel = "Microphone",
  cameraSectionLabel = "Camera",
  resolutionSectionLabel = "Video quality",
  showResolution = false,
  disabled = false,
  chevronAriaLabel = "Device settings",
  active = false,
  tone = "default",
  onSelectMic,
  onSelectCamera,
  onSelectResolution,
}: CallDevicePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hasMics = micDevices.length > 0 && Boolean(onSelectMic);
  const hasCameras = cameraDevices.length > 0 && Boolean(onSelectCamera);
  const hasResolution = showResolution && Boolean(onSelectResolution);
  const hasContent = hasMics || hasCameras || hasResolution;

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        close();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, close]);

  if (!hasContent) {
    return <>{children}</>;
  }

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-active={active ? "true" : undefined}
      data-tone={tone !== "default" ? tone : undefined}
    >
      {children}
      <span className={styles.divider} aria-hidden="true" />
      <button
        type="button"
        className={styles.chevronBtn}
        aria-label={chevronAriaLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
      >
        <ChevronDownIcon />
      </button>
      {isOpen && (
        <div className={styles.menu} role="menu">
          {hasMics && onSelectMic && (
            <DeviceSection
              label={micSectionLabel}
              devices={micDevices}
              selectedId={selectedMicId}
              onSelect={(id) => { onSelectMic(id); close(); }}
            />
          )}
          {hasCameras && onSelectCamera && (
            <DeviceSection
              label={cameraSectionLabel}
              devices={cameraDevices}
              selectedId={selectedCameraId}
              onSelect={(id) => { onSelectCamera(id); close(); }}
            />
          )}
          {hasResolution && onSelectResolution && (
            <ResolutionSection
              resolutionLabel={resolutionSectionLabel}
              selectedResolution={selectedResolution}
              onSelectResolution={(res) => { onSelectResolution(res); close(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}
