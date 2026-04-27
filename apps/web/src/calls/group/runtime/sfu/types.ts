import { Device, type types as MediasoupTypes } from "mediasoup-client";
import type { SfuProducerSource } from "@seclettr/protocol";

export type MediaKind = "audio" | "video";
export type GroupCallMediaEncryptionMode = "off" | "best-effort" | "required";
export type SendTransport = ReturnType<Device["createSendTransport"]>;
export type RecvTransport = ReturnType<Device["createRecvTransport"]>;

export interface ManagedConsumer {
  producerId: string;
  consumer: MediasoupTypes.Consumer;
  userId: string;
  deviceId: string | null;
  kind: MediaKind;
  source: SfuProducerSource | null;
  onTrackEnded: () => void;
}
