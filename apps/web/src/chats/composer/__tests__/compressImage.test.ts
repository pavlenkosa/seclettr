// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { formatBytes, isCompressibleImage } from "../compressImage";

describe("isCompressibleImage", () => {
  it.each([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "image/avif",
  ])("returns true for %s", (type) => {
    const file = new File([""], "img", { type });
    expect(isCompressibleImage(file)).toBe(true);
  });

  it.each([
    "image/gif",
    "image/svg+xml",
    "video/mp4",
    "application/pdf",
    "text/plain",
    "audio/webm",
  ])("returns false for %s", (type) => {
    const file = new File([""], "file", { type });
    expect(isCompressibleImage(file)).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats bytes below 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats bytes in KB range", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("formats bytes in MB range", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
});
