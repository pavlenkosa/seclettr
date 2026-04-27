import { describe, expect, it } from "vitest";
import { computeCallSecurityCodes, extractSdpFingerprints } from "@/calls/direct/model/call-security";

const LOCAL_SDP = [
  "v=0",
  "o=- 551447378114430734 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=fingerprint:sha-256 76:67:01:63:24:9D:21:34:10:82:32:AB:67:11:CF:B2:20:05:C2:7C:A8:8B:D0:40:AB:F9:B4:90:76:CA:C9:12",
  "a=fingerprint:sha-256 76:67:01:63:24:9D:21:34:10:82:32:AB:67:11:CF:B2:20:05:C2:7C:A8:8B:D0:40:AB:F9:B4:90:76:CA:C9:12",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
].join("\r\n");

const REMOTE_SDP = [
  "v=0",
  "o=- 1063833793509385891 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=fingerprint:sha-256 84:90:88:7F:0C:BE:C2:31:44:66:E9:8A:6F:BD:D8:3D:A7:C1:C6:C2:42:50:9F:32:18:EE:B7:AD:5D:8A:1F:06",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
].join("\r\n");

describe("extractSdpFingerprints", () => {
  it("normalizes, deduplicates and sorts fingerprints", () => {
    expect(extractSdpFingerprints(LOCAL_SDP)).toEqual([
      "sha-256:76670163249d2134108232ab6711cfb22005c27ca88bd040abf9b49076cac912",
    ]);
  });

  it("returns empty when no fingerprint lines are present", () => {
    expect(extractSdpFingerprints("v=0\r\ns=-")).toEqual([]);
  });
});

describe("computeCallSecurityCodes", () => {
  it("derives deterministic code and hash", async () => {
    const result = await computeCallSecurityCodes(LOCAL_SDP, REMOTE_SDP);
    expect(result).not.toBeNull();
    expect(result?.shortCode).toMatch(/^\d{4} \d{4} \d{4}$/);
    expect(result?.fullCode).toMatch(/^(\d{5})( \d{5}){11}$/);
    expect(result?.safetyHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is symmetric for local/remote order", async () => {
    const left = await computeCallSecurityCodes(LOCAL_SDP, REMOTE_SDP);
    const right = await computeCallSecurityCodes(REMOTE_SDP, LOCAL_SDP);
    expect(left).toEqual(right);
  });

  it("returns null when one side has no fingerprints", async () => {
    const result = await computeCallSecurityCodes(LOCAL_SDP, "v=0\r\ns=-");
    expect(result).toBeNull();
  });
});
