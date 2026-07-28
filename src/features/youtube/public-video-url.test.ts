import { describe, expect, it } from "vitest";

import {
  parsePublicYouTubeVideoUrl,
  PUBLIC_COMMENT_COUNTS,
  publicCommentCountSchema,
} from "./public-video-url";

describe("parsePublicYouTubeVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=3", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=3", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("parses %s", (input, videoId) => {
    expect(parsePublicYouTubeVideoUrl(input)).toEqual({
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/channel/UC123",
    "https://youtube.com/embed/dQw4w9WgXcQ",
    "javascript:alert(1)",
    "not a URL",
  ])("rejects unsupported input %s", (input) => {
    expect(() => parsePublicYouTubeVideoUrl(input)).toThrow(
      /지원하는 YouTube 영상 URL/,
    );
  });

  it("rejects an invalid YouTube video id", () => {
    expect(() =>
      parsePublicYouTubeVideoUrl("https://youtube.com/watch?v=too-short"),
    ).toThrow(/지원하는 YouTube 영상 URL/);
  });
});

describe("publicCommentCountSchema", () => {
  it("supports exactly the approved total-comment choices", () => {
    expect(PUBLIC_COMMENT_COUNTS).toEqual([20, 50, 100, 1000]);

    for (const count of PUBLIC_COMMENT_COUNTS) {
      expect(publicCommentCountSchema.parse(count)).toBe(count);
    }
  });

  it.each([0, 19, 21, 999, 1001])("rejects an unsupported count: %s", (count) => {
    expect(() => publicCommentCountSchema.parse(count)).toThrow();
  });
});
