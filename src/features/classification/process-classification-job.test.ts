import { describe, expect, it } from "vitest";

import { buildClassificationWorkItems } from "./classification-work-item";
import { DEFAULT_CLASSIFICATION_PROFILE } from "./schemas";

describe("buildClassificationWorkItems", () => {
  it("maps claimed comments to the model input without changing source text", () => {
    expect(
      buildClassificationWorkItems({
        claims: [
          {
            itemId: "item-1",
            rawCommentId: "comment-1",
            workspaceId: "workspace-1",
          },
        ],
        rawComments: [
          {
            id: "comment-1",
            workspaceId: "workspace-1",
            youtubeVideoId: "video-1",
            youtubeCommentId: "youtube-comment-1",
            parentYoutubeCommentId: null,
            textDisplay: "  편집 개느리네.  ",
          },
        ],
        videos: [{ youtubeVideoId: "video-1", title: "영상 제목" }],
        channelId: "channel-1",
        policyVersion: 3,
      }),
    ).toEqual([
      {
        id: "item-1",
        rawCommentId: "comment-1",
        workspaceId: "workspace-1",
        sourceText: "  편집 개느리네.  ",
        videoTitle: "영상 제목",
        channelId: "channel-1",
        policyVersion: 3,
        profile: DEFAULT_CLASSIFICATION_PROFILE,
        similarExamples: [],
        parent: null,
      },
    ]);
  });

  it("adds the parent source when the claimed comment is a reply", () => {
    const [reply] = buildClassificationWorkItems({
      claims: [
        {
          itemId: "item-reply",
          rawCommentId: "comment-reply",
          workspaceId: "workspace-1",
        },
      ],
      rawComments: [
        {
          id: "comment-reply",
          workspaceId: "workspace-1",
          youtubeVideoId: "video-1",
          youtubeCommentId: "youtube-comment-reply",
          parentYoutubeCommentId: "youtube-comment-parent",
          textDisplay: "ㄹㅇ 인정.",
        },
        {
          id: "comment-parent",
          workspaceId: "workspace-1",
          youtubeVideoId: "video-1",
          youtubeCommentId: "youtube-comment-parent",
          parentYoutubeCommentId: null,
          textDisplay: "영상이 조금 길었어요.",
        },
      ],
      videos: [{ youtubeVideoId: "video-1", title: "영상 제목" }],
      channelId: "channel-1",
      policyVersion: 3,
    });

    expect(reply.parent).toEqual({
      id: "comment-parent",
      text: "영상이 조금 길었어요.",
    });
  });

  it("fails closed when a claimed comment is missing its source row", () => {
    expect(() =>
      buildClassificationWorkItems({
        claims: [
          {
            itemId: "item-1",
            rawCommentId: "missing-comment",
            workspaceId: "workspace-1",
          },
        ],
        rawComments: [],
        videos: [],
        channelId: "channel-1",
        policyVersion: 1,
      }),
    ).toThrow("classification_source_missing");
  });
});
