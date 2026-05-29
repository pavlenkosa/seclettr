// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectCallSecurityPanel } from "@/calls/direct/presentation/components/DirectCallSecurityPanel";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("DirectCallSecurityPanel", () => {
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

  it("renders the security status label", () => {
    act(() => {
      root.render(
        <DirectCallSecurityPanel
          onToggle={vi.fn()}
          callSecurityToggleLabel="Close security"
          callSecurityStatusLabel="End-to-end encrypted"
          e2eeActive={true}
          mediaEncryptionMode="frame-v1"
          verificationCode={null}
          verificationHash={null}
          verificationError={null}
        />
      );
    });

    expect(container.textContent).toContain("End-to-end encrypted");
  });

  it("calls onToggle when the close button is clicked", () => {
    const onToggle = vi.fn();
    act(() => {
      root.render(
        <DirectCallSecurityPanel
          onToggle={onToggle}
          callSecurityToggleLabel="Close security"
          callSecurityStatusLabel="Encrypted"
          e2eeActive={false}
          mediaEncryptionMode="transport"
          verificationCode={null}
          verificationHash={null}
          verificationError={null}
        />
      );
    });

    const closeBtn = container.querySelector('button[aria-label="Close security"]');
    expect(closeBtn).not.toBeNull();

    act(() => {
      closeBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
