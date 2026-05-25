// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CallMediaAvatarFallback,
  CallMediaSurface,
} from "@/calls/shared/presentation/CallMediaSurface";

describe("CallMediaSurface", () => {
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
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("renders fallback shell and overlay slots", () => {
    act(() => {
      root.render(
        <CallMediaSurface
          className="surface"
          fallback={(
            <CallMediaAvatarFallback
              label="Seclettr Peer"
              initials="SP"
              className="fallback"
              avatarClassName="avatar"
            />
          )}
          overlayTopStart={<div className="badge">Screen</div>}
          overlayBottom={<div className="meta">Peer meta</div>}
        />
      );
    });

    expect(container.querySelector(".surface")).not.toBeNull();
    expect(container.querySelector(".fallback")).not.toBeNull();
    expect(container.querySelector(".avatar")).not.toBeNull();
    expect(container.querySelector(".badge")?.textContent).toBe("Screen");
    expect(container.querySelector(".meta")?.textContent).toBe("Peer meta");
  });

  it("supports keyboard activation and keeps secondary action isolated", () => {
    const onSelect = vi.fn();
    const onSecondaryAction = vi.fn();

    act(() => {
      root.render(
        <CallMediaSurface
          as="article"
          className="surface"
          interactiveClassName="interactive"
          fallback={<div className="fallback">Audio only</div>}
          onSelect={onSelect}
          interactiveLabel="Focus remote content"
          onSecondaryAction={onSecondaryAction}
          secondaryActionLabel="Stop viewing"
          secondaryActionClassName="secondary"
        />
      );
    });

    const surface = container.querySelector(".surface");
    const secondaryAction = container.querySelector(".secondary");

    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("role")).toBe("button");
    expect(surface?.getAttribute("aria-label")).toBe("Focus remote content");

    act(() => {
      surface?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      surface?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      secondaryAction?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
  });

  it("renders a stable audio-presence ring for avatar fallbacks", () => {
    act(() => {
      root.render(
        <CallMediaAvatarFallback
          label="Seclettr Peer"
          initials="SP"
          className="fallback"
          avatarClassName="avatar"
          pulseClassName="pulse"
          pulseActiveClassName="pulse-active"
          hasAudio
          isSpeaking
          speakingVariant="primary-stage"
        />
      );
    });

    const pulse = container.querySelector(".pulse");
    const fallback = container.querySelector(".fallback");
    expect(pulse).not.toBeNull();
    expect(pulse?.className).toContain("pulse-active");
    expect(fallback?.getAttribute("data-audio-present")).toBe("true");
    expect(fallback?.getAttribute("data-speaking")).toBe("true");
    expect(fallback?.getAttribute("data-speaking-variant")).toBe("primary-stage");
  });
});
