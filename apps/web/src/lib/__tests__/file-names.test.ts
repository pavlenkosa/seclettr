import { describe, expect, it } from "vitest";
import { sanitizeDownloadName } from "@/lib/file-names";

describe("sanitizeDownloadName", () => {
  it("removes control chars and path separators", () => {
    expect(sanitizeDownloadName(" ..\\evil/\u0000voice?.ogg ", "attachment.bin")).toBe("evil-voice-.ogg");
  });

  it("falls back when the result becomes empty", () => {
    expect(sanitizeDownloadName("...   ", "attachment.bin")).toBe("attachment.bin");
  });

  it("falls back for reserved Windows device names", () => {
    expect(sanitizeDownloadName("con.txt", "attachment.bin")).toBe("attachment.bin");
  });
});
