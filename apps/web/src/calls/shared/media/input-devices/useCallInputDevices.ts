import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface InputDeviceOption {
  deviceId: string;
  label: string;
  kind: "audioinput" | "videoinput";
}

export interface UseCallInputDevicesResult {
  micDevices: InputDeviceOption[];
  cameraDevices: InputDeviceOption[];
  selectedMicId: string | null;
  selectedCameraId: string | null;
  isLoading: boolean;
  selectMic: (deviceId: string, stream: MediaStream) => Promise<void>;
  selectCamera: (deviceId: string, stream: MediaStream, onTrackReplaced?: (track: MediaStreamTrack) => Promise<void>) => Promise<void>;
  refreshDevices: () => Promise<void>;
}

function buildDeviceOptions(
  devices: MediaDeviceInfo[],
  kind: "audioinput" | "videoinput",
  unnamedPrefix: string
): InputDeviceOption[] {
  const seen = new Set<string>();
  let unnamedIndex = 1;
  const result: InputDeviceOption[] = [];

  for (const device of devices) {
    if (device.kind !== kind) continue;
    if (!device.deviceId || device.deviceId === "default" || seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    result.push({
      deviceId: device.deviceId,
      label: device.label.trim() || `${unnamedPrefix} ${unnamedIndex++}`,
      kind,
    });
  }

  return result;
}

function resolveActiveDeviceId(stream: MediaStream, kind: "audio" | "video"): string | null {
  const track = kind === "audio" ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
  return track?.getSettings().deviceId ?? null;
}

export function useCallInputDevices(stream: MediaStream | null): UseCallInputDevicesResult {
  const [micDevices, setMicDevices] = useState<InputDeviceOption[]>([]);
  const [cameraDevices, setCameraDevices] = useState<InputDeviceOption[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const streamRef = useRef(stream);
  streamRef.current = stream;

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setIsLoading(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = buildDeviceOptions(devices, "audioinput", "Microphone");
      const cameras = buildDeviceOptions(devices, "videoinput", "Camera");
      setMicDevices(mics);
      setCameraDevices(cameras);

      const currentStream = streamRef.current;
      if (currentStream) {
        setSelectedMicId(resolveActiveDeviceId(currentStream, "audio"));
        setSelectedCameraId(resolveActiveDeviceId(currentStream, "video"));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (!stream) return;
    setSelectedMicId(resolveActiveDeviceId(stream, "audio"));
    setSelectedCameraId(resolveActiveDeviceId(stream, "video"));
  }, [stream]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      mediaDevices.removeEventListener("devicechange", refreshDevices);
    };
  }, [refreshDevices]);

  const selectMic = useCallback(async (deviceId: string, targetStream: MediaStream) => {
    const capture = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
      video: false,
    });
    const nextTrack = capture.getAudioTracks()[0];
    if (!nextTrack) {
      capture.getTracks().forEach((t) => t.stop());
      return;
    }

    const oldTrack = targetStream.getAudioTracks()[0] ?? null;
    if (oldTrack) {
      targetStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    targetStream.addTrack(nextTrack);
    setSelectedMicId(deviceId);
  }, []);

  const selectCamera = useCallback(async (
    deviceId: string,
    targetStream: MediaStream,
    onTrackReplaced?: (track: MediaStreamTrack) => Promise<void>
  ) => {
    const capture = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    const nextTrack = capture.getVideoTracks()[0];
    if (!nextTrack) {
      capture.getTracks().forEach((t) => t.stop());
      return;
    }

    const oldTrack = targetStream.getVideoTracks()[0] ?? null;
    if (oldTrack) {
      targetStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    targetStream.addTrack(nextTrack);

    if (onTrackReplaced) {
      await onTrackReplaced(nextTrack);
    }

    setSelectedCameraId(deviceId);
  }, []);

  return {
    micDevices,
    cameraDevices,
    selectedMicId,
    selectedCameraId,
    isLoading,
    selectMic,
    selectCamera,
    refreshDevices,
  };
}
