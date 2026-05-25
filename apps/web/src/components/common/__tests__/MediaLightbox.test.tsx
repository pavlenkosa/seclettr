// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { MediaLightbox } from "../MediaLightbox";

function dispatchPointerGesture(
  target: HTMLElement,
  type: string,
  options: { clientX: number; clientY: number; pointerType?: string }
) {
  const PointerEventConstructor = globalThis.PointerEvent ?? globalThis.MouseEvent;
  const event = new PointerEventConstructor(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: options.clientX,
    clientY: options.clientY,
  });

  if (!("pointerId" in event)) {
    Object.defineProperty(event, "pointerId", {
      configurable: true,
      value: 1,
    });
  }

  if (!("pointerType" in event)) {
    Object.defineProperty(event, "pointerType", {
      configurable: true,
      value: options.pointerType ?? "touch",
    });
  }

  target.dispatchEvent(event);
}

describe("MediaLightbox", () => {
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

  it("navigates with a touch swipe and suppresses the follow-up content click", async () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    act(() => {
      root.render(
        <MediaLightbox
          url="blob:preview-1"
          mimeType="image/jpeg"
          fileName="photo.jpg"
          currentIndex={1}
          totalCount={3}
          onClose={onClose}
          onDownload={() => {}}
          onNavigate={onNavigate}
        />
      );
    });

    const content = document.body.querySelector<HTMLElement>('[data-testid="media-lightbox-content"]');
    expect(content).not.toBeNull();

    await act(async () => {
      if (!content) return;
      dispatchPointerGesture(content, "pointerdown", { clientX: 240, clientY: 200 });
      dispatchPointerGesture(content, "pointermove", { clientX: 72, clientY: 205 });
      dispatchPointerGesture(content, "pointerup", { clientX: 72, clientY: 205 });
      content.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("supports keyboard navigation and close shortcuts", () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    act(() => {
      root.render(
        <MediaLightbox
          url="blob:preview-1"
          mimeType="image/jpeg"
          fileName="photo.jpg"
          currentIndex={0}
          totalCount={2}
          onClose={onClose}
          onDownload={() => {}}
          onNavigate={onNavigate}
        />
      );
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onNavigate).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders mobile sequence affordances for multi-item galleries", () => {
    act(() => {
      root.render(
        <MediaLightbox
          url="blob:preview-1"
          mimeType="image/jpeg"
          fileName="photo.jpg"
          currentIndex={1}
          totalCount={3}
          onClose={() => {}}
          onDownload={() => {}}
          onNavigate={() => {}}
        />
      );
    });

    expect(document.body.textContent).toContain("message.media.swipeHint");
    expect(
      document.body.querySelectorAll('[class*="mobileSequenceDots"] > span').length
    ).toBe(3);
  });

  it("renders media captions at the bottom of the lightbox", () => {
    act(() => {
      root.render(
        <MediaLightbox
          url="blob:preview-1"
          mimeType="image/jpeg"
          caption="  A quiet caption  "
          fileName="photo.jpg"
          onClose={() => {}}
          onDownload={() => {}}
        />
      );
    });

    expect(document.body.textContent).toContain("A quiet caption");
  });
});
