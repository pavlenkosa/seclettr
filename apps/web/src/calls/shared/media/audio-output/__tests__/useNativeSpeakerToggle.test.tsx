// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNativeSpeakerToggle } from "../useNativeSpeakerToggle";

let nativeSpeakerOn = false;

vi.mock("@/lib/native-audio-route", () => ({
  isNativeAudioRouteSupported: () => true,
  getNativeSpeakerOn: vi.fn(async () => nativeSpeakerOn),
  setNativeSpeaker: vi.fn(async (enabled: boolean) => {
    nativeSpeakerOn = enabled;
  }),
}));

type HookApi = ReturnType<typeof useNativeSpeakerToggle>;

function HookHarness(props: {
  readonly preferredSpeakerOn?: boolean;
  readonly capture: (api: HookApi) => void;
}) {
  const api = useNativeSpeakerToggle({ preferredSpeakerOn: props.preferredSpeakerOn });
  props.capture(api);
  return null;
}

describe("useNativeSpeakerToggle", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: HookApi | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = null;
    nativeSpeakerOn = false;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderHook(preferredSpeakerOn = false) {
    await act(async () => {
      root.render(React.createElement(HookHarness, {
        preferredSpeakerOn,
        capture: (next) => { api = next; },
      }));
    });
  }

  it("keeps earpiece as the default preferred route for voice mode", async () => {
    nativeSpeakerOn = true;

    await renderHook(false);

    expect(api?.supported).toBe(true);
    expect(api?.speakerOn).toBe(false);
    expect(nativeSpeakerOn).toBe(false);
  });

  it("switches to loudspeaker when preferred speaker mode is requested", async () => {
    nativeSpeakerOn = false;

    await renderHook(true);

    expect(api?.speakerOn).toBe(true);
    expect(nativeSpeakerOn).toBe(true);
  });

  it("re-applies the preferred route when the call mode changes", async () => {
    await renderHook(false);
    expect(nativeSpeakerOn).toBe(false);

    await renderHook(true);
    expect(api?.speakerOn).toBe(true);
    expect(nativeSpeakerOn).toBe(true);

    await renderHook(false);
    expect(api?.speakerOn).toBe(false);
    expect(nativeSpeakerOn).toBe(false);
  });
});
