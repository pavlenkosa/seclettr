// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentMessageMeta } from "@/stores/messages";

const {
  apiGetMock,
  decryptAttachmentMock,
  fromBase64UrlMock,
  createObjectUrlMock,
  revokeObjectUrlMock,
  sanitizeDownloadNameMock,
} = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  decryptAttachmentMock: vi.fn(),
  fromBase64UrlMock: vi.fn(() => new Uint8Array([1, 2, 3])),
  createObjectUrlMock: vi.fn(() => "blob:file-attachment"),
  revokeObjectUrlMock: vi.fn(),
  sanitizeDownloadNameMock: vi.fn(() => "safe-file.txt"),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: apiGetMock,
  },
}));

vi.mock("@seclettr/crypto", () => ({
  decryptAttachment: decryptAttachmentMock,
  fromBase64Url: fromBase64UrlMock,
}));

vi.mock("@/lib/file-names", () => ({
  sanitizeDownloadName: sanitizeDownloadNameMock,
}));

import { useFileAttachmentRuntime } from "../useFileAttachmentRuntime";

interface HookValue extends ReturnType<typeof useFileAttachmentRuntime> {}

const attachment: AttachmentMessageMeta = {
  attachmentId: "att-3",
  key: "key",
  digest: "digest",
  mimeType: "application/pdf",
  fileName: " ..\\evil/\u0000voice?.ogg ",
  size: 512,
  kind: "file",
};

function HookHarness(props: {
  hookRef: MutableRefObject<HookValue | null>;
}) {
  props.hookRef.current = useFileAttachmentRuntime({
    attachment,
    messageId: "msg-3",
  });
  return null;
}

describe("useFileAttachmentRuntime", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<HookValue | null>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };
    apiGetMock.mockReset();
    decryptAttachmentMock.mockReset();
    fromBase64UrlMock.mockClear();
    createObjectUrlMock.mockClear();
    revokeObjectUrlMock.mockClear();
    sanitizeDownloadNameMock.mockClear();
    apiGetMock.mockResolvedValue({
      ciphertext: "ciphertext",
      encryptedDigest: "digest",
    });
    decryptAttachmentMock.mockResolvedValue(new Uint8Array([7, 7, 7]));
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("decrypts, downloads with sanitized file name, and marks attachment as downloaded", async () => {
    let createdDownloadName: string | null = null;
    const originalCreateElement = document.createElement.bind(document);
    const clickSpy = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === "a") {
        const anchor = element as HTMLAnchorElement;
        anchor.click = clickSpy;
        Object.defineProperty(anchor, "download", {
          configurable: true,
          get: () => createdDownloadName,
          set: (value: string) => {
            createdDownloadName = value;
          },
        });
      }
      return element;
    }) as typeof document.createElement);

    act(() => {
      root.render(<HookHarness hookRef={hookRef} />);
    });

    await act(async () => {
      await hookRef.current?.decryptAndDownload();
    });

    expect(apiGetMock).toHaveBeenCalledTimes(1);
    expect(decryptAttachmentMock).toHaveBeenCalledTimes(1);
    expect(sanitizeDownloadNameMock).toHaveBeenCalledWith(
      " ..\\evil/\u0000voice?.ogg ",
      "attachment-att-3"
    );
    expect(createdDownloadName).toBe("safe-file.txt");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(hookRef.current?.downloaded).toBe(true);
  });

  it("maps digest mismatch and generic decrypt failure to stable error causes", async () => {
    act(() => {
      root.render(<HookHarness hookRef={hookRef} />);
    });

    apiGetMock.mockResolvedValueOnce({
      ciphertext: "ciphertext",
      encryptedDigest: "other-digest",
    });

    await act(async () => {
      await hookRef.current?.decryptAndDownload();
    });

    expect(hookRef.current?.errorCause).toBe("digestMismatch");

    apiGetMock.mockResolvedValueOnce({
      ciphertext: "ciphertext",
      encryptedDigest: "digest",
    });
    decryptAttachmentMock.mockRejectedValueOnce(new Error("decrypt failed"));

    await act(async () => {
      await hookRef.current?.decryptAndDownload();
    });

    expect(hookRef.current?.errorCause).toBe("decryptFailed");
  });
});
