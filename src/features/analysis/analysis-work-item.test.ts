import { describe, expect, it } from "vitest";

import { buildAnalysisWorkItems } from "./analysis-work-item";

describe("buildAnalysisWorkItems", () => {
  it("builds a stage-one item from source, policy, and same-thread context", () => {
    const result = buildAnalysisWorkItems({
      claims: [
        {
          itemId: "item-1",
          rawCommentId: "reply-1",
          workspaceId: "workspace-1",
        },
      ],
      rawComments: [
        {
          id: "top-1",
          workspaceId: "workspace-1",
          youtubeVideoId: "video-1",
          parentRawCommentId: null,
          textDisplay: "첫 댓글",
          textOriginal: null,
        },
        {
          id: "reply-1",
          workspaceId: "workspace-1",
          youtubeVideoId: "video-1",
          parentRawCommentId: "top-1",
          textDisplay: "표시 텍스트",
          textOriginal: "보존된 원문",
        },
      ],
      videos: [{ youtubeVideoId: "video-1", title: "영상 제목" }],
      policy: {
        version: 2,
        categorySensitivity: { level: "high" },
        preferredActions: {
          caution: "review",
          risk: "hold_for_review",
        },
        harmfulTextHidden: true,
      },
      rules: [
        {
          id: "rule-1",
          kind: "blocked",
          phrase: "광고",
          normalizedPhrase: "광고",
          contextNote: null,
          enabled: true,
          version: 2,
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "item-1",
      sourceText: "보존된 원문",
      videoTitle: "영상 제목",
      threadContext: ["첫 댓글"],
      policy: {
        version: 2,
        sensitivity: "high",
      },
    });
  });

  it("rejects a claimed item whose source is outside the workspace", () => {
    expect(() =>
      buildAnalysisWorkItems({
        claims: [
          {
            itemId: "item-1",
            rawCommentId: "raw-1",
            workspaceId: "workspace-1",
          },
        ],
        rawComments: [
          {
            id: "raw-1",
            workspaceId: "workspace-2",
            youtubeVideoId: "video-1",
            parentRawCommentId: null,
            textDisplay: "다른 workspace 댓글",
            textOriginal: null,
          },
        ],
        videos: [{ youtubeVideoId: "video-1", title: "영상" }],
        policy: {
          version: 1,
          categorySensitivity: {},
          preferredActions: {},
          harmfulTextHidden: true,
        },
        rules: [],
      }),
    ).toThrow("analysis_source_scope_mismatch");
  });
});
