import { isNativePlatform } from "./native-platform";

export interface PickedFile {
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly blob: Blob;
}

interface FilePickerPlugin {
  pickFiles: (opts: {
    types?: string[];
    multiple?: boolean;
    readData?: boolean;
  }) => Promise<{
    files: Array<{
      name: string;
      mimeType: string;
      size: number;
      data?: string;
      path?: string;
      blob?: Blob;
    }>;
  }>;
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>;
}

function getPlugin(): FilePickerPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = cap?.Plugins?.["FilePicker"];
  return plugin ? (plugin as FilePickerPlugin) : null;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Picks files using the native file picker on iOS/Android, or falls back to
 * an `<input type="file">` element on web.
 *
 * Returns an empty array if the user cancels.
 */
export async function pickFiles(opts: {
  accept?: string[];
  multiple?: boolean;
}): Promise<PickedFile[]> {
  const plugin = getPlugin();

  if (plugin) {
    try {
      const result = await plugin.pickFiles({
        types: opts.accept,
        multiple: opts.multiple ?? false,
        readData: true,
      });

      return result.files
        .filter((f) => f.data != null)
        .map((f) => ({
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          blob: base64ToBlob(f.data!, f.mimeType),
        }));
    } catch {
      return [];
    }
  }

  return pickFilesWeb(opts);
}

function pickFilesWeb(opts: {
  accept?: string[];
  multiple?: boolean;
}): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (opts.accept?.length) input.accept = opts.accept.join(",");
    if (opts.multiple) input.multiple = true;

    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      void Promise.all(
        files.map((f) =>
          f.arrayBuffer().then((buf) => ({
            name: f.name,
            mimeType: f.type || "application/octet-stream",
            size: f.size,
            blob: new Blob([buf], { type: f.type || "application/octet-stream" }),
          }))
        )
      ).then(resolve);
    };

    input.oncancel = () => resolve([]);

    input.click();
  });
}
