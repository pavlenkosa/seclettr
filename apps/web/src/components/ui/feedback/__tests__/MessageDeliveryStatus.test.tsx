// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MessageDeliveryStatusIcon,
  type MessageDeliveryStatus,
} from "../MessageDeliveryStatus";

describe("MessageDeliveryStatusIcon", () => {
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

  function renderStatus(status: MessageDeliveryStatus, size?: number): SVGSVGElement {
    act(() => {
      root.render(<MessageDeliveryStatusIcon status={status} {...(size ? { size } : {})} />);
    });
    const svg = container.querySelector("svg");
    if (!svg) throw new Error(`MessageDeliveryStatusIcon rendered no svg for status ${status}`);
    return svg;
  }

  it("renders the spinner glyph with a circle for the sending state", () => {
    const svg = renderStatus("sending");
    expect(svg.querySelector("circle")).not.toBeNull();
  });

  it("renders a single-tick path for the sent state", () => {
    const svg = renderStatus("sent");
    expect(svg.querySelectorAll("path")).toHaveLength(1);
    expect(svg.querySelector("circle")).toBeNull();
  });

  it("renders the double-tick glyph for delivered and read states", () => {
    const delivered = renderStatus("delivered");
    expect(delivered.getAttribute("viewBox")).toBe("0 0 16 14");
    const read = renderStatus("read");
    expect(read.getAttribute("viewBox")).toBe("0 0 16 14");
  });

  it("applies the default 14px size and a custom size", () => {
    const def = renderStatus("sent");
    expect(def.getAttribute("width")).toBe("14");
    const custom = renderStatus("sent", 20);
    expect(custom.getAttribute("width")).toBe("20");
    expect(custom.getAttribute("height")).toBe("20");
  });

  it("keeps every state visually distinct from the sending state", () => {
    const sending = renderStatus("sending").innerHTML;
    const sent = renderStatus("sent").innerHTML;
    const delivered = renderStatus("delivered").innerHTML;
    expect(sent).not.toBe(sending);
    expect(delivered).not.toBe(sent);
  });
});
