import { describe, expect, it } from "vitest";
import { PlaintextAttachmentMessageSchema } from "../messages.js";

describe("PlaintextAttachmentMessageSchema", () => {
  it("accepts legacy payload without voice-note metadata", () => {
    const parsed = PlaintextAttachmentMessageSchema.safeParse({
      key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      digest: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      attachmentId: "11111111-1111-4111-8111-111111111111",
      mimeType: "application/octet-stream",
      size: 1024,
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts voice-note payload metadata", () => {
    const parsed = PlaintextAttachmentMessageSchema.safeParse({
      key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      digest: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      attachmentId: "22222222-2222-4222-8222-222222222222",
      mimeType: "audio/webm",
      size: 2048,
      kind: "voice_note",
      durationMs: 4200,
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts video-note payload metadata", () => {
    const parsed = PlaintextAttachmentMessageSchema.safeParse({
      key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      digest: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      attachmentId: "33333333-3333-4333-8333-333333333333",
      mimeType: "video/webm",
      size: 4096,
      kind: "video_note",
      durationMs: 15_000,
    });

    expect(parsed.success).toBe(true);
  });
});
