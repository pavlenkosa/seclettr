const MAX_SAFE_FILE_NAME_LENGTH = 120;
const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

function isTrimUnsafeEdgeChar(char: string): boolean {
  return char === "." || char === " " || char === "-";
}

function trimUnsafeEdges(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isTrimUnsafeEdgeChar(value[start]!)) {
    start += 1;
  }
  while (end > start && isTrimUnsafeEdgeChar(value[end - 1]!)) {
    end -= 1;
  }
  return value.slice(start, end);
}

function trimToSafeLength(fileName: string): string {
  if (fileName.length <= MAX_SAFE_FILE_NAME_LENGTH) return fileName;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= fileName.length - 1) {
    return fileName.slice(0, MAX_SAFE_FILE_NAME_LENGTH);
  }

  const extension = fileName.slice(dotIndex);
  const baseMaxLength = Math.max(1, MAX_SAFE_FILE_NAME_LENGTH - extension.length);
  return `${fileName.slice(0, baseMaxLength)}${extension}`;
}

export function sanitizeDownloadName(fileName: string | undefined, fallbackName: string): string {
  const candidate = (fileName ?? fallbackName)
    // eslint-disable-next-line no-control-regex
    .replaceAll(/[\u0000-\u001f\u007f]+/g, "")
    .replaceAll(/[\\/:"*?<>|]+/g, "-")
    .replaceAll(/\s+/g, " ")
    .trim();

  const normalizedCandidate = trimUnsafeEdges(candidate);

  const trimmed = trimToSafeLength(normalizedCandidate || fallbackName);
  const dotIndex = trimmed.lastIndexOf(".");
  const baseName = (dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed).toUpperCase();

  if (!trimmed || WINDOWS_RESERVED_NAMES.has(baseName)) {
    return fallbackName;
  }

  return trimmed;
}
