/**
 * Thin wrapper around @capacitor/camera for photo capture and gallery picking.
 *
 * Returns File objects so callers can treat them the same as files from
 * the native FilePicker or a web <input type="file">.
 */
import { isNativePlatform } from "./native-platform";

type CameraResultType = "base64" | "uri" | "dataUrl";
type CameraSource = "CAMERA" | "PHOTOS" | "PROMPT";

interface CameraPlugin {
  getPhoto(opts: {
    quality: number;
    resultType: CameraResultType;
    source: CameraSource;
    saveToGallery?: boolean;
    correctOrientation?: boolean;
  }): Promise<{
    base64String?: string;
    dataUrl?: string;
    format: string;
    webPath?: string;
  }>;
  pickImages(opts: {
    quality: number;
    limit?: number;
    presentationStyle?: string;
  }): Promise<{
    photos: Array<{
      base64String?: string;
      dataUrl?: string;
      format: string;
      webPath?: string;
    }>;
  }>;
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>;
}

function getPlugin(): CameraPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["Camera"];
  return plugin ? (plugin as CameraPlugin) : null;
}

function dataUrlToFile(dataUrl: string, format: string): File {
  const mimeType = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const ext = format === "jpeg" ? "jpg" : format;
  return new File([blob], `photo_${Date.now()}.${ext}`, { type: mimeType });
}

/**
 * Opens the device camera and returns the captured photo as a File.
 * Returns null if the user cancels or if not on a native platform.
 */
export async function capturePhoto(): Promise<File | null> {
  const plugin = getPlugin();
  if (!plugin) return null;

  try {
    const result = await plugin.getPhoto({
      quality: 85,
      resultType: "dataUrl",
      source: "CAMERA",
      saveToGallery: false,
      correctOrientation: true,
    });
    const url = result.dataUrl;
    if (!url) return null;
    return dataUrlToFile(url, result.format);
  } catch {
    // User cancelled or permission denied
    return null;
  }
}

/**
 * Opens the native photo gallery picker and returns the selected photos as Files.
 * Returns an empty array if the user cancels or if not on a native platform.
 */
export async function pickPhotos(limit = 10): Promise<File[]> {
  const plugin = getPlugin();
  if (!plugin) return [];

  try {
    const result = await plugin.pickImages({
      quality: 85,
      limit,
      presentationStyle: "fullScreen",
    });

    const files: File[] = [];
    for (const photo of result.photos) {
      // dataUrl is only populated when the plugin is configured with
      // resultType:"dataUrl", which pickImages does not support.
      // On Android the plugin always returns webPath (a Capacitor local-server
      // URL like http://localhost/_capacitor_file_/...) — fetch it to get the blob.
      if (photo.dataUrl) {
        files.push(dataUrlToFile(photo.dataUrl, photo.format));
        continue;
      }
      if (photo.webPath) {
        try {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          const ext = photo.format === "jpeg" ? "jpg" : photo.format;
          const mimeType = blob.type || (photo.format === "jpeg" ? "image/jpeg" : `image/${photo.format}`);
          files.push(new File([blob], `photo_${Date.now()}.${ext}`, { type: mimeType }));
        } catch {
          // Failed to fetch this photo — skip it.
        }
        continue;
      }
    }
    return files;
  } catch {
    // User cancelled or permission denied
    return [];
  }
}
