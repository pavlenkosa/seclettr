export interface WireSendResponse {
  id: string;
  clientId: string;
  createdAt: string;
}

export interface WireInitUploadResponse {
  attachmentId: string;
  uploadUrl: string;
  uploadFields?: Record<string, string>;
  expiresAt: string;
}

export interface WireConfirmUploadResponse {
  attachmentId: string;
  downloadUrl: string;
}
