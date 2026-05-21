/**
 * group-call-session-types — shared type contracts for the group call session runtime.
 *
 * Owns:
 *   - MediaKeyRotationState — lastRotatedAtMs and participantFingerprint (same as in
 *     media-key/media-key-runtime-shared; duplicated here for session-layer use)
 *   - UseGroupCallSessionRuntimeOptions — full options surface for useGroupCallSessionRuntime,
 *     including all setter callbacks, refs, error messages, and the createInitialMediaKey factory
 *   - UseGroupCallSessionRuntimeResult — handleLeave and handleEndForEveryone action callbacks
 *
 * Does not own any logic — pure type contract file consumed by the session runtime and panel.
 */
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { KeyPair } from "@seclettr/crypto";
import type {
  LocalGroupCallMediaKey,
  ReceivedGroupCallMediaKey,
} from "@/calls/group/runtime/media-key/media-key";
import type { GroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/media-key/media-key-delivery";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/media-key/media-encryption-negotiation";
import type {
  GroupCallRemoteMedia,
  GroupSfuClient,
} from "@/calls/group/runtime/sfu";
import type {
  GroupCallPanelSession,
  GroupCallStatusAction,
} from "@/calls/group/model/group-call-types";

export interface MediaKeyRotationState {
  lastRotatedAtMs: number | null;
  participantFingerprint: string | null;
}

export interface UseGroupCallSessionRuntimeOptions {
  session: GroupCallPanelSession | null;
  callId: string | null;
  userId: string | null;
  callHostUserId: string | null;
  deviceId: string | null;
  identityDhKeyPair: KeyPair | null;
  localAdvertisedMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  strictFrameEncryptionUnsupported: boolean;
  attachInitialStream: (stream: MediaStream) => void;
  cleanupLocalMedia: () => void;
  resetLocalMediaState: () => void;
  resetMinimizedDock: () => void;
  dispatchStatus: Dispatch<GroupCallStatusAction>;
  setCallId: Dispatch<SetStateAction<string | null>>;
  setAccessGranted: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsMinimized: Dispatch<SetStateAction<boolean>>;
  resetCallDuration: () => void;
  setPinnedStageTileId: Dispatch<SetStateAction<string | null>>;
  setActiveParticipantUserIds: Dispatch<SetStateAction<string[]>>;
  setActiveParticipantDeviceIdsByUserId: Dispatch<
    SetStateAction<Record<string, string[]>>
  >;
  setRemoteParticipantMediaModes: Dispatch<
    SetStateAction<Record<string, GroupCallRuntimeMediaEncryptionMode>>
  >;
  setRemoteMedia: Dispatch<SetStateAction<GroupCallRemoteMedia[]>>;
  setCallHostUserId: Dispatch<SetStateAction<string | null>>;
  setLocalMediaKey: Dispatch<SetStateAction<LocalGroupCallMediaKey | null>>;
  setSharedMediaKeyDeviceCount: Dispatch<SetStateAction<number>>;
  setReceivedMediaKeyCount: Dispatch<SetStateAction<number>>;
  localMediaKeyRef: MutableRefObject<LocalGroupCallMediaKey | null>;
  sharedMediaKeyTargetsRef: MutableRefObject<Set<string>>;
  receivedMediaKeysRef: MutableRefObject<Record<string, ReceivedGroupCallMediaKey>>;
  mediaKeyRotationStateRef: MutableRefObject<MediaKeyRotationState>;
  mediaKeyDeliveryTrackerRef: MutableRefObject<GroupCallMediaKeyDeliveryTracker | null>;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
  /** Ref that holds the live local MediaStream so transport-failure reconnects
   *  can reuse the same tracks without re-requesting microphone permission. */
  activeStreamRef: MutableRefObject<MediaStream | null>;
  startErrorMessage: string;
  mediaPermissionErrorMessage: string;
  frameUnsupportedStrictMessage: string;
  createInitialMediaKey: () => LocalGroupCallMediaKey | null;
  onClose: () => void;
}

export interface UseGroupCallSessionRuntimeResult {
  handleLeave: () => Promise<void>;
  handleEndForEveryone: () => Promise<void>;
}
