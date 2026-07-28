import { describe, expect, it } from "vitest";

import { parsePublicImportRequest } from "./public-import-contract";

const URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("parsePublicImportRequest", () => {
  it("defaults to a total of 20 comments", () => {
    expect(
      parsePublicImportRequest({
        url: URL,
        requestedTotalCount: undefined,
      }),
    ).toEqual({
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: URL,
      requestedTotalCount: 20,
    });
  });

  it.each([20, 50, 100, 1000])("accepts the approved count %s", (count) => {
    expect(
      parsePublicImportRequest({
        url: URL,
        requestedTotalCount: String(count),
      }).requestedTotalCount,
    ).toBe(count);
  });

  it.each([0, 21, 999, 1001])("rejects unsupported count %s", (count) => {
    expect(() =>
      parsePublicImportRequest({
        url: URL,
        requestedTotalCount: count,
      }),
    ).toThrow("invalid_public_import_request");
  });
});
