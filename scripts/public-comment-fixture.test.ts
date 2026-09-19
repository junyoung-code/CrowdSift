import { describe, expect, it } from "vitest";
import { fixtureHash, PublicCommentFixtureSchema } from "./public-comment-fixture";

const fixture = () => ({
  schemaVersion: "public-comment-fixture-v1",
  source: "youtube-public-api",
  capturedAt: "2026-09-13T12:00:00.000Z",
  sampling: "test",
  videos: [{ videoId: "video", canonicalUrl: "https://www.youtube.com/watch?v=video", title: "title", channelId: "channel", channelTitle: "channel", commentCount: 2, requestedCount: 2, topLevelCount: 1, replyCount: 1 }],
  comments: [
    { id: "parent", videoId: "video", parentId: null, sourceText: "원문 <그대로>\n보존", publishedAt: null, likeCount: 0, raw: {} },
    { id: "reply", videoId: "video", parentId: "parent", sourceText: "저도요", publishedAt: null, likeCount: 1, raw: {} },
  ],
});

describe("public comment fixture integrity", () => {
  it("preserves source text and changes the fingerprint when parent context changes", () => {
    const source = PublicCommentFixtureSchema.parse(fixture());
    expect(source.comments[0].sourceText).toBe("원문 <그대로>\n보존");
    const original = fixtureHash(source);
    source.comments[0].sourceText = "다른 문맥";
    expect(fixtureHash(source)).not.toBe(original);
  });

  it("rejects orphan replies and replies linked to another video", () => {
    const source = fixture();
    source.comments[1].parentId = "missing";
    expect(PublicCommentFixtureSchema.safeParse(source).success).toBe(false);
    source.comments[1].parentId = "parent";
    source.comments[1].videoId = "other-video";
    expect(PublicCommentFixtureSchema.safeParse(source).success).toBe(false);
  });

  it("rejects duplicate IDs even when the reported counts match", () => {
    const source = fixture();
    source.comments[1].id = "parent";
    expect(PublicCommentFixtureSchema.safeParse(source).success).toBe(false);
  });

  it("rejects a silently shortened or over-limit capture", () => {
    const source = fixture();
    source.comments.pop();
    expect(PublicCommentFixtureSchema.safeParse(source).success).toBe(false);
    const overLimit = fixture();
    overLimit.videos[0].requestedCount = 1;
    expect(PublicCommentFixtureSchema.safeParse(overLimit).success).toBe(false);
  });
});
