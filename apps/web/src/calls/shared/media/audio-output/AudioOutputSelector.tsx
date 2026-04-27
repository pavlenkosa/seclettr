import { useId } from "react";
import { useI18n } from "@/i18n";
import { InlineNotice, Listbox, PillButton } from "@/components/ui";
import type { AudioOutputPreference } from "@/ui-settings";

import { useCallAudioOutput } from "./CallAudioOutputProvider";
import type { AudioOutputOption, AudioOutputSupport } from "./audio-output-types";
import styles from "./AudioOutputSelector.module.css";

interface AudioOutputSelectorProps {
  readonly compact?: boolean;
  readonly className?: string;
}

function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 10.5h3.4L13 6v12l-4.6-4.5H5v-3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 9.2a4.3 4.3 0 0 1 0 5.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M18.8 6.5a8 8 0 0 1 0 11"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Translate = (key: string) => string;

interface AudioOutputHelperTextInput {
  readonly canSelectOutput: boolean;
  readonly isAndroidBrowserManagedOutput: boolean;
  readonly shouldShowPromptAction: boolean;
  readonly support: AudioOutputSupport;
  readonly t: Translate;
}

function getAudioOutputHelperText({
  canSelectOutput,
  isAndroidBrowserManagedOutput,
  shouldShowPromptAction,
  support,
  t,
}: AudioOutputHelperTextInput): string {
  if (canSelectOutput) return t("call.audioOutput.description");
  if (isAndroidBrowserManagedOutput) return t("call.audioOutput.androidBrowserManaged");
  if (shouldShowPromptAction) return t("call.audioOutput.promptHint");
  if (support === "system-only") return t("call.audioOutput.systemOnly");
  return t("call.audioOutput.unsupported");
}

interface AudioOutputFieldProps {
  readonly activeOption?: AudioOutputOption;
  readonly canSelectOutput: boolean;
  readonly compact: boolean;
  readonly fieldId: string;
  readonly isLoading: boolean;
  readonly options: AudioOutputOption[];
  readonly selectedPreference: AudioOutputPreference;
  readonly setSelectedPreference: (next: AudioOutputPreference) => Promise<void>;
  readonly t: Translate;
}

function AudioOutputField({
  activeOption,
  canSelectOutput,
  compact,
  fieldId,
  isLoading,
  options,
  selectedPreference,
  setSelectedPreference,
  t,
}: AudioOutputFieldProps) {
  if (canSelectOutput) {
    return (
      <Listbox
        id={fieldId}
        size={compact ? "pill" : "md"}
        leading={<SpeakerIcon />}
        value={selectedPreference}
        options={options}
        onChange={(val) => {
          setSelectedPreference(val as AudioOutputPreference);
        }}
        disabled={isLoading}
        wrapperClassName={styles.selectShell}
        aria-describedby={compact ? undefined : `${fieldId}-hint`}
        aria-labelledby={`${fieldId}-label`}
      />
    );
  }

  return (
    <div className={styles.readonlyField} role="status" aria-live="polite">
      <span className={styles.readonlyIcon} aria-hidden="true">
        <SpeakerIcon />
      </span>
      <span className={styles.readonlyValue}>
        {activeOption?.label ?? t("call.audioOutput.option.system")}
      </span>
    </div>
  );
}

interface AudioOutputPromptButtonProps {
  readonly compact: boolean;
  readonly isLoading: boolean;
  readonly isPromptingDeviceSelection: boolean;
  readonly requestDeviceSelection: () => Promise<void>;
  readonly t: Translate;
}

function AudioOutputPromptButton({
  compact,
  isLoading,
  isPromptingDeviceSelection,
  requestDeviceSelection,
  t,
}: AudioOutputPromptButtonProps) {
  return (
    <PillButton
      type="button"
      tone="accent"
      appearance="soft"
      size={compact ? "sm" : "md"}
      className={styles.promptButton}
      disabled={isLoading || isPromptingDeviceSelection}
      onClick={() => {
        requestDeviceSelection();
      }}
    >
      {isPromptingDeviceSelection
        ? t("call.audioOutput.prompting")
        : t("call.audioOutput.prompt")}
    </PillButton>
  );
}

/**
 * Call-specific selector for choosing where remote call audio should play.
 * It stays honest on unsupported browsers by keeping the field disabled and
 * surfacing a browser-controlled route message instead of fake device choices.
 */
export function AudioOutputSelector({
  compact = false,
  className = "",
}: AudioOutputSelectorProps) {
  const { t } = useI18n();
  const fieldId = useId();
  const {
    support,
    options,
    isLoading,
    isPromptingDeviceSelection,
    canPromptForDevices,
    isAndroidBrowserManagedOutput,
    error,
    selectedPreference,
    setSelectedPreference,
    requestDeviceSelection,
  } = useCallAudioOutput();

  const canSelectOutput = support === "full";
  const shouldShowPromptAction = canPromptForDevices && !canSelectOutput;
  if (compact && !canSelectOutput && !shouldShowPromptAction) {
    return null;
  }

  const helperText = getAudioOutputHelperText({
    canSelectOutput,
    isAndroidBrowserManagedOutput,
    shouldShowPromptAction,
    support,
    t,
  });
  const activeOption = options.find((option) => option.value === selectedPreference) ?? options[0];
  const shouldShowHint = !compact && (!canSelectOutput || shouldShowPromptAction);

  return (
    <div
      className={[
        styles.root,
        compact ? styles.compact : styles.panel,
        className,
      ].filter(Boolean).join(" ")}
    >
      <div className={styles.header}>
        {/* Use id-based label so both native fallback and custom Listbox can reference it */}
        <span id={`${fieldId}-label`} className={styles.title}>
          {t("call.audioOutput.label")}
        </span>
        {compact ? null : <p className={styles.description}>{helperText}</p>}
      </div>

      <AudioOutputField
        activeOption={activeOption}
        canSelectOutput={canSelectOutput}
        compact={compact}
        fieldId={fieldId}
        isLoading={isLoading}
        options={options}
        selectedPreference={selectedPreference}
        setSelectedPreference={setSelectedPreference}
        t={t}
      />

      {shouldShowPromptAction ? (
        <AudioOutputPromptButton
          compact={compact}
          isLoading={isLoading}
          isPromptingDeviceSelection={isPromptingDeviceSelection}
          requestDeviceSelection={requestDeviceSelection}
          t={t}
        />
      ) : null}

      {shouldShowHint ? (
        <p id={`${fieldId}-hint`} className={styles.hint}>
          {helperText}
        </p>
      ) : null}

      {error ? (
        <InlineNotice className={styles.notice} tone="warning" size="sm" role="status">
          {error}
        </InlineNotice>
      ) : null}
    </div>
  );
}
