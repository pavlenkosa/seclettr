// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { shouldSkipDirectUploadForMixedContent } from "@/lib/upload-progress";

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
