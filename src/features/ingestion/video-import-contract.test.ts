import { describe, expect, it } from "vitest";

import {
  getImportFailureMessage,
  parseVideoImportRequest,
} from "./video-import-contract";

describe("parseVideoImportRequest", () => {
  it.each([20, 30, 50])("accepts the supported top-level limit %i", (limit) => {
    expect(
      parseVideoImportRequest({
        topLevelLimit: String(limit),
        youtubeVideoId: "video-123",
      }),
    ).toEqual({
      topLevelLimit: limit,
      youtubeVideoId: "video-123",
    });
  });

  it.each([19, 51, "not-a-number"])(
    "rejects the unsupported top-level limit %s",
    (limit) => {
      expect(() =>
        parseVideoImportRequest({
          topLevelLimit: String(limit),
          youtubeVideoId: "video-123",
        }),
      ).toThrow("invalid_import_request");
    },
  );
});

describe("getImportFailureMessage", () => {
  it("explains provider failures as distinct Korean states", () => {
    expect(getImportFailureMessage("comments_disabled")).toContain(
      "댓글 사용이 중지",
    );
    expect(getImportFailureMessage("quota_exceeded")).toContain("할당량");
    expect(getImportFailureMessage("permission_revoked")).toContain("권한");
  });
});
