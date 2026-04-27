import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type { KeyPair } from "@seclettr/crypto";
import type {
  LocalGroupCallMediaKey,
  ReceivedGroupCallMediaKey,
} from "@/calls/group/runtime/group-call/media-key";
import type { GroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/group-call/media-key-delivery";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/group-call/media-encryption-negotiation";
import type { GroupSfuClient } from "@/calls/group/runtime/sfu";
import type { GroupCallPanelSession, GroupCallStatus } from "@/calls/group/model/group-call-types";

export interface MediaKeyRotationState {
  lastRotatedAtMs: number | null;
  participantFingerprint: string | null;
}

export interface MediaKeyDeliveryState {
  keyId: string | null;
  attemptedTargetDeviceIds: Set<string>;
  exhaustedTargetDeviceIds: Set<string>;
}

export interface UseGroupCallMediaKeyRuntimeOptions {
  session: GroupCallPanelSession | null;
  status: GroupCallStatus;
  callId: string | null;
  userId: string | null;
  deviceId: string | null;
  identityDhKeyPair: KeyPair | null;
  localRequestedMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  localAdvertisedMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  effectiveMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  effectiveFrameEncryptionEnabled: boolean;
  activeParticipantUserIds: string[];
  activeParticipantDeviceIdsByUserId: Record<string, string[]>;
  expectedRemoteDeviceIds: Set<string>;
  acknowledgedExpectedRemoteDeviceCount: number;
  localMediaKey: LocalGroupCallMediaKey | null;
  setLocalMediaKey: Dispatch<SetStateAction<LocalGroupCallMediaKey | null>>;
  setSharedMediaKeyDeviceCount: Dispatch<SetStateAction<number>>;
  setReceivedMediaKeyCount: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  localMediaKeyRef: MutableRefObject<LocalGroupCallMediaKey | null>;
  sharedMediaKeyTargetsRef: MutableRefObject<Set<string>>;
  receivedMediaKeysRef: MutableRefObject<Record<string, ReceivedGroupCallMediaKey>>;
  mediaKeyRotationStateRef: MutableRefObject<MediaKeyRotationState>;
  mediaKeyDeliveryTrackerRef: MutableRefObject<GroupCallMediaKeyDeliveryTracker | null>;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
  mediaKeyFallbackMessage: string;
}
