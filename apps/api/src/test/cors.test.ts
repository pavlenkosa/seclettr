import { describe, expect, it } from "vitest";
import { isDevelopmentCorsOriginAllowed } from "../cors.js";

describe("development CORS origin validation", () => {
  it("allows explicitly configured origins", () => {
    expect(
      isDevelopmentCorsOriginAllowed("http://localhost:5173", [
        "http://localhost:5173",
      ])
    ).toBe(true);
  });

  it("allows HTTPS private-network origins for local device testing", () => {
    expect(isDevelopmentCorsOriginAllowed("https://localhost", [])).toBe(true);
    expect(isDevelopmentCorsOriginAllowed("https://192.168.1.25", [])).toBe(true);
    expect(isDevelopmentCorsOriginAllowed("https://10.0.0.42", [])).toBe(true);
    expect(isDevelopmentCorsOriginAllowed("https://172.16.8.10", [])).toBe(true);
  });

  it("rejects malformed origins without throwing", () => {
    expect(() => isDevelopmentCorsOriginAllowed("not a url", [])).not.toThrow();
    expect(isDevelopmentCorsOriginAllowed("not a url", [])).toBe(false);
  });

  it("rejects insecure LAN origins over plain HTTP", () => {
    expect(isDevelopmentCorsOriginAllowed("http://192.168.1.25", [])).toBe(false);
  });
});
