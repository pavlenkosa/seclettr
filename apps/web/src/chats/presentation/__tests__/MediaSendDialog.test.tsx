// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import { MediaSendDialog } from "../MediaSendDialog";
import type { PendingFile } from "../../composer/useMediaSendDialog";

function createPendingFile(): PendingFile {
  const file = new File(["hello"], "hello.txt", { type: "text/plain" });
  return {
    id: "file-1",
    file,
    previewUrl: null,
    isImage: false,
    isVideo: false,
    canCompress: false,
    size: file.size,
    compressed: null,
  };
}

describe("MediaSendDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
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
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("does not close when the caption receives a space key", () => {
    const closeDialog = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <MediaSendDialog
            pendingFiles={[createPendingFile()]}
            caption=""
            quality="original"
            isSending={false}
            totalOriginalSize={5}
            totalCompressedSize={5}
            hasCompressible={false}
            canConfirmSend
            removeFile={() => {}}
            setCaption={() => {}}
            setQuality={() => {}}
            confirmSend={async () => {}}
            closeDialog={closeDialog}
          />
        </I18nProvider>
      );
    });

    const dialog = document.body.querySelector("dialog");
    const caption = document.body.querySelector("textarea");
    expect(dialog?.parentElement?.tagName).toBe("DIV");
    expect(caption).not.toBeNull();

    act(() => {
      caption?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(closeDialog).not.toHaveBeenCalled();
  });
});
