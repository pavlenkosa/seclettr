import { describe, expect, it } from "vitest";
import { isCapacitorOriginAllowed, isDevelopmentCorsOriginAllowed } from "../cors.js";

describe("isCapacitorOriginAllowed", () => {
  it("allows capacitor://localhost for Capacitor custom scheme", () => {
    expect(isCapacitorOriginAllowed("capacitor://localhost")).toBe(true);
  });

  it("allows https://localhost for default Capacitor WebView", () => {
    expect(isCapacitorOriginAllowed("https://localhost")).toBe(true);
  });

  it("rejects http://localhost (not secure)", () => {
    expect(isCapacitorOriginAllowed("http://localhost")).toBe(false);
  });

  it("rejects other origins", () => {
    expect(isCapacitorOriginAllowed("https://seclettr.com")).toBe(false);
    expect(isCapacitorOriginAllowed("https://example.com")).toBe(false);
  });

  it("rejects malformed origins without throwing", () => {
    expect(() => isCapacitorOriginAllowed("not a url")).not.toThrow();
    expect(isCapacitorOriginAllowed("not a url")).toBe(false);
  });
});

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
