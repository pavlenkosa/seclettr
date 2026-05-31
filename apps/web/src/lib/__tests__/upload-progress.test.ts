// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  shouldSkipDirectUploadForMixedContent,
  registerUpload,
  updateUploadProgress,
  unregisterUpload,
  cancelUpload,
  getUploadProgress,
  subscribeUploadProgress,
  setUploadLocalSource,
  getUploadLocalSource,
  clearUploadLocalSource,
  __uploadProgressTestUtils,
} from "@/lib/upload-progress";

describe("upload-progress mixed-content guard", () => {
  it("skips direct upload from HTTPS pages to HTTP upload URLs", () => {
    expect(
      shouldSkipDirectUploadForMixedContent(
        "http://minio:9000/seclettr-attachments",
        "https:"
      )
    ).toBe(true);
  });

  it("allows HTTPS upload URLs from HTTPS pages", () => {
    expect(
      shouldSkipDirectUploadForMixedContent(
        "https://uploads.example/seclettr-attachments",
        "https:"
      )
    ).toBe(false);
  });

  it("does not force proxy uploads on HTTP pages", () => {
    expect(
      shouldSkipDirectUploadForMixedContent(
        "http://minio:9000/seclettr-attachments",
        "http:"
      )
    ).toBe(false);
  });
});

describe("upload registry", () => {
  beforeEach(() => {
    __uploadProgressTestUtils.reset();
  });

  it("returns null progress for an unregistered message", () => {
    expect(getUploadProgress("msg-unknown")).toBeNull();
  });

  it("registers an upload with initial progress 0", () => {
    registerUpload("msg-1", () => {});
    expect(getUploadProgress("msg-1")).toBe(0);
  });

  it("updateUploadProgress notifies listeners and clamps values to 0–100", () => {
    const listener = vi.fn();
    registerUpload("msg-1", () => {});
    subscribeUploadProgress("msg-1", listener);

    updateUploadProgress("msg-1", 50);
    expect(listener).toHaveBeenLastCalledWith(50);
    expect(getUploadProgress("msg-1")).toBe(50);

    updateUploadProgress("msg-1", 150);
    expect(listener).toHaveBeenLastCalledWith(100);
  });

  it("unregisterUpload notifies listeners with null and removes the entry", () => {
    const listener = vi.fn();
    registerUpload("msg-1", () => {});
    subscribeUploadProgress("msg-1", listener);
    unregisterUpload("msg-1");

    expect(listener).toHaveBeenLastCalledWith(null);
    expect(getUploadProgress("msg-1")).toBeNull();
  });

  it("cancelUpload invokes abort, notifies listeners with null, and removes entry", () => {
    const abort = vi.fn();
    const listener = vi.fn();
    registerUpload("msg-1", abort);
    subscribeUploadProgress("msg-1", listener);
    cancelUpload("msg-1");

    expect(abort).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(getUploadProgress("msg-1")).toBeNull();
  });

  it("subscribeUploadProgress returns an unsubscribe function", () => {
    const listener = vi.fn();
    registerUpload("msg-1", () => {});
    const unsubscribe = subscribeUploadProgress("msg-1", listener);
    unsubscribe();
    updateUploadProgress("msg-1", 75);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("local source registry", () => {
  beforeEach(() => {
    __uploadProgressTestUtils.reset();
  });

  it("sets and retrieves a local blob source", () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    setUploadLocalSource("msg-2", blob);
    expect(getUploadLocalSource("msg-2")).toBe(blob);
  });

  it("clearUploadLocalSource removes the entry", () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    setUploadLocalSource("msg-2", blob);
    clearUploadLocalSource("msg-2");
    expect(getUploadLocalSource("msg-2")).toBeNull();
  });

  it("setUploadLocalSource replaces a previous entry and clears its timer", () => {
    const blob1 = new Blob(["a"], { type: "text/plain" });
    const blob2 = new Blob(["b"], { type: "text/plain" });
    setUploadLocalSource("msg-2", blob1);
    setUploadLocalSource("msg-2", blob2);
    expect(getUploadLocalSource("msg-2")).toBe(blob2);
  });

  it("getUploadLocalSource returns null for an unregistered message", () => {
    expect(getUploadLocalSource("msg-unknown")).toBeNull();
  });
});
