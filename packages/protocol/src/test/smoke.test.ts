import { describe, expect, it } from "vitest";
import { AUTH_PROTOCOL_VERSION, RegisterRequestSchema } from "../auth.js";

describe("@seclettr/protocol smoke", () => {
  it("parses minimal register payload shape", () => {
    const key43 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const sig88 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

    const parsed = RegisterRequestSchema.safeParse({
      version: AUTH_PROTOCOL_VERSION,
      username: "alice_test",
      password: "StrongPass123!",
      device: {
        name: "Test Device",
        identityKeyPublic: key43,
        signingKeyPublic: key43,
        registrationId: 1234,
        signedPreKey: {
          id: 1,
          publicKey: key43,
          signature: sig88,
        },
        oneTimePreKeys: [{ id: 1, publicKey: key43 }],
      },
    });

    expect(parsed.success).toBe(true);
  });
});
