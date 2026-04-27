export interface CallSecurityCodes {
  shortCode: string;
  fullCode: string;
  safetyHash: string;
}

const FINGERPRINT_LINE = /^a=fingerprint:([A-Za-z0-9-]+)\s+([0-9A-Fa-f:]+)$/;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normaliseFingerprint(algorithm: string, value: string): string {
  return `${algorithm.toLowerCase()}:${value.replaceAll(":", "").toLowerCase()}`;
}

/**
 * Extracts canonical DTLS fingerprints from SDP.
 * Output is deduplicated and sorted for deterministic code derivation.
 */
export function extractSdpFingerprints(sdp: string): string[] {
  const values = new Set<string>();
  for (const rawLine of sdp.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = FINGERPRINT_LINE.exec(line);
    if (!match) continue;
    values.add(normaliseFingerprint(match[1]!, match[2]!));
  }
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

/**
 * Deterministic call verification material derived from negotiated DTLS fingerprints.
 * Both peers compute the same code because local/remote sets are sorted canonically.
 */
export async function computeCallSecurityCodes(
  localSdp: string,
  remoteSdp: string
): Promise<CallSecurityCodes | null> {
  const localFingerprints = extractSdpFingerprints(localSdp);
  const remoteFingerprints = extractSdpFingerprints(remoteSdp);
  if (localFingerprints.length === 0 || remoteFingerprints.length === 0) {
    return null;
  }

  const [firstSide, secondSide] = [
    localFingerprints.join("|"),
    remoteFingerprints.join("|"),
  ].sort((left, right) => left.localeCompare(right));

  const material = `qm-call-v1|${firstSide}|${secondSide}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  const hashBytes = new Uint8Array(digest);

  const shortGroups: string[] = [];
  for (let i = 0; i < 3; i++) {
    const idx = i * 2;
    const val = (hashBytes[idx]! << 8) | hashBytes[idx + 1]!;
    shortGroups.push(String(val % 10000).padStart(4, "0"));
  }

  const fullGroups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const idx = i * 2;
    const val = (hashBytes[idx]! << 8) | hashBytes[idx + 1]!;
    fullGroups.push(String(val % 100000).padStart(5, "0"));
  }

  return {
    shortCode: shortGroups.join(" "),
    fullCode: fullGroups.join(" "),
    safetyHash: bytesToHex(hashBytes.slice(0, 16)),
  };
}
