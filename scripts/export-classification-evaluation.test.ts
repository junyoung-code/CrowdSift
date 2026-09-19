import { describe, expect, it } from "vitest";

import {
  buildReviewDocument,
  escapeInlineJson,
} from "./export-classification-evaluation";

describe("classification evaluation export", () => {
  it("keeps comment text from breaking the inline script", () => {
    expect(escapeInlineJson({ text: "</script><b>원문</b>" })).not.toContain(
      "</script>",
    );
  });

  it("builds a local reviewer with four outcomes and JSON download", () => {
    const html = buildReviewDocument([
      {
        id: "real-1",
        sourceText: "개맛있게 먹는다",
        videoTitle: "요리 영상",
        parentText: null,
        group: "thread-1",
        split: "holdout",
        expected: null,
        review: null,
        goldAnalysis: null,
        tags: [],
      },
    ]);

    expect(html).toContain("실제 댓글 분류 검수");
    expect(html).toContain("hold");
    expect(html).toContain("semantic-reviewed.json");
  });
});
