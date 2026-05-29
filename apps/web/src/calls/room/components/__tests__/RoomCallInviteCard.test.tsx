// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomCallInviteCard } from "@/calls/room/components/RoomCallInviteCard";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("RoomCallInviteCard", () => {
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

  it("renders the invite URL inside a code element", () => {
    act(() => {
      root.render(
        <RoomCallInviteCard
          inviteUrl="https://s.lettr/invite/abc123"
          copied={false}
          onCopy={vi.fn()}
        />
      );
    });

    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain("https://s.lettr/invite/abc123");
  });

  it("shows the copy aria-label when not yet copied", () => {
    act(() => {
      root.render(
        <RoomCallInviteCard
          inviteUrl="https://s.lettr/invite/abc123"
          copied={false}
          onCopy={vi.fn()}
        />
      );
    });

    const btn = container.querySelector('button[aria-label="room.call.invite.copyAriaLabel"]');
    expect(btn).not.toBeNull();
  });

  it("switches to the copied aria-label after copying", () => {
    act(() => {
      root.render(
        <RoomCallInviteCard
          inviteUrl="https://s.lettr/invite/abc123"
          copied={true}
          onCopy={vi.fn()}
        />
      );
    });

    const btn = container.querySelector('button[aria-label="room.call.invite.copiedAriaLabel"]');
    expect(btn).not.toBeNull();
  });

  it("calls onCopy when the button is clicked", () => {
    const onCopy = vi.fn();
    act(() => {
      root.render(
        <RoomCallInviteCard
          inviteUrl="https://s.lettr/invite/abc123"
          copied={false}
          onCopy={onCopy}
        />
      );
    });

    const btn = container.querySelector("button");
    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
