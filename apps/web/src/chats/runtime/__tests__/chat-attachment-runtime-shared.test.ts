import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAndDecryptAttachmentBlob,
  resolveChatAttachmentErrorCause,
} from "@/chats/runtime/chat-attachment-runtime-shared";
import type { AttachmentMessageMeta } from "@/stores/messages";

const {
  apiGetMock,
  getUploadLocalSourceMock,
  decryptAttachmentMock,
} = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  getUploadLocalSourceMock: vi.fn(),
  decryptAttachmentMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "ApiError";
    }
  },
  api: {
    get: apiGetMock,
  },
}));

vi.mock("@/lib/upload-progress", () => ({
  getUploadLocalSource: getUploadLocalSourceMock,
}));

vi.mock("@seclettr/crypto", () => ({
  decryptAttachment: decryptAttachmentMock,
  fromBase64Url: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

const attachment: AttachmentMessageMeta = {
  attachmentId: "attachment-1",
  key: "key",
  digest: "digest",
  mimeType: "image/png",
  fileName: "photo.png",
  size: 3,
};

describe("chat-attachment-runtime-shared", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    getUploadLocalSourceMock.mockReset().mockReturnValue(null);
    decryptAttachmentMock.mockReset().mockResolvedValue(new Uint8Array([4, 5, 6]));
  });

  it("uses the local upload blob before requesting inline ciphertext", async () => {
    const localBlob = new Blob([new Uint8Array([7, 8, 9])], { type: "image/png" });
    getUploadLocalSourceMock.mockReturnValue(localBlob);

    const blob = await fetchAndDecryptAttachmentBlob(attachment, {
      messageId: "msg-1",
    });

    expect(blob).toBe(localBlob);
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it("maps repeated attachment storage misses to storagePending", async () => {
    const { ApiError } = await import("@/lib/api");
    vi.useFakeTimers();
    try {
      apiGetMock.mockRejectedValue(new ApiError(409, "Attachment object not ready"));

      const pendingPromise = expect(
        fetchAndDecryptAttachmentBlob(attachment)
      ).rejects.toSatisfy((error: unknown) => {
        return resolveChatAttachmentErrorCause(error, "decryptFailed") === "storagePending";
      });
      await vi.runAllTimersAsync();
      await pendingPromise;
    } finally {
      vi.useRealTimers();
    }
  });
});
