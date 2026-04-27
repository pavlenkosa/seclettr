import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useI18n } from "@/i18n";
import {
  type AudioOutputPreference,
  useAudioOutputSettings,
} from "@/ui-settings";
import {
  applyAudioOutputPreference,
  supportsAudioOutputSelection,
} from "./apply-audio-output-sink";
import {
  isAndroidBrowserManagedAudioOutput,
  requestAudioOutputDevice,
  supportsAudioOutputDevicePrompt,
} from "./audio-output-browser";
import { startCallAudioSessionRouting } from "./audio-session-routing";
import { resolveAudioOutputSupport } from "./audio-output-capabilities";
import {
  encodeAudioOutputPreference,
  SYSTEM_AUDIO_OUTPUT_PREFERENCE,
  type AudioOutputOption,
  type AudioOutputSupport,
} from "./audio-output-types";

interface CallAudioOutputContextValue {
  support: AudioOutputSupport;
  options: AudioOutputOption[];
  isLoading: boolean;
  isPromptingDeviceSelection: boolean;
  canPromptForDevices: boolean;
  isAndroidBrowserManagedOutput: boolean;
  error: string | null;
  selectedPreference: AudioOutputPreference;
  setSelectedPreference: (next: AudioOutputPreference) => Promise<void>;
  requestDeviceSelection: () => Promise<void>;
  registerAudioElement: (element: HTMLAudioElement) => () => void;
}

const CallAudioOutputContext = createContext<CallAudioOutputContextValue | null>(null);

function buildAudioOutputOptions(
  devices: MediaDeviceInfo[],
  systemLabel: string,
  unnamedLabelFactory: (index: number) => string
): AudioOutputOption[] {
  const options: AudioOutputOption[] = [
    {
      value: SYSTEM_AUDIO_OUTPUT_PREFERENCE,
      deviceId: null,
      label: systemLabel,
    },
  ];

  const seenDeviceIds = new Set<string>();
  let unnamedIndex = 1;

  for (const device of devices) {
    if (device.kind !== "audiooutput") {
      continue;
    }
    if (!device.deviceId || device.deviceId === "default" || seenDeviceIds.has(device.deviceId)) {
      continue;
    }

    seenDeviceIds.add(device.deviceId);
    options.push({
      value: encodeAudioOutputPreference(device.deviceId),
      deviceId: device.deviceId,
      label: device.label.trim() || unnamedLabelFactory(unnamedIndex++),
    });
  }

  return options;
}

function toAudioOutputErrorMessage(error: unknown, fallback: string, deviceUnavailable: string): string {
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return deviceUnavailable;
  }
  return fallback;
}

function mergePromptedOutputOption(
  options: AudioOutputOption[],
  device: MediaDeviceInfo | null,
  unnamedLabelFactory: (index: number) => string
): AudioOutputOption[] {
  if (!device?.deviceId || device.deviceId === "default") {
    return options;
  }

  if (options.some((option) => option.deviceId === device.deviceId)) {
    return options;
  }

  const unnamedCount = options.filter((option) => option.deviceId).length + 1;
  return [
    ...options,
    {
      value: encodeAudioOutputPreference(device.deviceId),
      deviceId: device.deviceId,
      label: device.label.trim() || unnamedLabelFactory(unnamedCount),
    },
  ];
}

/**
 * Shared runtime for binding call playback audio to the preferred output route.
 * It owns device discovery, sink application, and resilient fallback to system audio.
 */
