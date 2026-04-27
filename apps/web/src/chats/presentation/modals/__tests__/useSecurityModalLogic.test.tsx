// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  clearSafetyVerificationRecordMock,
  computeSafetyCodesMock,
  getSafetyTrustIntegrityStateMock,
  getSafetyVerificationRecordMock,
  selectPeerDeviceIdMock,
  setSafetyVerificationRecordMock,
} = vi.hoisted(() => ({
  clearSafetyVerificationRecordMock: vi.fn(),
  computeSafetyCodesMock: vi.fn(),
  getSafetyTrustIntegrityStateMock: vi.fn(),
  getSafetyVerificationRecordMock: vi.fn(),
  selectPeerDeviceIdMock: vi.fn(),
  setSafetyVerificationRecordMock: vi.fn(),
}));

vi.mock("@/lib/safety", () => ({
  clearSafetyVerificationRecord: clearSafetyVerificationRecordMock,
  computeSafetyCodes: computeSafetyCodesMock,
  formatFingerprint: vi.fn(),
  getSafetyTrustIntegrityState: getSafetyTrustIntegrityStateMock,
  getSafetyVerificationRecord: getSafetyVerificationRecordMock,
  getSafetyTrustIntegrityStateSync: vi.fn(),
  selectPeerDeviceId: selectPeerDeviceIdMock,
  setSafetyVerificationRecord: setSafetyVerificationRecordMock,
  toBase64Url: (value: Uint8Array) => Buffer.from(value).toString("base64url"),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: (selector: (state: {
    identityDhKeyPair: { publicKey: Uint8Array };
    userId: string;
    deviceId: string;
  }) => unknown) => selector({
    identityDhKeyPair: { publicKey: new Uint8Array(32).fill(7) },
    userId: "self-user",
    deviceId: "self-device",
  }),
}));

import { useSecurityModalLogic } from "../useSecurityModalLogic";

type SecurityModalLogicApi = ReturnType<typeof useSecurityModalLogic>;

function HookHarness(props: {
  hookRef: MutableRefObject<SecurityModalLogicApi | null>;
  onVerificationChanged?: () => void;
  onAcceptPeerIdentityChange?: (deviceId: string) => void | Promise<void>;
}) {
  props.hookRef.current = useSecurityModalLogic({
    recipientUserId: "peer-user",
    peerIdentityKey: "fallback-identity",
    peerIdentityDeviceId: "peer-device",
    peerIdentityByDevice: { "peer-device": "peer-identity" },
    peerIdentityAlertsByDevice: {
      "peer-device": {
        deviceId: "peer-device",
        currentIdentityKey: "peer-identity-updated",
        previousIdentityKey: "peer-identity",
        detectedAt: Date.parse("2026-04-10T00:00:00.000Z"),
      },
    },
    onVerificationChanged: props.onVerificationChanged,
    onAcceptPeerIdentityChange: props.onAcceptPeerIdentityChange,
  });
  return null;
}

describe("useSecurityModalLogic", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<SecurityModalLogicApi | null>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };

    computeSafetyCodesMock.mockReset();
    getSafetyVerificationRecordMock.mockReset();
    getSafetyTrustIntegrityStateMock.mockReset();
    selectPeerDeviceIdMock.mockReset();
    setSafetyVerificationRecordMock.mockReset();
    clearSafetyVerificationRecordMock.mockReset();

    selectPeerDeviceIdMock.mockReturnValue("peer-device");
    computeSafetyCodesMock.mockResolvedValue({
      shortCode: "111 222",
      fullCode: "111 222 333 444",
      safetyHash: "hash-1",
    });
    getSafetyVerificationRecordMock.mockResolvedValue({
      safetyHash: "hash-1",
      verifiedAt: "2026-04-10T10:00:00.000Z",
    });
    getSafetyTrustIntegrityStateMock.mockResolvedValue({
      degradedAt: null,
      issues: [],
    });
    setSafetyVerificationRecordMock.mockResolvedValue({
      verifiedAt: "2026-04-10T11:00:00.000Z",
    });
    clearSafetyVerificationRecordMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("loads trust state, peer selection, safety codes, and matching verification record", async () => {
    await act(async () => {
      root.render(<HookHarness hookRef={hookRef} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(selectPeerDeviceIdMock).toHaveBeenCalled();
    expect(computeSafetyCodesMock).toHaveBeenCalledWith(
      Buffer.alloc(32, 7).toString("base64url"),
      "peer-identity-updated",
      "self-user",
      "peer-user"
    );
    expect(getSafetyVerificationRecordMock).toHaveBeenCalledWith(
      "self-user",
      "self-device",
      "peer-user",
      "peer-device"
    );
    expect(hookRef.current?.effectivePeerDeviceId).toBe("peer-device");
    expect(hookRef.current?.verifiedAt).toBe("2026-04-10T10:00:00.000Z");
    expect(hookRef.current?.codes?.safetyHash).toBe("hash-1");
  });

  it("marks verification, accepts the new peer identity, and notifies listeners", async () => {
    const onVerificationChanged = vi.fn();
    const onAcceptPeerIdentityChange = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <HookHarness
          hookRef={hookRef}
          onVerificationChanged={onVerificationChanged}
          onAcceptPeerIdentityChange={onAcceptPeerIdentityChange}
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await hookRef.current?.markVerified();
    });

    expect(setSafetyVerificationRecordMock).toHaveBeenCalledWith(
      "self-user",
      "self-device",
      "peer-user",
      "hash-1",
      "peer-device"
    );
    expect(onAcceptPeerIdentityChange).toHaveBeenCalledWith("peer-device");
    expect(onVerificationChanged).toHaveBeenCalledTimes(1);
    expect(hookRef.current?.verifiedAt).toBe("2026-04-10T11:00:00.000Z");
  });
});
