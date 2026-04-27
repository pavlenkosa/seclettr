// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaSendDialog, type UseMediaSendDialogResult } from "../useMediaSendDialog";

const { isCompressibleImageMock, compressImageFileMock } = vi.hoisted(() => ({
  isCompressibleImageMock: vi.fn(() => false),
  compressImageFileMock: vi.fn(async (f: File) => f),
}));

vi.mock("../compressImage", () => ({
  isCompressibleImage: isCompressibleImageMock,
  compressImageFile: compressImageFileMock,
}));

function makeFile(name: string, type: string, size = 1024): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

type SendFilesFn = (files: File[], caption?: string) => Promise<void>;

function firstPendingFile(api: UseMediaSendDialogResult) {
  const file = api.pendingFiles[0];
  if (!file) {
    throw new Error("Expected at least one pending file");
  }
  return file;
}

function HookHarness(props: {
  onSendFiles: SendFilesFn;
  capture: (api: UseMediaSendDialogResult) => void;
}) {
  props.capture(useMediaSendDialog({ onSendFiles: props.onSendFiles }));
  return null;
}

describe("useMediaSendDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: UseMediaSendDialogResult | null;
  let onSendFiles: SendFilesFn;

  const createObjectURLSpy = vi.fn((obj: Blob | MediaSource) => `blob:${(obj as File).name ?? "url"}`);
  const revokeObjectURLSpy = vi.fn();

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = null;
    onSendFiles = vi.fn(async () => {});
    isCompressibleImageMock.mockReturnValue(false);
    compressImageFileMock.mockImplementation(async (f: File) => f);

    vi.stubGlobal("URL", {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });
    createObjectURLSpy.mockClear();
    revokeObjectURLSpy.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function render(sendFn = onSendFiles) {
    act(() => {
      root.render(
        <HookHarness
          onSendFiles={sendFn}
          capture={(next) => { api = next; }}
        />
      );
    });
  }

  function rerender() {
    act(() => {
      root.render(
        <HookHarness
          onSendFiles={onSendFiles}
          capture={(next) => { api = next; }}
        />
      );
    });
  }

  it("starts closed with empty state", () => {
    render();
    expect(api!.isOpen).toBe(false);
    expect(api!.pendingFiles).toHaveLength(0);
    expect(api!.caption).toBe("");
    expect(api!.quality).toBe("compressed");
    expect(api!.isSending).toBe(false);
    expect(api!.totalOriginalSize).toBe(0);
    expect(api!.totalCompressedSize).toBe(0);
    expect(api!.hasCompressible).toBe(false);
  });

  it("openDialog opens with provided files", () => {
    render();
    const file = makeFile("photo.jpg", "image/jpeg");

    act(() => {
      api!.openDialog([file]);
    });
    rerender();

    expect(api!.isOpen).toBe(true);
    expect(api!.pendingFiles).toHaveLength(1);
    expect(firstPendingFile(api!).file).toBe(file);
    expect(firstPendingFile(api!).isImage).toBe(true);
    expect(firstPendingFile(api!).isVideo).toBe(false);
    expect(firstPendingFile(api!).size).toBe(file.size);
  });

  it("openDialog ignores empty file arrays", () => {
    render();

    act(() => {
      api!.openDialog([]);
    });
    rerender();

    expect(api!.isOpen).toBe(false);
    expect(api!.pendingFiles).toHaveLength(0);
  });

  it("openDialog accepts multiple files", () => {
    render();
    const f1 = makeFile("doc.pdf", "application/pdf");
    const f2 = makeFile("img.png", "image/png");

    act(() => {
      api!.openDialog([f1, f2]);
    });
    rerender();

    expect(api!.pendingFiles).toHaveLength(2);
    expect(api!.totalOriginalSize).toBe(f1.size + f2.size);
  });

  it("openDialog resets caption", () => {
    render();
    act(() => {
      api!.openDialog([makeFile("a.txt", "text/plain")]);
    });
    rerender();
    act(() => {
      api!.setCaption("hello");
    });
    rerender();
    act(() => {
      api!.openDialog([makeFile("b.txt", "text/plain")]);
    });
    rerender();

    expect(api!.caption).toBe("");
  });

  it("creates object URL for image files", () => {
    render();
    act(() => {
      api!.openDialog([makeFile("photo.jpg", "image/jpeg")]);
    });
    rerender();

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(firstPendingFile(api!).previewUrl).toBeTruthy();
  });

  it("creates object URL for video files", () => {
    render();
    act(() => {
      api!.openDialog([makeFile("clip.mp4", "video/mp4")]);
    });
    rerender();

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(firstPendingFile(api!).isVideo).toBe(true);
    expect(firstPendingFile(api!).previewUrl).toBeTruthy();
  });

  it("does not create object URL for non-media files", () => {
    render();
    act(() => {
      api!.openDialog([makeFile("doc.pdf", "application/pdf")]);
    });
    rerender();

    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(firstPendingFile(api!).previewUrl).toBeNull();
  });

  it("closeDialog resets all state and revokes URLs", () => {
    render();
    act(() => {
      api!.openDialog([makeFile("photo.jpg", "image/jpeg")]);
    });
    rerender();
    act(() => {
      api!.setCaption("test");
    });
    act(() => {
      api!.closeDialog();
    });
    rerender();

    expect(api!.isOpen).toBe(false);
    expect(api!.pendingFiles).toHaveLength(0);
    expect(api!.caption).toBe("");
    expect(api!.quality).toBe("compressed");
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it("removeFile removes the specified file", () => {
    render();
    const f1 = makeFile("a.txt", "text/plain");
    const f2 = makeFile("b.txt", "text/plain");
    act(() => {
      api!.openDialog([f1, f2]);
    });
    rerender();

    const idToRemove = firstPendingFile(api!).id;
    act(() => {
      api!.removeFile(idToRemove);
    });
    rerender();

    expect(api!.pendingFiles).toHaveLength(1);
    expect(firstPendingFile(api!).file).toBe(f2);
  });

  it("removeFile auto-closes dialog when last file is removed", () => {
    render();
    act(() => {
      api!.openDialog([makeFile("a.txt", "text/plain")]);
    });
    rerender();

    const id = firstPendingFile(api!).id;
    act(() => {
      api!.removeFile(id);
    });
    rerender();

    expect(api!.isOpen).toBe(false);
    expect(api!.pendingFiles).toHaveLength(0);
  });

  it("removeFile revokes object URL for image", () => {
    render();
    act(() => {
      api!.openDialog([makeFile("photo.jpg", "image/jpeg")]);
    });
    rerender();

    const id = firstPendingFile(api!).id;
    revokeObjectURLSpy.mockClear();
    act(() => {
      api!.removeFile(id);
    });
    rerender();

    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it("setCaption updates the caption", () => {
    render();
    act(() => {
      api!.openDialog([makeFile("a.txt", "text/plain")]);
    });
    rerender();
    act(() => {
      api!.setCaption("my caption");
    });
    rerender();

    expect(api!.caption).toBe("my caption");
  });

  it("setQuality updates the quality", () => {
    render();
    act(() => {
      api!.openDialog([makeFile("a.txt", "text/plain")]);
    });
    rerender();
    act(() => {
      api!.setQuality("original");
    });
    rerender();

    expect(api!.quality).toBe("original");
  });

  it("confirmSend calls onSendFiles with the pending files", async () => {
    vi.useFakeTimers();
    render();
    const file = makeFile("doc.pdf", "application/pdf");
    act(() => {
      api!.openDialog([file]);
    });
    rerender();

    await act(async () => {
      const sendPromise = api!.confirmSend();
      await vi.runAllTimersAsync();
      await sendPromise;
    });

    expect(onSendFiles).toHaveBeenCalledWith([file], undefined);
    vi.useRealTimers();
  });

  it("confirmSend passes trimmed caption when non-empty", async () => {
    vi.useFakeTimers();
    render();
    const file = makeFile("doc.pdf", "application/pdf");
    act(() => {
      api!.openDialog([file]);
    });
    rerender();
    act(() => {
      api!.setCaption("  hello world  ");
    });
    rerender();

    await act(async () => {
      const sendPromise = api!.confirmSend();
      await vi.runAllTimersAsync();
      await sendPromise;
    });

    expect(onSendFiles).toHaveBeenCalledWith([file], "hello world");
    vi.useRealTimers();
  });

  it("confirmSend passes undefined caption when caption is blank", async () => {
    vi.useFakeTimers();
    render();
    act(() => {
      api!.openDialog([makeFile("doc.pdf", "application/pdf")]);
    });
    rerender();

    await act(async () => {
      const sendPromise = api!.confirmSend();
      await vi.runAllTimersAsync();
      await sendPromise;
    });

    expect(onSendFiles).toHaveBeenCalledWith(expect.any(Array), undefined);
    vi.useRealTimers();
  });

  it("confirmSend does nothing when no pending files", async () => {
    render();
    await act(async () => {
      await api!.confirmSend();
    });
    expect(onSendFiles).not.toHaveBeenCalled();
  });

  it("confirmSend restores dialog and clears isSending on error", async () => {
    vi.useFakeTimers();
    const failingSend = vi.fn(async () => { throw new Error("send failed"); });
    // Keep failingSend active for all renders — do not mix with onSendFiles
    render(failingSend);
    act(() => {
      api!.openDialog([makeFile("doc.pdf", "application/pdf")]);
    });

    await act(async () => {
      const sendPromise = api!.confirmSend();
      await vi.runAllTimersAsync();
      await sendPromise;
    });

    expect(api!.isOpen).toBe(true);
    expect(api!.isSending).toBe(false);
    vi.useRealTimers();
  });

  it("totalOriginalSize sums all pending file sizes", () => {
    render();
    const f1 = makeFile("a.pdf", "application/pdf", 500);
    const f2 = makeFile("b.pdf", "application/pdf", 300);
    act(() => {
      api!.openDialog([f1, f2]);
    });
    rerender();

    expect(api!.totalOriginalSize).toBe(800);
  });

  it("totalCompressedSize is null while compression is pending", () => {
    let resolveFn!: (f: File) => void;
    compressImageFileMock.mockImplementation(
      () => new Promise<File>((res) => { resolveFn = res; })
    );
    isCompressibleImageMock.mockReturnValue(true);

    render();
    act(() => {
      api!.openDialog([makeFile("photo.jpg", "image/jpeg")]);
    });
    rerender();

    expect(api!.totalCompressedSize).toBeNull();
    expect(api!.hasCompressible).toBe(true);

    // Resolve to avoid leaking the promise
    resolveFn(makeFile("photo.jpg", "image/jpeg"));
  });

  it("totalCompressedSize is non-null after all compressions complete", async () => {
    const compressed = makeFile("photo.jpg", "image/jpeg", 512);
    compressImageFileMock.mockResolvedValue(compressed);
    isCompressibleImageMock.mockReturnValue(true);

    render();
    await act(async () => {
      api!.openDialog([makeFile("photo.jpg", "image/jpeg", 1024)]);
    });
    rerender();

    expect(api!.totalCompressedSize).toBe(512);
  });

  it("hasCompressible is false for non-compressible files", () => {
    isCompressibleImageMock.mockReturnValue(false);
    render();
    act(() => {
      api!.openDialog([makeFile("doc.pdf", "application/pdf")]);
    });
    rerender();

    expect(api!.hasCompressible).toBe(false);
  });

  it("confirmSend uses original file when quality is 'original'", async () => {
    vi.useFakeTimers();
    const originalFile = makeFile("photo.jpg", "image/jpeg", 1024);
    const compressedFile = makeFile("photo.jpg", "image/jpeg", 512);
    compressImageFileMock.mockResolvedValue(compressedFile);
    isCompressibleImageMock.mockReturnValue(true);

    render();
    await act(async () => {
      api!.openDialog([originalFile]);
    });
    rerender();
    act(() => {
      api!.setQuality("original");
    });
    rerender();

    await act(async () => {
      const sendPromise = api!.confirmSend();
      await vi.runAllTimersAsync();
      await sendPromise;
    });

    expect(onSendFiles).toHaveBeenCalledWith([originalFile], undefined);
    vi.useRealTimers();
  });

  it("confirmSend uses compressed file when quality is 'compressed' and compression ready", async () => {
    vi.useFakeTimers();
    const originalFile = makeFile("photo.jpg", "image/jpeg", 1024);
    const compressedFile = makeFile("photo.jpg", "image/jpeg", 512);
    compressImageFileMock.mockResolvedValue(compressedFile);
    isCompressibleImageMock.mockReturnValue(true);

    render();
    await act(async () => {
      api!.openDialog([originalFile]);
    });
    rerender();

    await act(async () => {
      const sendPromise = api!.confirmSend();
      await vi.runAllTimersAsync();
      await sendPromise;
    });

    expect(onSendFiles).toHaveBeenCalledWith([compressedFile], undefined);
    vi.useRealTimers();
  });
});
