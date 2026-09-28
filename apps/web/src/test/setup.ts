import { vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => ({})),
  Capacitor: { isNativePlatform: false, platform: "web", isPluginAvailable: () => false },
  CapacitorHttp: { request: vi.fn(), get: vi.fn(), post: vi.fn() },
}));
