import { fromBase64Url, toBase64Url } from "@seclettr/crypto";

const DIRECT_ENVELOPE_HEADER_BYTES = 40;
const DIRECT_ENVELOPE_MIN_BYTES = DIRECT_ENVELOPE_HEADER_BYTES + 1;

export const DIRECT_ENVELOPE_SCHEMA_VERSION = 1 as const;

interface EnvelopeVersionInfo {
  schemaVersion: number;
  payload: string;
}

export interface DirectEnvelopeHeader {
  dh: Uint8Array;
  pn: number;
  n: number;
}

export interface DecodedDirectEnvelope {
  schemaVersion: number;
  header: DirectEnvelopeHeader;
  ciphertext: Uint8Array;
}

function parseVersionedPrefix(ciphertext: string): EnvelopeVersionInfo {
  const match = /^v(\d+)\.(.+)$/.exec(ciphertext);
  if (!match) {
    return {
      schemaVersion: 0,
      payload: ciphertext,
    };
  }
  const version = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("DIRECT_ENVELOPE_INVALID_VERSION");
  }
  const payload = match[2] ?? "";
  if (!payload) {
    throw new Error("DIRECT_ENVELOPE_EMPTY_PAYLOAD");
  }
  return {
    schemaVersion: version,
    payload,
  };
}

function decodeCombinedEnvelope(combined: Uint8Array): Omit<DecodedDirectEnvelope, "schemaVersion"> {
  if (combined.length < DIRECT_ENVELOPE_MIN_BYTES) {
    throw new Error("DIRECT_ENVELOPE_TOO_SHORT");
  }

  const dh = combined.slice(0, 32);
  const pn = new DataView(combined.buffer, combined.byteOffset + 32, 4).getUint32(0, false);
  const n = new DataView(combined.buffer, combined.byteOffset + 36, 4).getUint32(0, false);
  const encryptedBody = combined.slice(DIRECT_ENVELOPE_HEADER_BYTES);
  if (encryptedBody.length === 0) {
    throw new Error("DIRECT_ENVELOPE_EMPTY_CIPHERTEXT");
  }

  return {
    header: { dh, pn, n },
    ciphertext: encryptedBody,
  };
}

export function encodeDirectEnvelope(header: DirectEnvelopeHeader, ciphertext: Uint8Array): string {
  const out = new Uint8Array(DIRECT_ENVELOPE_HEADER_BYTES + ciphertext.length);
  out.set(header.dh, 0);
  new DataView(out.buffer).setUint32(32, header.pn, false);
  new DataView(out.buffer).setUint32(36, header.n, false);
  out.set(ciphertext, DIRECT_ENVELOPE_HEADER_BYTES);
  return `v${DIRECT_ENVELOPE_SCHEMA_VERSION}.${toBase64Url(out)}`;
}

export function decodeDirectEnvelope(ciphertext: string): DecodedDirectEnvelope {
  const { schemaVersion, payload } = parseVersionedPrefix(ciphertext);
  if (schemaVersion > DIRECT_ENVELOPE_SCHEMA_VERSION) {
    throw new Error("DIRECT_ENVELOPE_UNSUPPORTED_VERSION");
  }
  const combined = fromBase64Url(payload);
  const decoded = decodeCombinedEnvelope(combined);
  return {
    schemaVersion,
    ...decoded,
  };
}
