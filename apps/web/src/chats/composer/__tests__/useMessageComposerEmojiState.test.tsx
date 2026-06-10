// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageComposerEmojiState } from "../useMessageComposerEmojiState";
import type { GifResult } from "../composer-gif-service";

const searchGifsMock = vi.fn<(query: string) => Promise<GifResult[]>>();

vi.mock("../composer-gif-service", () => ({
  isGifSupportEnabled: () => true,
  searchGifs: (query: string) => searchGifsMock(query),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type HookValue = ReturnType<typeof useMessageComposerEmojiState>;

function HookHarness(props: { hookRef: MutableRefObject<HookValue | null> }) {
  const textareaRef = {
    current: document.createElement("textarea"),
  } as MutableRefObject<HTMLTextAreaElement | null>;

  props.hookRef.current = useMessageComposerEmojiState({
    sending: false,
    isRecording: false,
    textareaRef,
    syncTextareaSelection: () => {},
    insertTextAtSelection: () => {},
    clearComposerError: () => {},
    supportsGif: true,
  });

  return null;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useMessageComposerEmojiState GIF search", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<HookValue | null>;

  beforeEach(() => {
    vi.useFakeTimers();
    searchGifsMock.mockReset();
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };

    act(() => {
      root.render(<HookHarness hookRef={hookRef} />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("ignores stale GIF results after the query changes", async () => {
    const firstSearch = createDeferred<GifResult[]>();
    const secondSearch = createDeferred<GifResult[]>();

    searchGifsMock
      .mockImplementationOnce(() => firstSearch.promise)
      .mockImplementationOnce(() => secondSearch.promise);

    act(() => {
      hookRef.current?.handleEmojiToggleOpen();
      hookRef.current?.setGifMode(true);
      hookRef.current?.setGifQuery("cat");
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(searchGifsMock).toHaveBeenNthCalledWith(1, "cat");
    expect(hookRef.current?.isGifLoading).toBe(true);

    act(() => {
      hookRef.current?.setGifQuery("dog");
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(searchGifsMock).toHaveBeenNthCalledWith(2, "dog");

    await act(async () => {
      firstSearch.resolve([
        {
          id: "stale-cat",
          url: "https://example.test/cat.gif",
          sendUrl: "https://example.test/cat-send.gif",
          previewUrl: "https://example.test/cat-preview.gif",
          width: 200,
          height: 150,
          title: "Cat",
        },
      ]);
      await flushPromises();
    });

    expect(hookRef.current?.gifResults).toEqual([]);
    expect(hookRef.current?.isGifLoading).toBe(true);

    await act(async () => {
      secondSearch.resolve([
        {
          id: "fresh-dog",
          url: "https://example.test/dog.gif",
          sendUrl: "https://example.test/dog-send.gif",
          previewUrl: "https://example.test/dog-preview.gif",
          width: 200,
          height: 150,
          title: "Dog",
        },
      ]);
      await flushPromises();
    });

    expect(hookRef.current?.gifResults.map((gif) => gif.id)).toEqual(["fresh-dog"]);
    expect(hookRef.current?.isGifLoading).toBe(false);
  });
});
