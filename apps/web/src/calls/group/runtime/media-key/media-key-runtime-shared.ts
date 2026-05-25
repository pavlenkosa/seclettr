/**
 * group-call-media-key-runtime-shared — shared type contracts for the media-key runtime hooks.
 *
 * Owns:
 *   - MediaKeyRotationState — tracks lastRotatedAtMs and participantFingerprint for rotation logic
 *   - MediaKeyDeliveryState — tracks per-keyId delivery attempt and exhaustion sets
 *   - UseGroupCallMediaKeyRuntimeOptions — full options contract shared by
 *     useGroupCallMediaKeyRuntime, useGroupCallLocalMediaKeySync, and useGroupCallMediaKeyExchange
 *
 * Does not own any logic — this is a pure type contract file. All implementations
 * are in the consuming hooks and helpers.
 */
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type { KeyPair } from "@seclettr/crypto";
import type {
  LocalGroupCallMediaKey,
  ReceivedGroupCallMediaKey,
} from "./media-key";
import type { GroupCallMediaKeyDeliveryTracker } from "./media-key-delivery";
import type { GroupCallRuntimeMediaEncryptionMode } from "./media-encryption-negotiation";
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
