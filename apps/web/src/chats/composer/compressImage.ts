/**
 * Client-side image compression via Canvas.
 * Falls back to HTMLCanvasElement when OffscreenCanvas is unavailable.
 */

/** Max pixel size (longest dimension) for compressed images. */
const MAX_DIMENSION = 1920;
/** JPEG quality factor for compressed output. */
const JPEG_QUALITY = 0.85;

const COMPRESSIBLE_RE = /^image\/(jpeg|jpg|png|webp|bmp|tiff|avif)/;

/** Returns true if the file is an image that can be re-encoded. */
export function isCompressibleImage(file: File): boolean {
  return COMPRESSIBLE_RE.test(file.type);
}

/** Compress a single image File. Returns the original if compression is not possible. */
export async function compressImageFile(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);

  let blob: Blob;
  try {
    if (typeof OffscreenCanvas === "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, 0, 0, newW, newH);
      blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
          "image/jpeg",
          JPEG_QUALITY,
        );
      });
    } else {
      const canvas = new OffscreenCanvas(newW, newH);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, 0, 0, newW, newH);
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
    }
  } catch {
    bitmap.close();
    return file;
  }

  bitmap.close();

  // If compression made the file larger, return the original.
  if (blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^/.]+$/, "");
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

/** Formats bytes to a human-readable string (B / KB / MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
