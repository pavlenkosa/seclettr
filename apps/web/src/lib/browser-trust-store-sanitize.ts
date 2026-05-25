export const BROWSER_TRUST_INTEGRITY_ISSUES = [
  "persisted_registration_id_invalid",
  "persisted_device_registration_invalid",
  "persisted_safety_verification_invalid",
  "persisted_peer_identity_invalid",
  "legacy_registration_id_invalid",
  "legacy_device_registration_invalid",
  "legacy_safety_verification_invalid",
  "legacy_peer_identity_invalid",
] as const;

export interface StoredDeviceRegistration {
  deviceId: string;
  registrationId: number;
  spkId: number;
}

export interface StoredSafetyVerificationRecord {
  safetyHash: string;
  verifiedAt: string;
}

export type BrowserTrustIntegrityIssue =
  (typeof BROWSER_TRUST_INTEGRITY_ISSUES)[number];

export interface BrowserTrustIntegrityState {
  degradedAt: string | null;
  issues: BrowserTrustIntegrityIssue[];
}

export interface BrowserTrustStore {
  version: 1;
  registrationId?: number;
  deviceRegistrationsByUsername: Record<string, StoredDeviceRegistration>;
  safetyVerificationRecordsByKey: Record<string, StoredSafetyVerificationRecord>;
  peerIdentityCacheByDevice: Record<string, string>;
  integrityIssues: BrowserTrustIntegrityIssue[];
  integrityDegradedAt?: string;
}

export function createEmptyTrustStore(): BrowserTrustStore {
  return {
    version: 1,
    deviceRegistrationsByUsername: {},
    safetyVerificationRecordsByKey: {},
    peerIdentityCacheByDevice: {},
    integrityIssues: [],
  };
}

export function cloneTrustStore(store: BrowserTrustStore): BrowserTrustStore {
  return {
    version: 1,
    registrationId: store.registrationId,
    deviceRegistrationsByUsername: { ...store.deviceRegistrationsByUsername },
    safetyVerificationRecordsByKey: { ...store.safetyVerificationRecordsByKey },
    peerIdentityCacheByDevice: { ...store.peerIdentityCacheByDevice },
    integrityIssues: [...store.integrityIssues],
    integrityDegradedAt: store.integrityDegradedAt,
  };
}

export function isValidRegistrationId(value: unknown): value is number {
  return (
    Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 16382
  );
}

function isBrowserTrustIntegrityIssue(
  value: unknown
): value is BrowserTrustIntegrityIssue {
  return (
    typeof value === "string" &&
    (BROWSER_TRUST_INTEGRITY_ISSUES as readonly string[]).includes(value)
  );
}

export function mergeIntegrityIssues(
  ...issueGroups: Array<Iterable<BrowserTrustIntegrityIssue>>
): BrowserTrustIntegrityIssue[] {
  const issues = new Set<BrowserTrustIntegrityIssue>();
  for (const group of issueGroups) {
    for (const issue of group) {
      issues.add(issue);
    }
  }
  return Array.from(issues).sort((left, right) => left.localeCompare(right));
}

export function parseStoredDeviceRegistration(
  value: unknown
): StoredDeviceRegistration | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredDeviceRegistration>;
  if (
    typeof candidate.deviceId !== "string" ||
    candidate.deviceId.length === 0 ||
    !isValidRegistrationId(candidate.registrationId) ||
    !Number.isInteger(candidate.spkId)
  ) {
    return null;
  }

  return {
    deviceId: candidate.deviceId,
    registrationId: Number(candidate.registrationId),
    spkId: Number(candidate.spkId),
  };
}

export function parseSafetyVerificationRecord(
  value: unknown
): StoredSafetyVerificationRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredSafetyVerificationRecord>;
  if (
    typeof candidate.safetyHash !== "string" ||
    candidate.safetyHash.length === 0 ||
    typeof candidate.verifiedAt !== "string" ||
    candidate.verifiedAt.length === 0
  ) {
    return null;
  }

  return {
    safetyHash: candidate.safetyHash,
    verifiedAt: candidate.verifiedAt,
  };
}

