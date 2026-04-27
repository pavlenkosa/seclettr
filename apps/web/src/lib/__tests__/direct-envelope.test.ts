import { describe, expect, it } from "vitest";
import { toBase64Url } from "@seclettr/crypto";
import {
  decodeDirectEnvelope,
  DIRECT_ENVELOPE_SCHEMA_VERSION,
  encodeDirectEnvelope,
} from "@/lib/direct-envelope";

describe("direct-envelope", () => {
  it("encodes and decodes versioned envelope", () => {
    const header = {
      dh: new Uint8Array(32).fill(7),
      pn: 12,
      n: 34,
    };
    const ciphertext = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = encodeDirectEnvelope(header, ciphertext);
    const decoded = decodeDirectEnvelope(encoded);

    expect(decoded.schemaVersion).toBe(DIRECT_ENVELOPE_SCHEMA_VERSION);
    expect(Array.from(decoded.header.dh)).toEqual(Array.from(header.dh));
    expect(decoded.header.pn).toBe(12);
    expect(decoded.header.n).toBe(34);
    expect(Array.from(decoded.ciphertext)).toEqual(Array.from(ciphertext));
  });

  it("decodes legacy unversioned envelope", () => {
    const raw = new Uint8Array(45);
    raw.set(new Uint8Array(32).fill(9), 0);
    new DataView(raw.buffer).setUint32(32, 1, false);
    new DataView(raw.buffer).setUint32(36, 2, false);
    raw.set(new Uint8Array([90, 91, 92, 93, 94]), 40);

    const decoded = decodeDirectEnvelope(toBase64Url(raw));
    expect(decoded.schemaVersion).toBe(0);
    expect(decoded.header.pn).toBe(1);
    expect(decoded.header.n).toBe(2);
    expect(Array.from(decoded.ciphertext)).toEqual([90, 91, 92, 93, 94]);
  });

  it("rejects unsupported schema version", () => {
    const raw = new Uint8Array(41);
    const encoded = `v999.${toBase64Url(raw)}`;
    expect(() => decodeDirectEnvelope(encoded)).toThrow("DIRECT_ENVELOPE_UNSUPPORTED_VERSION");
  });

  it("rejects corrupted envelope payload", () => {
    expect(() => decodeDirectEnvelope("v1.%%")).toThrow();
    expect(() => decodeDirectEnvelope("v1.AA")).toThrow("DIRECT_ENVELOPE_TOO_SHORT");
  });
});
