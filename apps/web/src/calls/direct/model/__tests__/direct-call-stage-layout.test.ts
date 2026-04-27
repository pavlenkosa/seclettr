import { describe, expect, it } from "vitest";
import { resolveDirectCallStageLayout } from "@/calls/direct/model/direct-call-stage-layout";

describe("resolveDirectCallStageLayout", () => {
  it("returns audio stage when no remote visual media is renderable", () => {
    expect(resolveDirectCallStageLayout({
      hasRenderableRemoteCamera: false,
      hasRenderableRemoteScreen: false,
      preferredSource: null,
    })).toEqual({
      stageSource: "audio",
      companionSource: null,
      hasRemoteVisualMedia: false,
    });
  });

  it("defaults to screen on stage when camera and screen are both available", () => {
    expect(resolveDirectCallStageLayout({
      hasRenderableRemoteCamera: true,
      hasRenderableRemoteScreen: true,
      preferredSource: null,
    })).toEqual({
      stageSource: "screen",
      companionSource: "camera",
      hasRemoteVisualMedia: true,
    });
  });

  it("keeps camera on stage when user explicitly selected it", () => {
    expect(resolveDirectCallStageLayout({
      hasRenderableRemoteCamera: true,
      hasRenderableRemoteScreen: true,
      preferredSource: "camera",
    })).toEqual({
      stageSource: "camera",
      companionSource: "screen",
      hasRemoteVisualMedia: true,
    });
  });

  it("falls back to remaining source when preferred source disappears", () => {
    expect(resolveDirectCallStageLayout({
      hasRenderableRemoteCamera: false,
      hasRenderableRemoteScreen: true,
      preferredSource: "camera",
    })).toEqual({
      stageSource: "screen",
      companionSource: null,
      hasRemoteVisualMedia: true,
    });
  });

  it("keeps camera on stage when remote screen is locally suppressed", () => {
    expect(resolveDirectCallStageLayout({
      hasRenderableRemoteCamera: true,
      hasRenderableRemoteScreen: true,
      preferredSource: "screen",
      isRemoteScreenSuppressed: true,
    })).toEqual({
      stageSource: "camera",
      companionSource: null,
      hasRemoteVisualMedia: true,
    });
  });

  it("falls back to audio-only stage when the remote screen is the only visual source and is suppressed", () => {
    expect(resolveDirectCallStageLayout({
      hasRenderableRemoteCamera: false,
      hasRenderableRemoteScreen: true,
      preferredSource: "screen",
      isRemoteScreenSuppressed: true,
    })).toEqual({
      stageSource: "audio",
      companionSource: null,
      hasRemoteVisualMedia: true,
    });
  });
});
