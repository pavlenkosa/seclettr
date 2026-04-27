import { describe, expect, it } from "vitest";
import { resolveGroupCallStageTileId } from "@/calls/group/model/group-call-stage";

describe("resolveGroupCallStageTileId", () => {
  it("keeps a valid pinned tile on stage", () => {
    expect(
      resolveGroupCallStageTileId(
        [
          { id: "local", isLocal: true, hasVideo: true, videoSource: "camera" },
          { id: "remote-screen", isLocal: false, hasVideo: true, videoSource: "screen" },
        ],
        "local"
      )
    ).toBe("local");
  });

  it("prioritizes a remote screen share when no tile is pinned", () => {
    expect(
      resolveGroupCallStageTileId(
        [
          { id: "local", isLocal: true, hasVideo: true, videoSource: "camera" },
          { id: "remote-screen", isLocal: false, hasVideo: true, videoSource: "screen" },
          { id: "remote-camera", isLocal: false, hasVideo: true, videoSource: "camera" },
        ],
        null
      )
    ).toBe("remote-screen");
  });

  it("promotes a local screen share above a remote camera when no remote screen is present", () => {
    expect(
      resolveGroupCallStageTileId(
        [
          { id: "local-screen", isLocal: true, hasVideo: true, videoSource: "screen" },
          { id: "remote-camera", isLocal: false, hasVideo: true, videoSource: "camera" },
        ],
        null
      )
    ).toBe("local-screen");
  });

  it("falls back to the first available tile when there is no video", () => {
    expect(
      resolveGroupCallStageTileId(
        [
          { id: "local", isLocal: true, hasVideo: false, videoSource: null },
          { id: "remote-audio", isLocal: false, hasVideo: false, videoSource: null },
        ],
        null
      )
    ).toBe("local");
  });
});
