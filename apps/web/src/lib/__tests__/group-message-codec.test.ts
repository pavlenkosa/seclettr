import { describe, expect, it } from "vitest";
import {
  decodeGroupTextCiphertext,
  encodeGroupTextCiphertext,
  GROUP_EMPTY_SIGNATURE_B64,
} from "@/lib/group-message-codec";
import { toBase64Url } from "@seclettr/crypto";

describe("group-message-codec", () => {
  it("encodes and decodes text payload", () => {
    const ciphertext = encodeGroupTextCiphertext("hello group");
    expect(decodeGroupTextCiphertext(ciphertext)?.text).toBe("hello group");
  });

  it("returns null for malformed payload", () => {
    const malformed = toBase64Url(new TextEncoder().encode(JSON.stringify({ foo: "bar" })));
    expect(decodeGroupTextCiphertext(malformed)).toBeNull();
    expect(decodeGroupTextCiphertext("%%%")).toBeNull();
  });

  it("has deterministic empty signature length", () => {
    expect(typeof GROUP_EMPTY_SIGNATURE_B64).toBe("string");
    expect(GROUP_EMPTY_SIGNATURE_B64.length).toBeGreaterThan(40);
  });
});
