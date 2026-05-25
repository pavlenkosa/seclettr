import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import type {
  WireConfirmUploadResponse,
  WireInitUploadResponse,
} from "./plain-wire-shared";

export interface UploadPlainAttachmentOptions {
  file: File;
  logPrefix: string;
  onProgress?: (progress: number) => void;
}

export interface UploadedPlainAttachment {
  attachmentId: string;
  downloadUrl: string;
}

export function cleanupPlainAttachmentOrphan(attachmentId: string, logPrefix: string): void {
  api.delete(`/plain/attachments/${encodeURIComponent(attachmentId)}`)
    .catch((cleanupErr) => logger.warn(`${logPrefix} cancel orphan attachment failed`, cleanupErr));
}

export async function uploadPlainAttachment(
  options: UploadPlainAttachmentOptions
): Promise<UploadedPlainAttachment> {
  const { file, logPrefix, onProgress } = options;
  let initializedAttachmentId: string | null = null;

  try {
    const initResp = await api.post<WireInitUploadResponse>("/plain/attachments/init", {
      size: file.size,
      contentType: file.type,
      fileName: file.name,
    });
    const { attachmentId, uploadUrl, uploadFields } = initResp;
    initializedAttachmentId = attachmentId;

    await uploadPlainAttachmentBytes(file, uploadUrl, uploadFields, onProgress);
    onProgress?.(92);

    const confirmResp = await api.post<WireConfirmUploadResponse>(
      `/plain/attachments/${encodeURIComponent(attachmentId)}/confirm`
    );
    onProgress?.(96);

    return { attachmentId, downloadUrl: confirmResp.downloadUrl };
  } catch (err) {
    if (initializedAttachmentId) {
      cleanupPlainAttachmentOrphan(initializedAttachmentId, logPrefix);
    }
    throw err;
  }
}

function uploadPlainAttachmentBytes(
  file: File,
  uploadUrl: string,
  uploadFields: Record<string, string> | undefined,
  onProgress: ((progress: number) => void) | undefined
): Promise<void> {
  if (uploadFields && Object.keys(uploadFields).length > 0) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(uploadFields)) {
      formData.append(key, value);
    }
    formData.append("file", file);
    return sendUploadRequest({
      file,
      formData,
      method: "POST",
      uploadUrl,
      onProgress,
      loadErrorMessage: (status) => `S3 upload failed: ${status}`,
      networkErrorMessage: "S3 upload network error",
    });
  }

  return sendUploadRequest({
    file,
    method: "PUT",
    uploadUrl,
    onProgress,
    loadErrorMessage: (status) => `Upload failed: ${status}`,
    networkErrorMessage: "Upload network error",
  });
}

interface SendUploadRequestOptions {
  file: File;
  method: "POST" | "PUT";
  uploadUrl: string;
  onProgress?: (progress: number) => void;
  formData?: FormData;
  loadErrorMessage: (status: number) => string;
  networkErrorMessage: string;
}

function sendUploadRequest(options: SendUploadRequestOptions): Promise<void> {
  const {
    file,
    method,
    uploadUrl,
    onProgress,
    formData,
    loadErrorMessage,
    networkErrorMessage,
  } = options;

  const xhr = new XMLHttpRequest();
  return new Promise<void>((resolve, reject) => {
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 90));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(loadErrorMessage(xhr.status)));
      }
    };
    xhr.onerror = () => reject(new Error(networkErrorMessage));
    xhr.open(method, uploadUrl);
    if (method === "PUT") {
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
      return;
    }
    xhr.send(formData);
  });
}
