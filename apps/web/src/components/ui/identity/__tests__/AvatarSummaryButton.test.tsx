// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarSummaryButton } from "../AvatarSummaryButton";

describe("AvatarSummaryButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function getButton(): HTMLButtonElement {
    const button = container.querySelector("button");
    if (!button) throw new Error("AvatarSummaryButton did not render a <button>");
    return button;
  }

  it("renders a non-submitting button with the primary text", () => {
    act(() => {
      root.render(<AvatarSummaryButton avatarLabel="Jane Doe" primaryText="Jane Doe" />);
    });
    const button = getButton();
    expect(button.type).toBe("button");
    expect(button.textContent).toContain("Jane Doe");
  });

  it("renders the optional secondary line when provided", () => {
    act(() => {
      root.render(
        <AvatarSummaryButton avatarLabel="Jane" primaryText="Jane" secondaryText="On a call" />
      );
    });
    expect(getButton().textContent).toContain("On a call");
  });

  it("renders a decorative avatar hidden from assistive tech", () => {
    act(() => {
      root.render(<AvatarSummaryButton avatarLabel="Jane Doe" primaryText="Jane Doe" />);
    });
    const avatar = getButton().querySelector("[aria-hidden='true']");
    expect(avatar?.textContent).toBe("JD");
  });

  it("calls onClick when activated", () => {
    const onClick = vi.fn();
    act(() => {
      root.render(
        <AvatarSummaryButton avatarLabel="Jane" primaryText="Jane" onClick={onClick} />
      );
    });
    act(() => {
      getButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stays silent when disabled", () => {
    const onClick = vi.fn();
    act(() => {
      root.render(
        <AvatarSummaryButton avatarLabel="Jane" primaryText="Jane" onClick={onClick} disabled />
      );
    });
    const button = getButton();
    expect(button.disabled).toBe(true);
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).not.toHaveBeenCalled();
  });
});
