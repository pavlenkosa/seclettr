import { describe, expect, it } from "vitest";
import { resolveModalKeyAction } from "@/lib/hooks/modal-focus";

describe("resolveModalKeyAction", () => {
  it("closes on escape", () => {
    expect(
      resolveModalKeyAction({
        key: "Escape",
        shiftKey: false,
        focusableCount: 3,
        activeIndex: 1,
        isFocusInside: true,
      })
    ).toBe("close");
  });

  it("wraps tab from the last item to the first", () => {
    expect(
      resolveModalKeyAction({
        key: "Tab",
        shiftKey: false,
        focusableCount: 3,
        activeIndex: 2,
        isFocusInside: true,
      })
    ).toBe("focus-first");
  });

  it("wraps shift+tab from the first item to the last", () => {
    expect(
      resolveModalKeyAction({
        key: "Tab",
        shiftKey: true,
        focusableCount: 3,
        activeIndex: 0,
        isFocusInside: true,
      })
    ).toBe("focus-last");
  });

  it("re-enters the modal when focus has escaped", () => {
    expect(
      resolveModalKeyAction({
        key: "Tab",
        shiftKey: false,
        focusableCount: 2,
        activeIndex: -1,
        isFocusInside: false,
      })
    ).toBe("focus-first");
  });

  it("falls back to the container when no focusable elements exist", () => {
    expect(
      resolveModalKeyAction({
        key: "Tab",
        shiftKey: false,
        focusableCount: 0,
        activeIndex: -1,
        isFocusInside: true,
      })
    ).toBe("focus-container");
  });
});