export function CallAudioOutputProvider({ children }: { readonly children: ReactNode }) {
  const { t } = useI18n();
  const {
    audioOutputPreference,
    setAudioOutputPreference,
  } = useAudioOutputSettings();
  const [options, setOptions] = useState<AudioOutputOption[]>([
    {
      value: SYSTEM_AUDIO_OUTPUT_PREFERENCE,
      deviceId: null,
      label: t("call.audioOutput.option.system"),
    },
  ]);
  const [support, setSupport] = useState<AudioOutputSupport>(() => (
    supportsAudioOutputSelection() ? "system-only" : "unsupported"
  ));
  const [isLoading, setIsLoading] = useState(false);
  const [isPromptingDeviceSelection, setIsPromptingDeviceSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioElementsRef = useRef<Set<HTMLAudioElement>>(new Set());
  const isAndroidBrowserManagedOutput = isAndroidBrowserManagedAudioOutput();
  const canPromptForDevices = supportsAudioOutputSelection()
    && supportsAudioOutputDevicePrompt()
    && !isAndroidBrowserManagedOutput;

  const refreshOptions = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices;
    const sinkSelectionSupported = supportsAudioOutputSelection();

    if (!sinkSelectionSupported || !mediaDevices?.enumerateDevices) {
      const fallbackOptions = [{
        value: SYSTEM_AUDIO_OUTPUT_PREFERENCE,
        deviceId: null,
        label: t("call.audioOutput.option.system"),
      }];
      setOptions(fallbackOptions);
      setSupport("unsupported");
      return;
    }

    setIsLoading(true);
    try {
      const devices = await mediaDevices.enumerateDevices();
      const nextOptions = buildAudioOutputOptions(
        devices,
        t("call.audioOutput.option.system"),
        (index) => t("call.audioOutput.option.unnamed", { index })
      );
      setOptions(nextOptions);
      setSupport(resolveAudioOutputSupport({
        sinkSelectionSupported,
        options: nextOptions,
      }));

      if (
        audioOutputPreference !== SYSTEM_AUDIO_OUTPUT_PREFERENCE &&
        !nextOptions.some((option) => option.value === audioOutputPreference)
      ) {
        setAudioOutputPreference(SYSTEM_AUDIO_OUTPUT_PREFERENCE);
        setError(t("call.audioOutput.error.deviceUnavailable"));
      }
    } catch {
      setOptions([{
        value: SYSTEM_AUDIO_OUTPUT_PREFERENCE,
        deviceId: null,
        label: t("call.audioOutput.option.system"),
      }]);
      setSupport("system-only");
      setError(t("call.audioOutput.error.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [audioOutputPreference, setAudioOutputPreference, t]);

  const applyPreferenceToElement = useCallback(async (
    element: HTMLAudioElement,
    preference: AudioOutputPreference
  ) => {
    await applyAudioOutputPreference(element, preference);
  }, []);

  const applyPreferenceToAll = useCallback(async (preference: AudioOutputPreference) => {
    await Promise.all([...audioElementsRef.current].map(async (element) => {
      await applyPreferenceToElement(element, preference);
    }));
  }, [applyPreferenceToElement]);

  useEffect(() => {
    refreshOptions();
  }, [refreshOptions]);

  useEffect(() => {
    const stopCallAudioSessionRouting = startCallAudioSessionRouting();
    return () => {
      stopCallAudioSessionRouting?.();
    };
  }, []);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      refreshOptions();
    };

    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [refreshOptions]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await applyPreferenceToAll(audioOutputPreference);
      } catch (caughtError) {
        if (cancelled) {
          return;
        }
        setError(
          toAudioOutputErrorMessage(
            caughtError,
            t("call.audioOutput.error.applyFailed"),
            t("call.audioOutput.error.deviceUnavailable")
          )
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyPreferenceToAll, audioOutputPreference, t]);

  const registerAudioElement = useCallback((element: HTMLAudioElement) => {
    audioElementsRef.current.add(element);
    applyPreferenceToElement(element, audioOutputPreference).catch((caughtError) => {
      setError(
        toAudioOutputErrorMessage(
          caughtError,
          t("call.audioOutput.error.applyFailed"),
          t("call.audioOutput.error.deviceUnavailable")
        )
      );
    });

    return () => {
      audioElementsRef.current.delete(element);
    };
  }, [applyPreferenceToElement, audioOutputPreference, t]);

  const handleSelectPreference = useCallback(async (next: AudioOutputPreference) => {
    setError(null);

    try {
      await applyPreferenceToAll(next);
    } catch (caughtError) {
      setError(
        toAudioOutputErrorMessage(
          caughtError,
          t("call.audioOutput.error.applyFailed"),
          t("call.audioOutput.error.deviceUnavailable")
        )
      );
      return;
    }
    setAudioOutputPreference(next);
  }, [applyPreferenceToAll, setAudioOutputPreference, t]);

  const handleRequestDeviceSelection = useCallback(async () => {
    if (!canPromptForDevices) {
      return;
    }

    setError(null);
    setIsPromptingDeviceSelection(true);
    try {
      const selectedDevice = await requestAudioOutputDevice(audioOutputPreference);
      if (!selectedDevice?.deviceId || selectedDevice.deviceId === "default") {
        await handleSelectPreference(SYSTEM_AUDIO_OUTPUT_PREFERENCE);
        return;
      }

      const nextPreference = encodeAudioOutputPreference(selectedDevice.deviceId);
      const nextOptions = mergePromptedOutputOption(
        options,
        selectedDevice,
        (index) => t("call.audioOutput.option.unnamed", { index })
      );

      setOptions(nextOptions);
      setSupport(resolveAudioOutputSupport({
        sinkSelectionSupported: true,
        options: nextOptions,
      }));
      await handleSelectPreference(nextPreference);
      refreshOptions();
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException &&
        (caughtError.name === "AbortError" || caughtError.name === "NotAllowedError")
      ) {
        return;
      }
      setError(
        toAudioOutputErrorMessage(
          caughtError,
          t("call.audioOutput.error.promptFailed"),
          t("call.audioOutput.error.deviceUnavailable")
        )
      );
    } finally {
      setIsPromptingDeviceSelection(false);
    }
  }, [
    audioOutputPreference,
    canPromptForDevices,
    handleSelectPreference,
    options,
    refreshOptions,
    t,
  ]);

  const value = useMemo<CallAudioOutputContextValue>(() => ({
    support,
    options,
    isLoading,
    isPromptingDeviceSelection,
    canPromptForDevices,
    isAndroidBrowserManagedOutput,
    error,
    selectedPreference: audioOutputPreference,
    setSelectedPreference: handleSelectPreference,
    requestDeviceSelection: handleRequestDeviceSelection,
    registerAudioElement,
  }), [
    support,
    options,
    isLoading,
    isPromptingDeviceSelection,
    canPromptForDevices,
    isAndroidBrowserManagedOutput,
    error,
    audioOutputPreference,
    handleSelectPreference,
    handleRequestDeviceSelection,
    registerAudioElement,
  ]);

  return (
    <CallAudioOutputContext.Provider value={value}>
      {children}
    </CallAudioOutputContext.Provider>
  );
}

export function useCallAudioOutput(): CallAudioOutputContextValue {
  const context = useContext(CallAudioOutputContext);
  if (!context) {
    throw new Error("useCallAudioOutput must be used within CallAudioOutputProvider");
  }
  return context;
}

export function useOptionalCallAudioOutput(): CallAudioOutputContextValue | null {
  return useContext(CallAudioOutputContext);
}

export function useRegisterCallAudioOutputTarget(
  elementRef: RefObject<HTMLAudioElement | null>
): void {
  const context = useOptionalCallAudioOutput();

  useEffect(() => {
    const element = elementRef.current;
    if (!context || !element) {
      return;
    }

    return context.registerAudioElement(element);
  }, [context, elementRef]);
}
