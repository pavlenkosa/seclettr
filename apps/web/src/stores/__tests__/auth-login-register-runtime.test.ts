import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_PROTOCOL_VERSION } from "@seclettr/protocol";

const mockApiPost = vi.fn();
const mockGenerateIdentityBundle = vi.fn();
const mockGenerateSignedPreKey = vi.fn();
const mockGenerateOneTimePreKeys = vi.fn();
const mockStoreEncrypted = vi.fn();
const mockToBase64Url = vi.fn((value: unknown) => String(value));
const mockGetOrCreateStoredRegistrationId = vi.fn();
const mockGetStoredDeviceRegistration = vi.fn();
const mockSetStoredDeviceRegistration = vi.fn();
const mockMarkCurrentDeviceCryptoMaterialSynced = vi.fn();
const mockToCurrentDeviceCryptoMaterial = vi.fn(() => ({ synced: true }));
const mockIsNativePlatform = vi.fn();
const mockStoreNativeRefreshToken = vi.fn();
const mockPostNativeAuthJson = vi.fn();
const mockClearRatchetSessions = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    post: mockApiPost,
  },
}));

vi.mock("@seclettr/crypto", () => ({
  generateIdentityBundle: mockGenerateIdentityBundle,
  generateOneTimePreKeys: mockGenerateOneTimePreKeys,
  generateSignedPreKey: mockGenerateSignedPreKey,
  loadDecrypted: vi.fn(),
  storeEncrypted: mockStoreEncrypted,
  toBase64Url: mockToBase64Url,
}));

vi.mock("@/lib/current-device-crypto-material", () => ({
  markCurrentDeviceCryptoMaterialSynced: mockMarkCurrentDeviceCryptoMaterialSynced,
}));

vi.mock("@/lib/browser-trust-store", () => ({
  getOrCreateStoredRegistrationId: mockGetOrCreateStoredRegistrationId,
  getStoredDeviceRegistration: mockGetStoredDeviceRegistration,
  setStoredDeviceRegistration: mockSetStoredDeviceRegistration,
}));

vi.mock("@/lib/native-platform", () => ({
  isNativePlatform: mockIsNativePlatform,
}));

vi.mock("@/lib/native-storage", () => ({
  nativeStorageSet: vi.fn(),
  storeNativeRefreshToken: mockStoreNativeRefreshToken,
}));

vi.mock("@/lib/native-auth-http", () => ({
  postNativeAuthJson: mockPostNativeAuthJson,
}));

vi.mock("../auth-device-keys", () => ({
  hasUsableDeviceKeys: vi.fn(),
  normalizeStoredDeviceKeys: vi.fn(),
  toCurrentDeviceCryptoMaterial: mockToCurrentDeviceCryptoMaterial,
}));

vi.mock("../auth-session-restore", () => ({
  clearRatchetSessions: mockClearRatchetSessions,
}));

function createIdentityBundle() {
  return {
    dhKeyPair: {
      publicKey: "dh-public",
      privateKey: "dh-private",
    },
    signingKeyPair: {
      publicKey: "sign-public",
      privateKey: "sign-private",
    },
  };
}

describe("auth-login-register-runtime native auth transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockIsNativePlatform.mockReturnValue(true);
    mockGenerateIdentityBundle.mockResolvedValue(createIdentityBundle());
    mockGenerateSignedPreKey.mockResolvedValue({
      publicKey: "spk-public",
      privateKey: "spk-private",
      signature: "spk-signature",
    });
    mockGenerateOneTimePreKeys.mockResolvedValue([
      { id: 11, publicKey: "otk-public", privateKey: "otk-private" },
    ]);
    mockStoreEncrypted.mockResolvedValue(undefined);
    mockGetOrCreateStoredRegistrationId.mockResolvedValue(321);
    mockGetStoredDeviceRegistration.mockResolvedValue(null);
    mockSetStoredDeviceRegistration.mockResolvedValue(undefined);
    mockStoreNativeRefreshToken.mockResolvedValue(undefined);
    mockPostNativeAuthJson.mockReset();
    mockApiPost.mockReset();
    mockClearRatchetSessions.mockResolvedValue(undefined);

    vi.stubGlobal("crypto", {
      getRandomValues: (values: Uint32Array) => {
        values[0] = 41;
        return values;
      },
    } satisfies Pick<Crypto, "getRandomValues">);
  });

  it("uses native HTTP for register on native platforms", async () => {
    mockPostNativeAuthJson.mockResolvedValue({
      status: 201,
      data: {
        version: AUTH_PROTOCOL_VERSION,
        userId: "11111111-1111-4111-8111-111111111111",
        deviceId: "22222222-2222-4222-8222-222222222222",
        accessToken: "access-token-1",
        refreshToken: "refresh-token-1",
      },
    });

    const { runRegisterFlow } = await import("../auth-login-register-runtime");

    const result = await runRegisterFlow({
      username: "alice",
      password: "password-123",
      deviceName: "Android",
      storageKey: {} as CryptoKey,
      storageKeyVolatile: false,
    });

    expect(mockPostNativeAuthJson).toHaveBeenCalledWith("/auth/register", {
      body: expect.objectContaining({
        version: AUTH_PROTOCOL_VERSION,
        username: "alice",
        password: "password-123",
      }),
    });
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockStoreNativeRefreshToken).toHaveBeenCalledWith("refresh-token-1");
    expect(result.session.accessToken).toBe("access-token-1");
  });

  it("uses native HTTP for fresh login on native platforms", async () => {
    mockPostNativeAuthJson.mockResolvedValue({
      status: 200,
      data: {
        version: AUTH_PROTOCOL_VERSION,
        userId: "33333333-3333-4333-8333-333333333333",
        deviceId: "44444444-4444-4444-8444-444444444444",
        accessToken: "access-token-2",
        refreshToken: "refresh-token-2",
        user: {
          username: "alice",
        },
      },
    });

    const { runLoginFlow } = await import("../auth-login-register-runtime");

    const result = await runLoginFlow({
      username: "alice",
      password: "password-123",
      deviceName: "Android",
      storageKey: {} as CryptoKey,
      storageKeyVolatile: false,
    });

    expect(mockPostNativeAuthJson).toHaveBeenCalledWith("/auth/login", {
      body: expect.objectContaining({
        version: AUTH_PROTOCOL_VERSION,
        username: "alice",
        password: "password-123",
      }),
    });
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockClearRatchetSessions).toHaveBeenCalledWith("login");
    expect(result.session.accessToken).toBe("access-token-2");
  });
});
