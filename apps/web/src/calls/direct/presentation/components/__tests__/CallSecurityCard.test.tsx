// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallSecurityCard } from "@/calls/direct/presentation/components/CallSecurityCard";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("CallSecurityCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("shows pending subtitle when e2ee is not yet active", () => {
    act(() => {
      root.render(
        <CallSecurityCard
          e2eeActive={false}
          mediaEncryptionMode="transport"
          verificationCode={null}
          verificationHash={null}
          verificationError={null}
        />
      );
    });

    expect(container.textContent).toContain("callSecurity.pendingSubtitle");
    expect(container.querySelector('[aria-label="callSecurity.codeLabel"]')).toBeNull();
  });

  it("shows waiting-for-code text when e2ee is active but code is absent", () => {
    act(() => {
      root.render(
        <CallSecurityCard
          e2eeActive={true}
          mediaEncryptionMode="frame-v1"
          verificationCode={null}
          verificationHash={null}
          verificationError={null}
        />
      );
    });

    expect(container.textContent).toContain("callSecurity.waitingCode");
  });

  it("shows verificationError text when provided", () => {
    act(() => {
      root.render(
        <CallSecurityCard
          e2eeActive={true}
          mediaEncryptionMode="frame-v1"
          verificationCode={null}
          verificationHash={null}
          verificationError="Crypto mismatch"
        />
      );
    });

    expect(container.textContent).toContain("Crypto mismatch");
  });

  it("renders emoji row when verification code has 4 numeric groups", () => {
    act(() => {
      root.render(
        <CallSecurityCard
          e2eeActive={true}
          mediaEncryptionMode="frame-v1"
          verificationCode="10 20 30 40"
          verificationHash={null}
          verificationError={null}
        />
      );
    });

    const emojiRow = container.querySelector('[aria-label="callSecurity.codeLabel"]');
    expect(emojiRow).not.toBeNull();
    expect(container.textContent).toContain("callSecurity.hintAction");
  });

  it("toggles details section when details button is clicked", () => {
    act(() => {
      root.render(
        <CallSecurityCard
          e2eeActive={true}
          mediaEncryptionMode="frame-v1"
          verificationCode="1 2 3 4"
          verificationHash="abc123def456000"
          verificationError={null}
        />
      );
    });

    const detailsBtn = container.querySelector('button[aria-expanded="false"]');
    expect(detailsBtn).not.toBeNull();

    act(() => {
      detailsBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    expect(container.textContent).toContain("abc123def456");
  });
});
