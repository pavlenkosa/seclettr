// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomCallStateNotice } from "@/calls/room/components/RoomCallStateNotice";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("RoomCallStateNotice", () => {
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

  it("renders a live status region in connecting state", () => {
    act(() => {
      root.render(
        <RoomCallStateNotice variant="connecting" errorMessage={null} onLeave={vi.fn()} />
      );
    });

    const status = container.querySelector('[role="status"][aria-live="polite"]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toContain("group.call.starting");
  });

  it("renders an alert with the error message in error state", () => {
    act(() => {
      root.render(
        <RoomCallStateNotice variant="error" errorMessage="Connection lost" onLeave={vi.fn()} />
      );
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(container.textContent).toContain("Connection lost");
  });

  it("falls back to the i18n key when errorMessage is null in error state", () => {
    act(() => {
      root.render(
        <RoomCallStateNotice variant="error" errorMessage={null} onLeave={vi.fn()} />
      );
    });

    expect(container.textContent).toContain("room.call.error.connection");
  });

  it("calls onLeave when the leave button is clicked in error state", () => {
    const onLeave = vi.fn();
    act(() => {
      root.render(
        <RoomCallStateNotice variant="error" errorMessage="Disconnected" onLeave={onLeave} />
      );
    });

    const btn = container.querySelector("button");
    expect(btn).not.toBeNull();

    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