function populateDeviceRegistrations(
  candidate: Partial<BrowserTrustStore>,
  base: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>
): void {
  for (const [username, record] of Object.entries(
    candidate.deviceRegistrationsByUsername ?? {}
  )) {
    if (typeof username !== "string" || username.length === 0) continue;
    const parsed = parseStoredDeviceRegistration(record);
    if (parsed) {
      base.deviceRegistrationsByUsername[username] = parsed;
    } else {
      discoveredIssues.add("persisted_device_registration_invalid");
    }
  }
}

function populateSafetyVerifications(
  candidate: Partial<BrowserTrustStore>,
  base: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>
): void {
  for (const [recordKey, record] of Object.entries(
    candidate.safetyVerificationRecordsByKey ?? {}
  )) {
    if (typeof recordKey !== "string" || recordKey.length === 0) continue;
    const parsed = parseSafetyVerificationRecord(record);
    if (parsed) {
      base.safetyVerificationRecordsByKey[recordKey] = parsed;
    } else {
      discoveredIssues.add("persisted_safety_verification_invalid");
    }
  }
}

function populatePeerIdentityCache(
  candidate: Partial<BrowserTrustStore>,
  base: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>
): void {
  for (const [deviceId, identityKey] of Object.entries(
    candidate.peerIdentityCacheByDevice ?? {}
  )) {
    if (
      typeof deviceId === "string" &&
      deviceId.length > 0 &&
      typeof identityKey === "string" &&
      identityKey.length > 0
    ) {
      base.peerIdentityCacheByDevice[deviceId] = identityKey;
    } else {
      discoveredIssues.add("persisted_peer_identity_invalid");
    }
  }
}

export function sanitizeTrustStore(value: unknown): {
  store: BrowserTrustStore;
  discoveredIssues: BrowserTrustIntegrityIssue[];
} {
  const base = createEmptyTrustStore();
  const discoveredIssues = new Set<BrowserTrustIntegrityIssue>();
  if (!value || typeof value !== "object") {
    return { store: base, discoveredIssues: [] };
  }

  const candidate = value as Partial<BrowserTrustStore>;
  if (isValidRegistrationId(candidate.registrationId)) {
    base.registrationId = candidate.registrationId;
  } else if (candidate.registrationId !== undefined) {
    discoveredIssues.add("persisted_registration_id_invalid");
  }

  base.integrityIssues = Array.isArray(candidate.integrityIssues)
    ? candidate.integrityIssues.filter(isBrowserTrustIntegrityIssue)
    : [];
  if (
    typeof candidate.integrityDegradedAt === "string" &&
    candidate.integrityDegradedAt.length > 0
  ) {
    base.integrityDegradedAt = candidate.integrityDegradedAt;
  }

  populateDeviceRegistrations(candidate, base, discoveredIssues);
  populateSafetyVerifications(candidate, base, discoveredIssues);
  populatePeerIdentityCache(candidate, base, discoveredIssues);

  return {
    store: base,
    discoveredIssues: Array.from(discoveredIssues),
  };
}

export function applyDiscoveredIntegrityIssues(
  store: BrowserTrustStore,
  discoveredIssues: BrowserTrustIntegrityIssue[]
): { store: BrowserTrustStore; changed: boolean } {
  if (discoveredIssues.length === 0) {
    return { store, changed: false };
  }

  const nextIssues = mergeIntegrityIssues(store.integrityIssues, discoveredIssues);
  const changed =
    nextIssues.length !== store.integrityIssues.length ||
    nextIssues.some((issue, index) => issue !== store.integrityIssues[index]);
  if (!changed) {
    return { store, changed: false };
  }

  const shouldClearPeerIdentityCache = discoveredIssues.some(
    (issue) =>
      issue === "persisted_peer_identity_invalid" ||
      issue === "legacy_peer_identity_invalid"
  );

  return {
    store: {
      ...store,
      peerIdentityCacheByDevice: shouldClearPeerIdentityCache
        ? {}
        : store.peerIdentityCacheByDevice,
      integrityIssues: nextIssues,
      integrityDegradedAt: new Date().toISOString(),
    },
    changed: true,
  };
}
